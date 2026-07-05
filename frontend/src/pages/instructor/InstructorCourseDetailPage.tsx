import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface InstructorInfo {
  id: string
  fullName?: string | null
  username?: string | null
  email?: string | null
}

interface SectionInfo {
  id: string
  name: string
  semester: string
  instructor: InstructorInfo | null
  createdAt: string
}

interface SectionExercise {
  assignmentId: string
  exerciseId: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  deadline: string | null
  isAssessment: boolean
  isVisible: boolean
  allowSubmission: boolean
  maxSubmissions: number | null
  week: number | null
  assignedAt: string
}

interface SectionDetail {
  section: SectionInfo
  exercises: SectionExercise[]
  studentCount: number
  exerciseCount: number
}

interface SubmissionRecord {
  id: string
  studentId: string
  studentName: string
  studentUsername: string
  score: number | null
  submittedAt: string
}

interface LeaderboardEntry {
  rank: number
  studentName: string
  studentId: string
  totalScore: number
}

const TOTAL_WEEKS = 15
const SUBMISSION_LIMIT_OPTIONS = [0, 3, 5, 8, 10, 20, 50, 100]

export function InstructorCourseDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [detail, setDetail] = useState<SectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)

  // Submissions lists keyed by exerciseId
  const [submissionsByEx, setSubmissionsByEx] = useState<Record<string, SubmissionRecord[]>>({})
  const [loadingSubmissions, setLoadingSubmissions] = useState<Record<string, boolean>>({})
  const [expandedEx, setExpandedEx] = useState<Record<string, boolean>>({})

  // Mini-leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false)
  const [maxPossibleScore, setMaxPossibleScore] = useState<number>(0)

  useEffect(() => {
    if (id) {
      fetchDetail()
      fetchLeaderboard()
    }
  }, [id])

  async function fetchDetail() {
    setLoading(true)
    setAccessError(null)
    try {
      const response = await api.get(`/api/instructor/sections/${id}/detail`)
      setDetail(response.data)
    } catch (error) {
      const status = (error as AxiosError)?.response?.status
      if (status === 403) {
        setAccessError('Bạn không có quyền truy cập lớp này.')
      } else if (status === 404) {
        setAccessError('Không tìm thấy lớp học này.')
      } else {
        toast.error('Không thể tải thông tin lớp. Vui lòng thử lại.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function fetchLeaderboard() {
    if (!id) return
    setLoadingLeaderboard(true)
    try {
      const response = await api.get(`/api/sections/${id}/leaderboard`)
      const data: LeaderboardEntry[] = response.data.leaderboard ?? response.data ?? []
      setLeaderboard(data.slice(0, 10)) // top 10 only
      setMaxPossibleScore(response.data.maxPossibleScore ?? 0)
    } catch {
      // Ignore leaderboard failures on this screen
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  async function handleUpdateAssignmentSettings(
    exerciseId: string,
    patch: { isVisible?: boolean; allowSubmission?: boolean; maxSubmissions?: number | null }
  ) {
    if (!id) return

    try {
      const response = await api.put(`/api/instructor/sections/${id}/schedule/settings`, {
        exercise_id: exerciseId,
        ...(patch.isVisible !== undefined ? { is_visible: patch.isVisible } : {}),
        ...(patch.allowSubmission !== undefined ? { allow_submission: patch.allowSubmission } : {}),
        ...(patch.maxSubmissions !== undefined ? { max_submissions: patch.maxSubmissions } : {}),
      })

      const next = response.data
      if (detail) {
        setDetail({
          ...detail,
          exercises: detail.exercises.map((ex) =>
            ex.exerciseId === exerciseId
              ? {
                  ...ex,
                  isVisible: next.isVisible ?? ex.isVisible,
                  allowSubmission: next.allowSubmission ?? ex.allowSubmission,
                  maxSubmissions: next.maxSubmissions ?? null,
                }
              : ex
          ),
        })
      }

      toast.success('Đã cập nhật cấu hình bài tập.')
    } catch {
      toast.error('Không thể cập nhật cấu hình bài tập.')
    }
  }

  // Lazy-load submission attempts for a selected exercise
  async function toggleSubmissionsList(exerciseId: string) {
    const isExpanded = !!expandedEx[exerciseId]
    setExpandedEx((prev) => ({ ...prev, [exerciseId]: !isExpanded }))

    if (isExpanded || submissionsByEx[exerciseId]) {
      return // collapse or already loaded
    }

    setLoadingSubmissions((prev) => ({ ...prev, [exerciseId]: true }))
    try {
      const response = await api.get(`/api/submissions`, {
        params: { section_id: id, exercise_id: exerciseId },
      })
      // The API returns an array of submissions with user/student details
      interface ApiSubmission {
        id: string
        studentId: string
        student?: {
          username?: string
          fullName?: string
        } | null
        score: number | null
        submittedAt: string
      }
      const list = (response.data ?? []).map((sub: ApiSubmission) => ({
        id: sub.id,
        studentId: sub.studentId,
        studentName: sub.student?.fullName || sub.student?.username || 'Sinh viên',
        studentUsername: sub.student?.username || '',
        score: sub.score,
        submittedAt: sub.submittedAt,
      }))
      setSubmissionsByEx((prev) => ({ ...prev, [exerciseId]: list }))
    } catch {
      toast.error('Không thể tải lịch sử nộp bài.')
    } finally {
      setLoadingSubmissions((prev) => ({ ...prev, [exerciseId]: false }))
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải thông tin khóa học..." />
  }

  if (accessError) {
    return (
      <div className="card flex flex-col items-center justify-center p-12 text-center">
        <p className="text-gray-600">{accessError}</p>
        <Link to="/instructor/classes" className="btn-secondary btn-sm mt-4">
          ← Quay lại danh sách lớp
        </Link>
      </div>
    )
  }

  if (!detail) {
    return null
  }

  const { section, exercises } = detail

  // Group exercises by week 1..15
  const exercisesByWeek: Record<number, SectionExercise[]> = {}
  for (let i = 1; i <= TOTAL_WEEKS; i++) exercisesByWeek[i] = []
  const unscheduledExercises: SectionExercise[] = []
  for (const ex of exercises) {
    const w = ex.week ?? 0
    if (w >= 1 && w <= TOTAL_WEEKS) {
      exercisesByWeek[w].push(ex)
    } else {
      unscheduledExercises.push(ex)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs are global, we just render clean columns layout */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        
        {/* Left Column: Weekly list (75% width) */}
        <div className="space-y-5 lg:w-3/4">
          {unscheduledExercises.length > 0 && (
            <WeekPanel
              title="CHƯA XẾP TUẦN"
              subtitle={`${unscheduledExercises.length} bài tập cần xếp lịch`}
              exercises={unscheduledExercises}
              expandedEx={expandedEx}
              submissionsByEx={submissionsByEx}
              loadingSubmissions={loadingSubmissions}
              onUpdateSettings={handleUpdateAssignmentSettings}
              onToggleSubmissions={toggleSubmissionsList}
            />
          )}

          {[...Array(TOTAL_WEEKS)].map((_, i) => {
            const weekNum = i + 1
            const weekExercises = exercisesByWeek[weekNum] || []

            return (
              <WeekPanel
                key={weekNum}
                title={`TUẦN ${weekNum}`}
                subtitle=""
                exercises={weekExercises}
                expandedEx={expandedEx}
                submissionsByEx={submissionsByEx}
                loadingSubmissions={loadingSubmissions}
                onUpdateSettings={handleUpdateAssignmentSettings}
                onToggleSubmissions={toggleSubmissionsList}
              />
            )
          })}
        </div>

        {/* Right Column: Sidebar (25% width) */}
        <div className="space-y-5 lg:w-1/4 lg:sticky lg:top-4">
          
          {/* Action buttons */}
          <div className="space-y-3">
            <Link
              to={`/instructor/classes/${section.id}/schedule`}
              className="bg-[#22a6b3] text-white hover:bg-[#1b8a94] flex w-full items-center justify-center gap-1.5 text-sm font-black py-2 rounded-lg text-center uppercase tracking-wide shadow-sm transition-colors cursor-pointer"
            >
              Chọn bài tập
            </Link>
            <Link
              to={`/instructor/classes/${section.id}/students`}
              className="border border-[#22a6b3] text-[#22a6b3] hover:bg-slate-50 flex w-full items-center justify-center gap-1.5 text-sm font-black py-2 rounded-lg text-center uppercase tracking-wide bg-white shadow-sm transition-colors cursor-pointer"
            >
              Danh sách sinh viên
            </Link>
          </div>

          {/* Mini-leaderboard Widget */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-[#00adb5] text-white px-4 py-2.5 flex items-center gap-2 rounded-t-lg font-bold text-xs uppercase tracking-wide select-none">
              <span>☰</span> Bảng Xếp Hạng
            </div>
            
            <div className="p-4">
              <div className="bg-[#0284c7] text-white px-3 py-1.5 rounded text-xs font-bold text-center uppercase mb-3 shadow-sm select-none">
                {section.name}
              </div>

              {loadingLeaderboard ? (
                <div className="flex items-center gap-2 py-4 justify-center text-xs text-slate-400">
                  <Spinner /> Đang tải xếp hạng...
                </div>
              ) : leaderboard.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4 italic font-medium">Chưa có xếp hạng lớp.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-xs">
                  {leaderboard.map((item, idx) => (
                    <li key={item.studentId} className="flex items-center justify-between py-2 text-xs border-b border-slate-100 last:border-b-0">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-800 w-4 text-center">
                          {idx + 1}
                        </span>
                        <Link
                          to={`/instructor/classes/${section.id}/students/${item.studentId}/profile`}
                          className="text-sky-600 font-semibold hover:underline truncate max-w-[130px]"
                          title={item.studentName}
                        >
                          {item.studentName}
                        </Link>
                      </div>
                      <span className="font-bold text-sky-600">
                        {item.totalScore.toFixed(0)}/{maxPossibleScore || 2201}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  )
}

function getWeekDeadline(exercises: SectionExercise[]): string {
  const activeWithDeadline = exercises.find((ex) => ex.deadline)
  if (!activeWithDeadline || !activeWithDeadline.deadline) return ''
  try {
    const d = new Date(activeWithDeadline.deadline)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `Hạn nộp: ${day}/${month}/${year}`
  } catch {
    return ''
  }
}

interface WeekPanelProps {
  title: string
  subtitle: string
  exercises: SectionExercise[]
  expandedEx: Record<string, boolean>
  submissionsByEx: Record<string, SubmissionRecord[]>
  loadingSubmissions: Record<string, boolean>
  onUpdateSettings: (
    exerciseId: string,
    patch: { isVisible?: boolean; allowSubmission?: boolean; maxSubmissions?: number | null }
  ) => void
  onToggleSubmissions: (exerciseId: string) => void
}

function WeekPanel({
  title,
  subtitle,
  exercises,
  expandedEx,
  submissionsByEx,
  loadingSubmissions,
  onUpdateSettings,
  onToggleSubmissions,
}: WeekPanelProps) {
  const deadlineText = getWeekDeadline(exercises) || subtitle

  return (
    <div className="space-y-2">
      {/* Week Header Strip */}
      <div className="flex items-center justify-between bg-slate-100 border border-slate-200/80 px-4 py-2.5 rounded-lg text-slate-800 font-bold text-xs uppercase select-none tracking-wide">
        <div className="flex items-center gap-1.5">
          <span>{title}</span>
          {deadlineText && <span className="text-[11px] font-bold text-slate-500 normal-case ml-1.5">({deadlineText})</span>}
        </div>
        <span className="text-[10px] font-semibold text-slate-400 lowercase">
          {exercises.length} bài tập được gán
        </span>
      </div>

      {/* Exercises Stack */}
      <div className="space-y-2 pl-1.5">
        {exercises.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 italic pl-3">
            Không có bài tập nào được phân lịch trong tuần này.
          </p>
        ) : (
          exercises.map((ex) => {
            const isExpanded = !!expandedEx[ex.exerciseId]
            const list = submissionsByEx[ex.exerciseId] || []
            const isLoadingList = !!loadingSubmissions[ex.exerciseId]

            return (
              <div
                key={ex.assignmentId}
                className="flex flex-col border border-slate-200/85 rounded-lg p-2.5 bg-[#f8f9fa] hover:bg-[#f1f3f5] transition-colors duration-150 shadow-sm"
              >
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">{ex.title}</span>
                    {ex.isAssessment && (
                      <span className="badge-yellow text-[9px] px-1 py-0.5 font-bold uppercase">Kiểm tra</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Max Submissions Selector Dropdown */}
                    <div className="flex items-center">
                      <select
                        value={ex.maxSubmissions ?? 10}
                        onChange={(e) => onUpdateSettings(ex.exerciseId, { maxSubmissions: Number(e.target.value) })}
                        className="h-7 rounded border border-slate-300 bg-white px-2 py-0 text-xs font-bold text-slate-700 outline-none focus:border-sky-500 cursor-pointer shadow-sm"
                      >
                        {SUBMISSION_LIMIT_OPTIONS.map((limit) => (
                          <option key={limit} value={limit}>
                            {limit}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Allow submission sliding toggle */}
                    <button
                      type="button"
                      onClick={() => onUpdateSettings(ex.exerciseId, { allowSubmission: !ex.allowSubmission })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full items-center transition-colors duration-200 ease-in-out outline-none border border-slate-200 shadow-sm ${
                        ex.allowSubmission ? 'bg-sky-500' : 'bg-slate-300'
                      }`}
                      title="Cho phép nộp bài"
                    >
                      <span
                        className={`absolute text-[8px] font-black text-white select-none ${
                          ex.allowSubmission ? 'left-1.5' : 'right-1.5'
                        }`}
                      >
                        {ex.allowSubmission ? '✓' : '×'}
                      </span>
                      <span
                        className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          ex.allowSubmission ? 'translate-x-5.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    {/* Visibility checkmark box */}
                    <button
                      type="button"
                      onClick={() => onUpdateSettings(ex.exerciseId, { isVisible: !ex.isVisible })}
                      className={`h-6.5 w-6.5 rounded flex items-center justify-center font-bold text-xs transition-colors shadow-sm outline-none cursor-pointer border border-slate-200 ${
                        ex.isVisible ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-300 hover:bg-slate-400 text-slate-500'
                      }`}
                      title={ex.isVisible ? 'Hiển thị' : 'Đang ẩn'}
                    >
                      {ex.isVisible ? '✓' : '×'}
                    </button>

                    {/* Submissions list trigger */}
                    <button
                      type="button"
                      onClick={() => onToggleSubmissions(ex.exerciseId)}
                      className={`h-7 rounded border px-2.5 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer outline-none border-slate-300 ${
                        isExpanded
                          ? 'bg-teal-50 text-teal-700 border-teal-200'
                          : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      Bài nộp ({isLoadingList ? '...' : (list.length || 0)})
                      <span className="text-[9px]">{isExpanded ? '▲' : '▼'}</span>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-200 pt-2.5 mt-2 space-y-2">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                      Danh sách bài nộp của sinh viên
                    </h4>

                    {isLoadingList ? (
                      <div className="flex items-center gap-2 py-3 justify-center text-xs text-slate-400">
                        <Spinner /> Đang tải bài nộp...
                      </div>
                    ) : list.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2 italic text-center font-medium">Chưa có lượt nộp bài nào.</p>
                    ) : (
                      <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-lg text-xs">
                        <table className="min-w-full divide-y divide-slate-100 text-left">
                          <thead className="bg-slate-50 text-slate-500 font-bold">
                            <tr>
                              <th className="px-3 py-2 w-12 text-center">#</th>
                              <th className="px-3 py-2">Mã SV</th>
                              <th className="px-3 py-2">Họ tên</th>
                              <th className="px-3 py-2">Thời gian</th>
                              <th className="px-3 py-2 text-right">Điểm</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 text-slate-700">
                            {list.map((sub, idx) => (
                              <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-2 text-center text-slate-400 font-bold">{idx + 1}</td>
                                <td className="px-3 py-2 font-semibold">
                                  <Link to="/instructor/submissions" className="text-primary hover:underline">
                                    {sub.studentUsername}
                                  </Link>
                                </td>
                                <td className="px-3 py-2 font-medium">{sub.studentName}</td>
                                <td className="px-3 py-2 text-slate-500 font-medium">
                                  {new Date(sub.submittedAt).toLocaleString('vi-VN')}
                                </td>
                                <td className="px-3 py-2 text-right font-bold text-primary">
                                  {sub.score != null ? sub.score.toFixed(1) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
// Trigger frontend redeployment
