import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import {
  PageLoader,
  ProgressIcon,
  CheckCircleIcon,
  ExerciseIcon,
  SubmissionIcon,
} from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface ProgressData {
  completedExercises: number
  averageScore: number
  rank: number
}

interface SectionOption {
  id: string
  name: string
  semester: string
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
  if (rank === 0) return '—'
  return `#${rank}`
}

export function ProgressPage() {
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loadingSections, setLoadingSections] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(false)

  // Fetch enrolled sections on mount.
  useEffect(() => {
    fetchSections()
  }, [])

  // Fetch progress whenever the selected section changes.
  useEffect(() => {
    if (selectedSectionId) {
      fetchProgress(selectedSectionId)
    }
  }, [selectedSectionId])

  async function fetchSections() {
    try {
      setLoadingSections(true)
      const response = await api.get('/api/students/sections')
      const data: SectionOption[] = response.data ?? []
      setSections(data)
      if (data.length > 0) {
        setSelectedSectionId(data[0].id)
      }
    } catch {
      toast.error('Không thể tải danh sách lớp học. Vui lòng thử lại.')
    } finally {
      setLoadingSections(false)
    }
  }

  async function fetchProgress(sectionId: string) {
    try {
      setLoadingProgress(true)
      const response = await api.get('/api/students/progress', {
        params: { section_id: sectionId },
      })
      setProgress(response.data)
    } catch {
      toast.error('Không thể tải tiến độ. Vui lòng thử lại.')
    } finally {
      setLoadingProgress(false)
    }
  }

  if (loadingSections) {
    return <PageLoader label="Đang tải tiến độ..." />
  }

  // No enrolled sections.
  if (sections.length === 0) {
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
          <p className="text-lg font-medium text-gray-700">Bạn chưa tham gia lớp học nào</p>
          <p className="text-sm text-gray-500">
            Khi được thêm vào một lớp học, tiến độ của bạn sẽ hiển thị ở đây.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tổng quan tiến độ</h1>
        <p className="mt-1 text-sm text-gray-600">
          Kết quả tổng thể của bạn trong lớp học phần này.
        </p>
      </div>

      {/* Section picker */}
      <div className="flex items-center gap-3">
        <label htmlFor="section-picker" className="label mb-0">
          Lớp học:
        </label>
        <select
          id="section-picker"
          value={selectedSectionId}
          onChange={(e) => setSelectedSectionId(e.target.value)}
          className="input max-w-xs"
        >
          {sections.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.name} ({sec.semester})
            </option>
          ))}
        </select>
      </div>

      {loadingProgress || !progress ? (
        <PageLoader label="Đang tải tiến độ..." />
      ) : (
        <>
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
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs text-gray-500">Số bài tập đã hoàn thành</p>
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
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
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
              <p className="mt-4 text-xs text-gray-500">Vị trí của bạn trong lớp học phần này</p>
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
        </>
      )}
    </div>
  )
}
