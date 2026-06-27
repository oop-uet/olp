import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface Exercise {
  id: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  deadline: string | null
  status: 'not_started' | 'in_progress' | 'submitted' | 'completed'
  score: number | null
  oopTags: string[]
}

const difficultyConfig = {
  easy: { label: 'Dễ', className: 'badge-green' },
  medium: { label: 'Trung bình', className: 'badge-yellow' },
  hard: { label: 'Khó', className: 'badge-red' },
}

const statusConfig = {
  not_started: { label: 'Chưa bắt đầu', className: 'text-gray-500' },
  in_progress: { label: 'Đang làm', className: 'text-primary-600' },
  submitted: { label: 'Đã nộp', className: 'text-warning-600' },
  completed: { label: 'Hoàn thành', className: 'text-success-600' },
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Không có hạn nộp'
  const date = new Date(deadline)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()

  if (diffMs < 0) return 'Đã hết hạn'

  const formatted = date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return formatted
}

function isDeadlineSoon(deadline: string | null): boolean {
  if (!deadline) return false
  const date = new Date(deadline)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  // Less than 24 hours remaining
  return diffMs > 0 && diffMs < 24 * 60 * 60 * 1000
}

function isDeadlineExpired(deadline: string | null): boolean {
  if (!deadline) return false
  return new Date(deadline).getTime() < Date.now()
}

export function ExerciseListPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchExercises()
  }, [])

  async function fetchExercises() {
    try {
      setLoading(true)
      const response = await api.get('/api/exercises')
      setExercises(response.data.exercises ?? response.data ?? [])
    } catch (err) {
      toast.error('Không thể tải danh sách bài tập. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải bài tập..." />
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
        <p className="mt-1 text-sm text-gray-600">
          {exercises.length} bài tập được giao
        </p>
      </div>

      {/* Exercise list */}
      <div className="grid gap-4">
        {exercises.map((exercise) => (
          <Link
            key={exercise.id}
            to={`/student/exercises/${exercise.id}`}
            className="card-hover block p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Left: Title and metadata */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">
                    {exercise.title}
                  </h2>
                  <span className={difficultyConfig[exercise.difficulty].className}>
                    {difficultyConfig[exercise.difficulty].label}
                  </span>
                </div>

                {/* Tags */}
                {exercise.oopTags && exercise.oopTags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {exercise.oopTags.map((tag) => (
                      <span key={tag} className="badge-gray">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Status, deadline, score */}
              <div className="flex flex-col items-end gap-1.5 sm:min-w-[180px]">
                {/* Status */}
                <span
                  className={`text-sm font-medium ${statusConfig[exercise.status].className}`}
                >
                  {statusConfig[exercise.status].label}
                </span>

                {/* Score if submitted */}
                {exercise.score !== null && (
                  <span className="text-sm text-gray-700">
                    Điểm: <span className="font-semibold">{exercise.score.toFixed(1)}%</span>
                  </span>
                )}

                {/* Deadline */}
                <span
                  className={`text-xs ${
                    isDeadlineExpired(exercise.deadline)
                      ? 'text-danger-600 font-medium'
                      : isDeadlineSoon(exercise.deadline)
                        ? 'text-warning-600 font-medium'
                        : 'text-gray-500'
                  }`}
                >
                  {isDeadlineExpired(exercise.deadline) ? '⚠️ ' : ''}
                  Hạn nộp: {formatDeadline(exercise.deadline)}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
