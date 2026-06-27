import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { api } from '../../lib/api'
import { PageLoader, StudentsIcon, ExerciseIcon, LeaderboardIcon, Spinner } from '../../components/ui'
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

interface SectionStudent {
  enrollmentId: string
  userId: string
  studentId: string
  username: string
  fullName: string
  email: string
  enrolledAt: string
}

interface SectionExercise {
  assignmentId: string
  exerciseId: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  deadline: string | null
  isAssessment: boolean
  assignedAt: string
}

interface SectionDetail {
  section: SectionInfo
  students: SectionStudent[]
  exercises: SectionExercise[]
  studentCount: number
  exerciseCount: number
}

interface AvailableExercise {
  id: string
  title: string
  difficulty: string
  oopTags?: string[] | string
}

interface StudentProgress {
  completedExercises: number
  averageScore: number
  rank: number | null
}

const DIFFICULTY_BADGE: Record<string, { className: string; label: string }> = {
  easy: { className: 'badge-green', label: 'Dễ' },
  medium: { className: 'badge-yellow', label: 'Trung bình' },
  hard: { className: 'badge-red', label: 'Khó' },
}

function getDifficultyBadge(difficulty: string) {
  return DIFFICULTY_BADGE[difficulty] ?? { className: 'badge-gray', label: difficulty }
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Không có hạn'
  const date = new Date(deadline)
  if (Number.isNaN(date.getTime())) return 'Không có hạn'
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function InstructorSectionDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [detail, setDetail] = useState<SectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // ─── Student actions state ─────────────────────────────────────────────
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null)
  const [progressStudent, setProgressStudent] = useState<SectionStudent | null>(null)
  const [progressData, setProgressData] = useState<StudentProgress | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(false)

  // ─── Assign exercise state ─────────────────────────────────────────────
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [availableExercises, setAvailableExercises] = useState<AvailableExercise[]>([])
  const [assignExerciseId, setAssignExerciseId] = useState('')
  const [assignDeadline, setAssignDeadline] = useState('')
  const [assignIsAssessment, setAssignIsAssessment] = useState(false)
  const [assignSubmitting, setAssignSubmitting] = useState(false)

  useEffect(() => {
    if (id) {
      fetchDetail()
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

  async function handleRemoveExercise(exerciseId: string, title: string) {
    if (!window.confirm(`Bạn có chắc chắn muốn gỡ bài tập "${title}" khỏi lớp này?`)) return

    setRemovingId(exerciseId)
    try {
      await api.delete(`/api/instructor/sections/${id}/exercises/${exerciseId}`)
      toast.success('Đã gỡ bài tập khỏi lớp.')
      await fetchDetail()
    } catch {
      toast.error('Không thể gỡ bài tập. Vui lòng thử lại.')
    } finally {
      setRemovingId(null)
    }
  }

  // ─── Student handlers ──────────────────────────────────────────────────

  async function handleRemoveStudent(student: SectionStudent) {
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa sinh viên "${student.fullName || student.username}" khỏi lớp này?`
      )
    )
      return

    setRemovingStudentId(student.userId)
    try {
      await api.delete(`/api/instructor/sections/${id}/students/${student.userId}`)
      toast.success('Đã xóa sinh viên khỏi lớp.')
      await fetchDetail()
    } catch {
      toast.error('Không thể xóa sinh viên. Vui lòng thử lại.')
    } finally {
      setRemovingStudentId(null)
    }
  }

  async function handleViewProgress(student: SectionStudent) {
    setProgressStudent(student)
    setProgressData(null)
    setLoadingProgress(true)
    try {
      const response = await api.get(
        `/api/instructor/sections/${id}/students/${student.userId}/progress`
      )
      setProgressData(response.data)
    } catch {
      toast.error('Không thể tải tiến độ sinh viên.')
      setProgressStudent(null)
    } finally {
      setLoadingProgress(false)
    }
  }

  function closeProgress() {
    setProgressStudent(null)
    setProgressData(null)
  }

  // ─── Assign exercise handlers ──────────────────────────────────────────

  async function toggleAssignForm() {
    if (showAssignForm) {
      setShowAssignForm(false)
      return
    }
    setShowAssignForm(true)
    setAssignExerciseId('')
    setAssignDeadline('')
    setAssignIsAssessment(false)
    try {
      const response = await api.get('/api/exercises')
      setAvailableExercises(response.data)
    } catch {
      toast.error('Không thể tải danh sách bài tập.')
    }
  }

  async function handleAssignExercise(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !assignExerciseId) return
    setAssignSubmitting(true)
    try {
      await api.post(`/api/exercises/${assignExerciseId}/assign`, {
        section_id: id,
        ...(assignDeadline ? { deadline: new Date(assignDeadline).toISOString() } : {}),
        is_assessment: assignIsAssessment,
      })
      toast.success('Đã gán bài tập.')
      setShowAssignForm(false)
      await fetchDetail()
    } catch (error) {
      const message =
        (error as AxiosError<{ error?: { message?: string } }>)?.response?.data?.error
          ?.message || 'Không thể gán bài tập.'
      toast.error(message)
    } finally {
      setAssignSubmitting(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải thông tin lớp..." />
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

  const { section, students, exercises, studentCount, exerciseCount } = detail

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/instructor/classes" className="btn-ghost btn-sm">
        ← Quay lại danh sách lớp
      </Link>

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-800">{section.name}</h1>
          <span className="badge-blue">{section.semester}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/instructor/classes/${section.id}/schedule`}
            className="btn-primary btn-sm inline-flex items-center gap-2"
          >
            <ExerciseIcon className="h-4 w-4" />
            Phân bài theo tuần
          </Link>
          <Link to="/instructor/leaderboard" className="btn-secondary btn-sm inline-flex items-center gap-2">
            <LeaderboardIcon className="h-4 w-4" />
            Bảng xếp hạng
          </Link>
        </div>
      </div>

      {/* Students card */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
          <StudentsIcon className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-gray-800">Sinh viên ({studentCount})</h2>
        </div>
        {students.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">Chưa có sinh viên nào.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">MSSV</th>
                <th className="table-th">Họ tên</th>
                <th className="table-th">Email</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {students.map((student) => (
                <tr key={student.enrollmentId} className="hover:bg-gray-50">
                  <td className="table-td font-medium text-gray-900">{student.studentId}</td>
                  <td className="table-td text-gray-700">{student.fullName}</td>
                  <td className="table-td text-gray-500">{student.email}</td>
                  <td className="table-td text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleViewProgress(student)}
                        className="btn-secondary btn-sm"
                      >
                        Xem tiến độ
                      </button>
                      <button
                        onClick={() => handleRemoveStudent(student)}
                        disabled={removingStudentId === student.userId}
                        className="btn-danger btn-sm"
                      >
                        {removingStudentId === student.userId ? 'Đang xóa...' : 'Xóa khỏi lớp'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Exercises card */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ExerciseIcon className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-gray-800">Bài tập đã gán ({exerciseCount})</h2>
          </div>
          <button onClick={toggleAssignForm} className="btn-primary btn-sm">
            {showAssignForm ? 'Đóng' : 'Gán bài tập'}
          </button>
        </div>

        {/* Assign form */}
        {showAssignForm && (
          <form
            onSubmit={handleAssignExercise}
            className="space-y-4 border-b border-gray-200 bg-gray-50 px-5 py-4"
          >
            <div>
              <label htmlFor="assign-exercise" className="label">
                Bài tập
              </label>
              <select
                id="assign-exercise"
                required
                value={assignExerciseId}
                onChange={(e) => setAssignExerciseId(e.target.value)}
                className="input"
              >
                <option value="">-- Chọn bài tập --</option>
                {availableExercises
                  .filter((ex) => !exercises.some((a) => a.exerciseId === ex.id))
                  .map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="assign-deadline" className="label">
                Hạn nộp (tùy chọn)
              </label>
              <input
                id="assign-deadline"
                type="datetime-local"
                value={assignDeadline}
                onChange={(e) => setAssignDeadline(e.target.value)}
                className="input"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={assignIsAssessment}
                onChange={(e) => setAssignIsAssessment(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Bài đánh giá (chống gian lận)
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAssignForm(false)}
                className="btn-secondary btn-sm"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={assignSubmitting || !assignExerciseId}
                className="btn-primary btn-sm"
              >
                {assignSubmitting ? (
                  <>
                    <Spinner /> Đang gán...
                  </>
                ) : (
                  'Gán'
                )}
              </button>
            </div>
          </form>
        )}

        {exercises.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">Chưa có bài tập nào được gán.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Tiêu đề</th>
                <th className="table-th">Độ khó</th>
                <th className="table-th">Hạn nộp</th>
                <th className="table-th">Loại</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {exercises.map((exercise) => {
                const badge = getDifficultyBadge(exercise.difficulty)
                return (
                  <tr key={exercise.assignmentId} className="hover:bg-gray-50">
                    <td className="table-td font-medium text-gray-900">{exercise.title}</td>
                    <td className="table-td">
                      <span className={badge.className}>{badge.label}</span>
                    </td>
                    <td className="table-td text-gray-700">{formatDeadline(exercise.deadline)}</td>
                    <td className="table-td">
                      {exercise.isAssessment ? (
                        <span className="badge-yellow">Đánh giá</span>
                      ) : (
                        <span className="badge-gray">Luyện tập</span>
                      )}
                    </td>
                    <td className="table-td text-right">
                      <button
                        onClick={() => handleRemoveExercise(exercise.exerciseId, exercise.title)}
                        disabled={removingId === exercise.exerciseId}
                        className="btn-danger btn-sm"
                      >
                        {removingId === exercise.exerciseId ? 'Đang gỡ...' : 'Gỡ'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Student progress modal */}
      {progressStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeProgress}
        >
          <div
            className="card w-full max-w-md p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="font-semibold text-gray-800">
                Tiến độ — {progressStudent.fullName || progressStudent.username}
              </h3>
              <button
                onClick={closeProgress}
                className="text-gray-400 transition-colors hover:text-gray-600"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="p-5">
              {loadingProgress ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                  <Spinner /> Đang tải tiến độ...
                </div>
              ) : progressData ? (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {progressData.completedExercises}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Bài đã hoàn thành</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {progressData.averageScore.toFixed(1)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Điểm trung bình</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {progressData.rank != null ? `#${progressData.rank}` : '—'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Xếp hạng</p>
                  </div>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-gray-500">Không có dữ liệu tiến độ.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
