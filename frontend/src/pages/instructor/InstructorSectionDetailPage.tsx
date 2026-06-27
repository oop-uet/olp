import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { api } from '../../lib/api'
import { PageLoader, StudentsIcon, ExerciseIcon, LeaderboardIcon } from '../../components/ui'
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
        <Link to="/instructor/leaderboard" className="btn-secondary btn-sm inline-flex items-center gap-2">
          <LeaderboardIcon className="h-4 w-4" />
          Bảng xếp hạng
        </Link>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {students.map((student) => (
                <tr key={student.enrollmentId} className="hover:bg-gray-50">
                  <td className="table-td font-medium text-gray-900">{student.studentId}</td>
                  <td className="table-td text-gray-700">{student.fullName}</td>
                  <td className="table-td text-gray-500">{student.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Exercises card */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
          <ExerciseIcon className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-gray-800">Bài tập đã gán ({exerciseCount})</h2>
        </div>
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
    </div>
  )
}
