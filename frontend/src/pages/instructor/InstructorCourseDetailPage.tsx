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
    } catch {
      // Ignore leaderboard failures on this screen
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  // Toggle assigned exercise visibility
  async function handleToggleVisibility(exerciseId: string, currentVisible: boolean) {
    if (!id) return
    const nextVisible = !currentVisible
    try {
      await api.put(`/api/instructor/sections/${id}/schedule/visibility`, {
        exercise_id: exerciseId,
        is_visible: nextVisible,
      })
      toast.success(nextVisible ? 'Đã hiện bài tập đối với sinh viên' : 'Đã ẩn bài tập đối với sinh viên')
      
      // Update local state
      if (detail) {
        setDetail({
          ...detail,
          exercises: detail.exercises.map((ex) =>
            ex.exerciseId === exerciseId ? { ...ex, isVisible: nextVisible } : ex
          ),
        })
      }
    } catch {
      toast.error('Không thể cập nhật trạng thái hiển thị.')
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
  for (const ex of exercises) {
    const w = ex.week ?? 0
    if (w >= 1 && w <= TOTAL_WEEKS) {
      exercisesByWeek[w].push(ex)
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 font-medium py-1 px-3 bg-slate-50 border-b border-slate-100 rounded flex gap-1.5 items-center">
        <Link to="/instructor/classes" className="text-teal-600 hover:underline">Trang chủ</Link>
        <span>/</span>
        <span className="text-slate-400">Xem khóa học</span>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        
        {/* Left Column: Weekly list (75% width) */}
        <div className="space-y-6 lg:w-3/4">
          
          <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <svg className="h-5 w-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Bài tập tuần: {section.name}
            </h1>
            <p className="text-xs text-slate-400 font-semibold mt-1">
              Quản lý và theo dõi bài tập thực hành theo tiến độ 15 tuần học.
            </p>
          </div>

          <div className="space-y-4">
            {[...Array(TOTAL_WEEKS)].map((_, i) => {
              const weekNum = i + 1
              const weekExercises = exercisesByWeek[weekNum] || []

              return (
                <div key={weekNum} className="card overflow-hidden bg-white border border-slate-100 shadow-sm rounded-xl hover:shadow-md transition-shadow">
                  {/* Week divider line */}
                  <div className="flex items-center justify-between bg-slate-50/70 border-b border-slate-100 px-5 py-3.5 border-l-4 border-teal-600">
                    <h3 className="font-bold text-sm text-slate-800 tracking-wide">
                      TUẦN {weekNum}
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {weekExercises.length} bài tập được gán
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    {weekExercises.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4 italic font-medium">
                        Không có bài tập nào được phân lịch trong tuần này.
                      </p>
                    ) : (
                      weekExercises.map((ex) => {
                        const isExpanded = !!expandedEx[ex.exerciseId]
                        const list = submissionsByEx[ex.exerciseId] || []
                        const isLoadingList = !!loadingSubmissions[ex.exerciseId]

                        return (
                          <div key={ex.assignmentId} className="border border-slate-100 rounded-lg p-3.5 space-y-3 bg-white">
                            
                            {/* Exercise Meta row */}
                            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 text-sm">{ex.title}</span>
                                {ex.isAssessment ? (
                                  <span className="badge-yellow">Kiểm tra</span>
                                ) : (
                                  <span className="badge-gray">Luyện tập</span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3">
                                {/* Visibility checkbox */}
                                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-600 hover:text-slate-900 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={ex.isVisible}
                                    onChange={() => handleToggleVisibility(ex.exerciseId, ex.isVisible)}
                                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                    aria-label={`Hiển thị bài ${ex.title}`}
                                  />
                                  <span>Hiện bài</span>
                                </label>

                                {/* Dropdown Submissions Count */}
                                <button
                                  onClick={() => toggleSubmissionsList(ex.exerciseId)}
                                  className="flex items-center gap-1 bg-teal-50 hover:bg-teal-100/60 text-teal-700 font-bold px-2.5 py-1 rounded transition-colors text-[11px]"
                                >
                                  Bài nộp
                                  <span className="bg-teal-600 text-white px-1.5 py-0.2 rounded-full text-[9px]">
                                    {isLoadingList ? '...' : (list.length || 0)}
                                  </span>
                                  <span>{isExpanded ? '▲' : '▼'}</span>
                                </button>
                              </div>
                            </div>

                            {/* Expanded submissions list */}
                            {isExpanded && (
                              <div className="border-t border-slate-100 pt-3 mt-2 space-y-2">
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
                                              <Link
                                                to={`/instructor/submissions`}
                                                className="text-teal-600 hover:underline"
                                              >
                                                {sub.studentUsername}
                                              </Link>
                                            </td>
                                            <td className="px-3 py-2 font-medium">{sub.studentName}</td>
                                            <td className="px-3 py-2 text-slate-500 font-medium">
                                              {new Date(sub.submittedAt).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="px-3 py-2 text-right font-bold text-teal-600">
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
            })}
          </div>

        </div>

        {/* Right Column: Sidebar (25% width) */}
        <div className="space-y-6 lg:w-1/4 lg:sticky lg:top-4">
          
          {/* Action Card */}
          <div className="card p-5 bg-white border border-slate-100 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2">
              Thao tác
            </h3>
            
            <Link
              to={`/instructor/classes/${section.id}/schedule`}
              className="btn-primary flex w-full items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded active:scale-95 transition-all text-center"
            >
              {/* Calendar Icon */}
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              CHỌN BÀI TẬP (Schedule)
            </Link>

            <Link
              to={`/instructor/classes/${section.id}`}
              className="btn-secondary flex w-full items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded active:scale-95 transition-all text-center"
            >
              {/* Users Icon */}
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Quản lý danh sách lớp
            </Link>
          </div>

          {/* Mini-leaderboard Widget */}
          <div className="card p-0 bg-white border border-slate-100 shadow-sm overflow-hidden">
            <div className="panel-header py-3 px-4">
              <h3 className="panel-title">
                <span>🏆</span>
                Bảng Xếp Hạng
              </h3>
            </div>
            
            <div className="p-4">
              {loadingLeaderboard ? (
                <div className="flex items-center gap-2 py-4 justify-center text-xs text-slate-400">
                  <Spinner /> Đang tải xếp hạng...
                </div>
              ) : leaderboard.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4 italic font-medium">Chưa có xếp hạng lớp.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-xs">
                  {leaderboard.map((item, idx) => (
                    <li key={item.studentId} className="flex items-center justify-between py-2 text-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-400 w-4 text-center">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                        </span>
                        <span className="font-medium truncate max-w-28" title={item.studentName}>
                          {item.studentName}
                        </span>
                      </div>
                      <span className="font-bold text-teal-600">{item.totalScore.toFixed(1)}</span>
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
