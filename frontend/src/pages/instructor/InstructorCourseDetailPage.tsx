import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { api, cachedGet } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName } from '../../utils/semester'

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

interface LeaderboardEntry {
  rank: number
  studentName: string
  studentId: string
  totalScore: number
}

type AssignmentSettingsPatch = {
  isVisible?: boolean
  allowSubmission?: boolean
  maxSubmissions?: number | null
  isAssessment?: boolean
}

const TOTAL_WEEKS = 10
const SUBMISSION_LIMIT_OPTIONS = [0, 3, 5, 8, 10, 20, 50, 100]

export function InstructorCourseDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [detail, setDetail] = useState<SectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)



  // Mini-leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false)
  const [maxPossibleScore, setMaxPossibleScore] = useState<number>(0)
  const settingsSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingSettingsPatches = useRef<Record<string, AssignmentSettingsPatch>>({})
  const settingsSaveVersions = useRef<Record<string, number>>({})

  useEffect(() => {
    if (id) {
      fetchDetail()
      fetchLeaderboard()
    }
  }, [id])

  useEffect(() => {
    return () => {
      Object.values(settingsSaveTimers.current).forEach(clearTimeout)
    }
  }, [])

  async function fetchDetail() {
    setLoading(true)
    setAccessError(null)
    try {
      const response = await cachedGet(`/api/instructor/sections/${id}/detail`, undefined, { ttlMs: 30_000 })
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
      const response = await cachedGet(`/api/sections/${id}/leaderboard`, undefined, { ttlMs: 30_000 })
      const data: LeaderboardEntry[] = response.data.leaderboard ?? response.data ?? []
      setLeaderboard(data.slice(0, 10)) // top 10 only
      setMaxPossibleScore(response.data.maxPossibleScore ?? 0)
    } catch {
      // Ignore leaderboard failures on this screen
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  function handleUpdateAssignmentSettings(exerciseId: string, patch: AssignmentSettingsPatch) {
    if (!id) return

    setDetail((current) => {
      if (!current) return current
      return {
        ...current,
        exercises: current.exercises.map((ex) =>
          ex.exerciseId === exerciseId
            ? {
                ...ex,
                ...(patch.isVisible !== undefined ? { isVisible: patch.isVisible } : {}),
                ...(patch.allowSubmission !== undefined ? { allowSubmission: patch.allowSubmission } : {}),
                ...(patch.maxSubmissions !== undefined ? { maxSubmissions: patch.maxSubmissions } : {}),
                ...(patch.isAssessment !== undefined ? { isAssessment: patch.isAssessment } : {}),
              }
            : ex
        ),
      }
    })

    pendingSettingsPatches.current[exerciseId] = {
      ...(pendingSettingsPatches.current[exerciseId] ?? {}),
      ...patch,
    }
    settingsSaveVersions.current[exerciseId] = (settingsSaveVersions.current[exerciseId] ?? 0) + 1
    const saveVersion = settingsSaveVersions.current[exerciseId]

    if (settingsSaveTimers.current[exerciseId]) {
      clearTimeout(settingsSaveTimers.current[exerciseId])
    }

    settingsSaveTimers.current[exerciseId] = setTimeout(async () => {
      const pendingPatch = pendingSettingsPatches.current[exerciseId]
      if (!pendingPatch) return
      delete pendingSettingsPatches.current[exerciseId]

      try {
        await api.put(`/api/instructor/sections/${id}/schedule/settings`, {
          exercise_id: exerciseId,
          ...(pendingPatch.isVisible !== undefined ? { is_visible: pendingPatch.isVisible } : {}),
          ...(pendingPatch.allowSubmission !== undefined ? { allow_submission: pendingPatch.allowSubmission } : {}),
          ...(pendingPatch.maxSubmissions !== undefined ? { max_submissions: pendingPatch.maxSubmissions } : {}),
          ...(pendingPatch.isAssessment !== undefined ? { is_assessment: pendingPatch.isAssessment } : {}),
        })
      } catch {
        if (settingsSaveVersions.current[exerciseId] === saveVersion) {
          toast.error('Không thể lưu cấu hình bài tập. Dữ liệu sẽ được tải lại.')
          fetchDetail()
        }
      } finally {
        if (settingsSaveTimers.current[exerciseId]) {
          delete settingsSaveTimers.current[exerciseId]
        }
      }
    }, 350)
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

  // Group exercises by the default 10-week course timeline.
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
              sectionId={section.id}
              onUpdateSettings={handleUpdateAssignmentSettings}
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
                sectionId={section.id}
                onUpdateSettings={handleUpdateAssignmentSettings}
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
                {formatSectionDisplayName(section.name)}
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
                          {idx + 1 === 1 ? (
                            <span className="text-sm filter drop-shadow-sm select-none" title="Huy chương Vàng">🥇</span>
                          ) : idx + 1 === 2 ? (
                            <span className="text-sm filter drop-shadow-sm select-none" title="Huy chương Bạc">🥈</span>
                          ) : idx + 1 === 3 ? (
                            <span className="text-sm filter drop-shadow-sm select-none" title="Huy chương Đồng">🥉</span>
                          ) : (
                            idx + 1
                          )}
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
  sectionId: string
  onUpdateSettings: (
    exerciseId: string,
    patch: AssignmentSettingsPatch
  ) => void
}

function WeekPanel({
  title,
  subtitle,
  exercises,
  sectionId,
  onUpdateSettings,
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
      </div>

      {/* Exercises Stack */}
      <div className="space-y-2 pl-1.5">
        {exercises.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 italic pl-3">
            Không có bài tập nào được phân lịch trong tuần này.
          </p>
        ) : (
          exercises.map((ex) => {
            return (
              <div
                key={ex.assignmentId}
                className="flex items-center justify-between border border-slate-200/80 rounded-lg px-4 py-2 bg-[#f8f9fa] hover:bg-[#f1f3f5] transition-colors duration-150 shadow-sm"
              >
                <div className="flex items-center gap-2 text-xs">
                  <Link
                    to={`/instructor/exercises/${ex.exerciseId}?section_id=${sectionId}`}
                    className="text-sm font-bold text-sky-700 hover:underline"
                  >
                    {ex.title}
                  </Link>
                  {ex.isAssessment && (
                    <span className="badge-yellow text-[9px] px-1 py-0.5 font-bold uppercase">Kiểm tra</span>
                  )}
                  {isProjectExercise(ex.title) && (
                    <Link
                      to={`/instructor/exercises/${ex.exerciseId}?section_id=${sectionId}`}
                      className="badge-blue text-[9px] px-1 py-0.5 font-bold uppercase"
                    >
                      BTL
                    </Link>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings(ex.exerciseId, { isAssessment: !ex.isAssessment })}
                    className="rounded px-2 py-1 text-[10px] font-black uppercase shadow-sm transition-colors"
                    style={{
                      height: '24px',
                      backgroundColor: ex.isAssessment ? '#f59e0b' : '#e5e7eb',
                      color: ex.isAssessment ? '#ffffff' : '#64748b',
                    }}
                    title={ex.isAssessment ? 'Bỏ đánh dấu bài kiểm tra' : 'Đánh dấu là bài kiểm tra'}
                  >
                    KT
                  </button>

                  {/* Max Submissions Selector Dropdown */}
                  <div className="flex items-center">
                    <select
                      value={ex.maxSubmissions ?? 10}
                      onChange={(e) => onUpdateSettings(ex.exerciseId, { maxSubmissions: Number(e.target.value) })}
                      className="rounded bg-[#cfd8dc] pl-3 pr-6 py-0 text-xs font-bold text-slate-800 border-none outline-none cursor-pointer hover:bg-[#b0bec5] transition-colors"
                      style={{
                        height: '26px',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23374151\' width=\'18px\' height=\'18px\'><path d=\'M7 10l5 5 5-5z\'/></svg>")',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 4px center'
                      }}
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
                    className="relative inline-flex items-center shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out outline-none border border-slate-200 shadow-sm"
                    style={{
                      width: '48px',
                      height: '24px',
                      backgroundColor: ex.allowSubmission ? '#0096c7' : '#e0e0e0',
                    }}
                    title="Cho phép nộp bài"
                  >
                    <span
                      className={`absolute text-[10px] font-bold text-white select-none ${
                        ex.allowSubmission ? 'left-2' : 'right-2'
                      }`}
                    >
                      {ex.allowSubmission ? '✓' : '×'}
                    </span>
                    <span
                      className="pointer-events-none inline-block rounded-full bg-white shadow transition duration-200 ease-in-out"
                      style={{
                        width: '18px',
                        height: '18px',
                        transform: ex.allowSubmission ? 'translateX(26px)' : 'translateX(2px)',
                      }}
                    />
                  </button>

                  {/* Visibility checkmark box */}
                  <button
                    type="button"
                    onClick={() => onUpdateSettings(ex.exerciseId, { isVisible: !ex.isVisible })}
                    className="rounded flex items-center justify-center font-bold text-xs transition-colors shadow-sm outline-none cursor-pointer border-none text-white animate-fade-in"
                    style={{
                      width: '24px',
                      height: '24px',
                      backgroundColor: ex.isVisible ? '#2ec4b6' : '#bdbdbd',
                    }}
                    title={ex.isVisible ? 'Hiển thị' : 'Đang ẩn'}
                  >
                    {ex.isVisible ? '✓' : '×'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function isProjectExercise(title: string) {
  const normalized = title.toLowerCase()
  return normalized.includes('bài tập lớn') || normalized.includes('btl') || normalized.includes('project')
}
// Trigger frontend redeployment
