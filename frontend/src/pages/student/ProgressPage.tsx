import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, ProgressIcon, CheckCircleIcon, ExerciseIcon, SubmissionIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface ProgressData {
  completedExercises: number
  totalExercises: number
  averageScore: number
  rank: number
  totalStudents: number
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-success-700'
  if (score >= 50) return 'text-warning-700'
  return 'text-danger-700'
}

function getRankBadge(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

export function ProgressPage() {
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)

  useEffect(() => {
    fetchProgress()
  }, [])

  async function fetchProgress() {
    try {
      setLoading(true)
      setIsEmpty(false)
      const response = await api.get('/api/students/progress')
      const data = response.data

      // Check if student has no submissions
      if (
        data.completedExercises === 0 &&
        data.averageScore === 0 &&
        data.rank === 0
      ) {
        setIsEmpty(true)
      }

      setProgress(data)
    } catch {
      toast.error('Không thể tải tiến độ. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải tiến độ..." />
  }

  if (isEmpty || !progress) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tổng quan tiến độ</h1>
          <p className="mt-1 text-sm text-gray-600">
            Theo dõi kết quả của bạn qua các bài tập.
          </p>
        </div>

        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <ProgressIcon className="h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">Chưa có dữ liệu tiến độ</p>
          <p className="text-sm text-gray-500">
            Nộp bài tập đầu tiên để bắt đầu theo dõi tiến độ của bạn.
          </p>
          <Link to="/student/exercises" className="btn-primary mt-2">
            Xem danh sách bài tập
          </Link>
        </div>
      </div>
    )
  }

  const completionPercentage =
    progress.totalExercises > 0
      ? ((progress.completedExercises / progress.totalExercises) * 100).toFixed(0)
      : '0'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tổng quan tiến độ</h1>
        <p className="mt-1 text-sm text-gray-600">
          Kết quả tổng thể của bạn trong lớp học phần này.
        </p>
      </div>

      {/* Progress cards grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Completed exercises card */}
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary">
              <CheckCircleIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Hoàn thành
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {progress.completedExercises}
                <span className="text-sm font-normal text-gray-500">
                  /{progress.totalExercises}
                </span>
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">{completionPercentage}% hoàn thành</p>
          </div>
        </div>

        {/* Average score card */}
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-100 text-success-600">
              <ProgressIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Điểm trung bình
              </p>
              <p className={`text-2xl font-bold ${getScoreColor(progress.averageScore)}`}>
                {progress.averageScore.toFixed(1)}%
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Trên tất cả bài tập được giao (0% nếu chưa nộp)
          </p>
        </div>

        {/* Rank card */}
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-100 text-warning-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Xếp hạng lớp
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {getRankBadge(progress.rank)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Trên tổng {progress.totalStudents} sinh viên trong lớp của bạn
          </p>
        </div>
      </div>

      {/* Quick links */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700">Liên kết nhanh</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link to="/student/exercises" className="btn-secondary">
            <ExerciseIcon className="h-4 w-4" />
            Xem bài tập
          </Link>
          <Link to="/student/submissions" className="btn-secondary">
            <SubmissionIcon className="h-4 w-4" />
            Lịch sử nộp bài
          </Link>
        </div>
      </div>
    </div>
  )
}
