import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { cachedGet } from '../../lib/api'
import {
  PageLoader,
  DashboardIcon,
  TeacherIcon,
  StudentsIcon,
  SectionIcon,
  ExerciseIcon,
  SubmissionIcon,
} from '../../components/ui'
import { toast } from '../../stores/toast.store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminStats {
  students: number
  instructors: number
  sections: number
  exercises: number
  libraryExercises: number
  submissions: number
}

interface StatCard {
  key: keyof AdminStats
  label: string
  icon: (props: { className?: string }) => JSX.Element
  accent: string
}

const STAT_CARDS: StatCard[] = [
  { key: 'students', label: 'Sinh viên', icon: StudentsIcon, accent: 'bg-primary-50 text-primary' },
  { key: 'instructors', label: 'Giảng viên', icon: TeacherIcon, accent: 'bg-success-100 text-success-600' },
  { key: 'sections', label: 'Lớp học phần', icon: SectionIcon, accent: 'bg-warning-100 text-warning-600' },
  { key: 'exercises', label: 'Bài tập', icon: ExerciseIcon, accent: 'bg-primary-50 text-primary' },
  { key: 'libraryExercises', label: 'Bài tập thư viện', icon: DashboardIcon, accent: 'bg-success-100 text-success-600' },
  { key: 'submissions', label: 'Lượt nộp bài', icon: SubmissionIcon, accent: 'bg-warning-100 text-warning-600' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const response = await cachedGet('/api/admin/stats', undefined, { ttlMs: 30_000 })
      setStats(response.data)
    } catch {
      toast.error('Không thể tải số liệu tổng quan. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (loading) {
    return <PageLoader label="Đang tải số liệu..." />
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary">
          <DashboardIcon className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-semibold text-gray-800">Tổng quan</h1>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STAT_CARDS.map(({ key, label, icon: Icon, accent }) => (
          <div key={key} className="card card-hover flex items-center gap-4 p-5">
            <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg ${accent}`}>
              <Icon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-3xl font-semibold text-gray-900">
                {stats ? stats[key] : 0}
              </p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Truy cập nhanh</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/instructors" className="btn-secondary">
            <TeacherIcon className="h-5 w-5" /> Quản lý giảng viên
          </Link>
          <Link to="/admin/students" className="btn-secondary">
            <StudentsIcon className="h-5 w-5" /> Quản lý sinh viên
          </Link>
          <Link to="/admin/sections" className="btn-secondary">
            <SectionIcon className="h-5 w-5" /> Quản lý lớp học phần
          </Link>
        </div>
      </div>
    </div>
  )
}
