import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cachedGet } from '../../lib/api'
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
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loadingSections, setLoadingSections] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(false)

  // Fetch enrolled sections on mount.
  useEffect(() => {
    fetchSections()
  }, [])

  async function fetchSections() {
    try {
      setLoadingSections(true)
      const response = await cachedGet('/api/students/sections')
      const data: SectionOption[] = response.data ?? []
      setSections(data)
      if (data.length > 0) {
        await fetchProgress()
      }
    } catch {
      toast.error('Không thể tải danh sách lớp học. Vui lòng thử lại.')
    } finally {
      setLoadingSections(false)
    }
  }

  async function fetchProgress() {
    try {
      setLoadingProgress(true)
      const response = await cachedGet('/api/students/progress', undefined, { ttlMs: 30_000 })
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

  const currentSection = sections[0]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tổng quan tiến độ</h1>
      </div>

      {/* Student has exactly one course section. */}
      <div className="card flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Lớp học phần
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-800">
            {currentSection.name} ({currentSection.semester})
          </p>
        </div>
      </div>

      {loadingProgress || !progress ? (
        <PageLoader label="Đang tải tiến độ..." />
      ) : (
        <>
          {/* Progress cards grid */}
          <div className="grid gap-5 sm:grid-cols-3">
            {/* Completed exercises card */}
            <div className="card p-5 relative overflow-hidden hover:shadow-md transition-shadow flex flex-col justify-between h-36">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Bài hoàn thành
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-800">
                    {progress.completedExercises}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary">
                  <CheckCircleIcon className="h-5 w-5" />
                </div>
              </div>
              <div className="text-[10px] font-bold text-slate-400 border-t border-slate-50 pt-2 mt-auto">
                SỐ BÀI TẬP ĐÃ HOÀN THÀNH
              </div>
            </div>

            {/* Average score card */}
            <div className="card p-5 relative overflow-hidden hover:shadow-md transition-shadow flex flex-col justify-between h-36">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Điểm trung bình
                  </p>
                  <p className={`mt-2 text-3xl font-black ${getScoreColor(progress.averageScore)}`}>
                    {progress.averageScore.toFixed(1)}%
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 text-success-600">
                  <ProgressIcon className="h-5 w-5" />
                </div>
              </div>
              <div className="text-[10px] font-bold text-slate-400 border-t border-slate-50 pt-2 mt-auto">
                TRÊN TẤT CẢ BÀI TẬP ĐÃ GÁN
              </div>
            </div>

            {/* Rank card */}
            <div className="card p-5 relative overflow-hidden hover:shadow-md transition-shadow flex flex-col justify-between h-36">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Xếp hạng lớp
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-800">
                    {getRankBadge(progress.rank)}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning-50 text-warning-600">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                </div>
              </div>
              <div className="text-[10px] font-bold text-slate-400 border-t border-slate-50 pt-2 mt-auto">
                VỊ TRÍ XẾP HẠNG CỦA BẠN
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Liên kết nhanh</h2>
            <div className="flex flex-wrap gap-2.5">
              <Link to="/student/exercises" className="btn-secondary btn-sm inline-flex items-center gap-1.5 font-bold py-2 px-3">
                <ExerciseIcon className="h-4 w-4" />
                Xem bài tập
              </Link>
              <Link to="/student/submissions" className="btn-secondary btn-sm inline-flex items-center gap-1.5 font-bold py-2 px-3">
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
