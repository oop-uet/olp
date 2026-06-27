import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface Exercise {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  oopTags: string[]
  sectionId: string
  sectionName: string
  deadline: string | null
  isAssessment: boolean
  bestScore: number | null
  attemptCount: number
  maxSubmissions: number
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue'
}

const difficultyConfig: Record<Exercise['difficulty'], { label: string; className: string }> = {
  easy: { label: 'Dễ', className: 'badge-green' },
  medium: { label: 'Trung bình', className: 'badge-yellow' },
  hard: { label: 'Khó', className: 'badge-red' },
}

const statusConfig: Record<Exercise['status'], { label: string; className: string }> = {
  not_started: { label: 'Chưa làm', className: 'badge-gray' },
  in_progress: { label: 'Đang làm', className: 'badge-yellow' },
  completed: { label: 'Hoàn thành', className: 'badge-green' },
  overdue: { label: 'Quá hạn', className: 'badge-red' },
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Không có'
  return new Date(deadline).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ExerciseListPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchExercises()
  }, [])

  async function fetchExercises() {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/api/students/exercises')
      setExercises(response.data.exercises ?? [])
    } catch (err) {
      setError('Không thể tải danh sách bài tập. Vui lòng thử lại.')
      toast.error('Không thể tải danh sách bài tập. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải bài tập..." />
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bài tập</h1>
        </div>
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <ExerciseIcon className="h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">{error}</p>
          <button onClick={fetchExercises} className="btn-primary mt-2">
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  if (exercises.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bài tập</h1>
        </div>
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <ExerciseIcon className="h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">Chưa có bài tập nào được giao</p>
          <p className="text-sm text-gray-500">Hãy quay lại sau để xem các bài tập mới.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bài tập</h1>
        <p className="mt-1 text-sm text-gray-600">{exercises.length} bài tập được giao</p>
      </div>

      {/* Exercise table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Bài tập</th>
                <th className="table-th">Độ khó</th>
                <th className="table-th">Lớp</th>
                <th className="table-th">Hạn nộp</th>
                <th className="table-th">Trạng thái</th>
                <th className="table-th text-right">Điểm cao nhất</th>
                <th className="table-th text-right">Lần nộp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {exercises.map((exercise) => (
                <tr key={`${exercise.id}-${exercise.sectionId}`} className="hover:bg-gray-50">
                  <td className="table-td">
                    <Link
                      to={`/student/exercises/${exercise.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {exercise.title}
                    </Link>
                    {exercise.oopTags && exercise.oopTags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {exercise.oopTags.map((tag) => (
                          <span key={tag} className="badge-gray">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="table-td">
                    <span className={difficultyConfig[exercise.difficulty].className}>
                      {difficultyConfig[exercise.difficulty].label}
                    </span>
                  </td>
                  <td className="table-td text-gray-700">{exercise.sectionName}</td>
                  <td className="table-td text-gray-700">{formatDeadline(exercise.deadline)}</td>
                  <td className="table-td">
                    <span className={statusConfig[exercise.status].className}>
                      {statusConfig[exercise.status].label}
                    </span>
                  </td>
                  <td className="table-td text-right font-medium text-gray-900">
                    {exercise.bestScore === null ? '—' : `${exercise.bestScore}%`}
                  </td>
                  <td className="table-td text-right text-gray-700">
                    {exercise.attemptCount}/{exercise.maxSubmissions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
