import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner, SectionIcon, StudentsIcon, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SectionInstructor {
  id: string
  username: string
  fullName: string
  email: string
}

interface SectionInfo {
  id: string
  name: string
  semester: string
  instructor: SectionInstructor | null
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
  difficulty: string
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

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('vi-VN')
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  switch (difficulty) {
    case 'easy':
      return <span className="badge-green">Dễ</span>
    case 'medium':
      return <span className="badge-yellow">Trung bình</span>
    case 'hard':
      return <span className="badge-red">Khó</span>
    default:
      return <span className="badge-gray">{difficulty}</span>
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SectionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<SectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // ─── Assign exercise state ─────────────────────────────────────────────
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [availableExercises, setAvailableExercises] = useState<AvailableExercise[]>([])
  const [assignExerciseId, setAssignExerciseId] = useState('')
  const [assignDeadline, setAssignDeadline] = useState('')
  const [assignIsAssessment, setAssignIsAssessment] = useState(false)
  const [assignSubmitting, setAssignSubmitting] = useState(false)

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const response = await api.get(`/api/admin/sections/${id}/detail`)
      setDetail(response.data)
    } catch {
      toast.error('Không thể tải thông tin lớp. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  // ─── Actions ─────────────────────────────────────────────────────────────

  async function handleRemoveStudent(student: SectionStudent) {
    if (!id) return
    if (
      !window.confirm(
        `Gỡ sinh viên "${student.fullName || student.username}" khỏi lớp?`
      )
    )
      return
    setBusyKey(`student-${student.userId}`)
    try {
      await api.delete(`/api/admin/sections/${id}/students/${student.userId}`)
      toast.success('Đã gỡ sinh viên khỏi lớp.')
      await fetchDetail()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể gỡ sinh viên.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleRemoveExercise(exercise: SectionExercise) {
    if (!id) return
    if (!window.confirm(`Gỡ bài tập "${exercise.title}" khỏi lớp?`)) return
    setBusyKey(`exercise-${exercise.exerciseId}`)
    try {
      await api.delete(`/api/admin/sections/${id}/exercises/${exercise.exerciseId}`)
      toast.success('Đã gỡ bài tập khỏi lớp.')
      await fetchDetail()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể gỡ bài tập.')
    } finally {
      setBusyKey(null)
    }
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
      const response = await api.get('/api/admin/exercises')
      setAvailableExercises(response.data)
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(
        axiosErr.response?.data?.error?.message || 'Không thể tải danh sách bài tập.'
      )
    }
  }

  async function handleAssignExercise(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !assignExerciseId) return
    setAssignSubmitting(true)
    try {
      await api.post(`/api/admin/sections/${id}/assign-exercise`, {
        exercise_id: assignExerciseId,
        ...(assignDeadline ? { deadline: new Date(assignDeadline).toISOString() } : {}),
        is_assessment: assignIsAssessment,
      })
      toast.success('Đã gán bài tập.')
      setShowAssignForm(false)
      await fetchDetail()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể gán bài tập.')
    } finally {
      setAssignSubmitting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return <PageLoader label="Đang tải thông tin lớp..." />
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Link to="/admin/sections" className="text-sm font-medium text-primary hover:text-primary-700">
          ← Quay lại danh sách lớp
        </Link>
        <div className="card flex flex-col items-center justify-center border-dashed p-12 text-center">
          <p className="text-gray-500">Không tìm thấy lớp học phần.</p>
        </div>
      </div>
    )
  }

  const { section, students, exercises, studentCount, exerciseCount } = detail

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/admin/sections"
        className="inline-flex text-sm font-medium text-primary hover:text-primary-700"
      >
        ← Quay lại danh sách lớp
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <SectionIcon className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-800">{section.name}</h1>
              <span className="badge-blue">{section.semester}</span>
            </div>
            <p className="text-sm text-gray-500">
              Giảng viên:{' '}
              {section.instructor ? (
                <span className="font-medium text-gray-700">
                  {section.instructor.fullName || section.instructor.username}
                </span>
              ) : (
                <span className="italic text-gray-400">Chưa phân công</span>
              )}
            </p>
          </div>
        </div>
        <Link
          to={`/admin/sections/${section.id}/schedule`}
          className="btn-primary btn-sm inline-flex items-center gap-2"
        >
          <ExerciseIcon className="h-4 w-4" />
          Phân bài theo tuần
        </Link>
      </div>

      {/* Students */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
          <StudentsIcon className="h-5 w-5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">
            Sinh viên ({studentCount})
          </h2>
        </div>
        {students.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            Lớp chưa có sinh viên nào.
          </p>
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
                  <td className="table-td font-medium text-gray-900">
                    {student.studentId || student.username}
                  </td>
                  <td className="table-td text-gray-700">{student.fullName || '—'}</td>
                  <td className="table-td text-gray-700">{student.email}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleRemoveStudent(student)}
                      disabled={busyKey === `student-${student.userId}`}
                      className="text-sm font-medium text-danger-600 hover:text-danger-700 disabled:opacity-50"
                    >
                      Gỡ khỏi lớp
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Exercises */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ExerciseIcon className="h-5 w-5 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">
              Bài tập đã gán ({exerciseCount})
            </h2>
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
                  .filter(
                    (ex) => !exercises.some((a) => a.exerciseId === ex.id)
                  )
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
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            Lớp chưa được gán bài tập nào.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Tiêu đề</th>
                <th className="table-th">Độ khó</th>
                <th className="table-th">Hạn nộp</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {exercises.map((exercise) => (
                <tr key={exercise.assignmentId} className="hover:bg-gray-50">
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{exercise.title}</span>
                      {exercise.isAssessment && (
                        <span className="badge-blue">Đánh giá</span>
                      )}
                    </div>
                  </td>
                  <td className="table-td">
                    <DifficultyBadge difficulty={exercise.difficulty} />
                  </td>
                  <td className="table-td text-gray-500">
                    {formatDateTime(exercise.deadline)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleRemoveExercise(exercise)}
                      disabled={busyKey === `exercise-${exercise.exerciseId}`}
                      className="text-sm font-medium text-danger-600 hover:text-danger-700 disabled:opacity-50"
                    >
                      Gỡ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
