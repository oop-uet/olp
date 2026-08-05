import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import type { StudentAssessmentListItem } from '../../types/assessment'

type FilterTab = 'all' | 'open' | 'upcoming' | 'closed'

function timeStatus(item: StudentAssessmentListItem) {
  const now = Date.now()
  const openTime = new Date(item.opensAt).getTime()
  const closeTime = new Date(item.closesAt).getTime()

  if (now < openTime) {
    return { status: 'upcoming', label: 'Sắp mở', className: 'badge-blue' }
  }
  if (now >= closeTime) {
    return { status: 'closed', label: 'Đã đóng', className: 'badge-gray' }
  }
  return { status: 'open', label: 'Đang mở', className: 'badge-green' }
}

function sessionStatus(item: StudentAssessmentListItem) {
  if (!item.session) return null
  if (item.session.reviewStatus === 'official') {
    return { label: 'Đã có điểm chính thức', className: 'badge-green' }
  }
  if (item.session.reviewStatus === 'pending_review') {
    return item.session.predictedScore !== null
      ? { label: 'Có điểm dự kiến', className: 'badge-yellow' }
      : { label: 'Chờ giảng viên chấm', className: 'badge-yellow' }
  }
  if (['ai_queued', 'ai_running'].includes(item.session.reviewStatus)) {
    return { label: 'AI đang chấm', className: 'badge-blue' }
  }
  return { label: 'Đang làm bài', className: 'badge-yellow' }
}

export function StudentAssessmentListPage() {
  const [items, setItems] = useState<StudentAssessmentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const response = await api.get('/api/students/assessments')
      setItems(response.data.data ?? [])
    } catch {
      toast.error('Không thể tải danh sách bài kiểm tra.')
    } finally {
      setLoading(false)
    }
  }

  // Stats calculation for tab counts
  const stats = useMemo(() => {
    const now = Date.now()
    let openCount = 0
    let upcomingCount = 0
    let closedCount = 0

    items.forEach((item) => {
      const openTime = new Date(item.opensAt).getTime()
      const closeTime = new Date(item.closesAt).getTime()
      if (now >= openTime && now < closeTime) openCount++
      else if (now < openTime) upcomingCount++
      else closedCount++
    })

    return { total: items.length, openCount, upcomingCount, closedCount }
  }, [items])

  // Filtered items
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return items.filter((item) => {
      const timeInfo = timeStatus(item)

      if (activeTab === 'open' && timeInfo.status !== 'open') return false
      if (activeTab === 'upcoming' && timeInfo.status !== 'upcoming') return false
      if (activeTab === 'closed' && timeInfo.status !== 'closed') return false

      if (query) {
        const matchesTitle = item.title.toLowerCase().includes(query)
        const matchesSection = (item.sectionName || '').toLowerCase().includes(query)
        if (!matchesTitle && !matchesSection) return false
      }

      return true
    })
  }, [items, activeTab, searchQuery])

  if (loading) return <PageLoader label="Đang tải bài kiểm tra..." />

  return (
    <div className="space-y-6">
      {/* Signature Header Banner - Clean UI System */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-800 via-cyan-800 to-slate-900 p-6 sm:p-8 text-white shadow-md border-b-4 border-teal-500 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="absolute right-0 top-0 h-48 w-48 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 space-y-2 max-w-2xl">
          <h1 className="text-xl sm:text-2xl font-bold tracking-normal text-white leading-snug">
            Danh sách Bài kiểm tra
          </h1>
        </div>

        {/* Quick Summary Pill */}
        <div className="relative z-10 flex items-center gap-3 shrink-0">
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-center backdrop-blur-xs">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-200">Đang mở</p>
            <p className="text-lg font-black text-emerald-300">{stats.openCount}</p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-center backdrop-blur-xs">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-200">Sắp mở</p>
            <p className="text-lg font-black text-cyan-200">{stats.upcomingCount}</p>
          </div>
        </div>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-3">
        <div className="-mb-px flex flex-wrap gap-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('all')}
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Tất cả ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('open')}
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              activeTab === 'open'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Đang mở ({stats.openCount})
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              activeTab === 'upcoming'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Sắp mở ({stats.upcomingCount})
          </button>
          <button
            onClick={() => setActiveTab('closed')}
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              activeTab === 'closed'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Đã đóng ({stats.closedCount})
          </button>
        </div>

        {items.length > 0 && (
          <input
            type="text"
            placeholder="Tìm theo tiêu đề hoặc tên lớp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input max-w-xs text-xs"
          />
        )}
      </div>

      {/* Main Content */}
      {filteredItems.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <ExerciseIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500 font-medium">
            {searchQuery
              ? 'Không tìm thấy bài kiểm tra nào.'
              : activeTab !== 'all'
              ? 'Không có bài kiểm tra nào trong danh mục này.'
              : 'Chưa có bài kiểm tra nào được giao.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredItems.map((item) => {
            const timeInfo = timeStatus(item)
            const progress = sessionStatus(item)
            const attemptsUsed = item.attemptsUsed ?? (item.session?.attemptNumber ?? 0)
            const maxAttempts = item.maxAttempts ?? 1
            const isCompleted = Boolean(item.session && item.session.status !== 'in_progress')

            return (
              <Link
                key={item.id}
                to={item.session ? `/student/assessments/${item.id}?view=history` : `/student/assessments/${item.id}`}
                className="card group border-l-4 border-l-cyan-500 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">{item.sectionName}</p>
                    <h2 className="mt-1 flex flex-wrap items-center gap-2 text-base font-extrabold text-slate-900 group-hover:text-primary transition-colors">
                      {isCompleted ? (
                        <span className="text-emerald-500 text-sm font-bold" title="Đã nộp bài">✓</span>
                      ) : (
                        <span className="text-slate-300 text-sm font-bold">•</span>
                      )}
                      <span>{item.title}</span>
                      <span className="badge-cyan">KT</span>
                    </h2>
                  </div>
                  <span className={timeInfo.className}>{timeInfo.label}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Thời lượng</span>
                    <p className="font-bold text-slate-800">{item.durationMinutes} phút</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng điểm</span>
                    <p className="font-bold text-slate-800">{item.totalPoints}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lượt làm</span>
                    <p className="font-bold text-slate-800">{attemptsUsed}/{maxAttempts}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Thời gian thi</span>
                    <p className="font-semibold text-slate-700 text-xs">
                      {new Date(item.opensAt).toLocaleString('vi-VN')} - {new Date(item.closesAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>

                {progress && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                    <span className={progress.className}>{progress.label}</span>
                    <div className="text-right text-sm">
                      {item.session?.reviewStatus === 'official' && item.session.officialScore !== null ? (
                        <div>
                          <strong className="text-emerald-700 font-extrabold">Chính thức: {item.session?.officialScore}/{item.totalPoints}</strong>
                          <p className="mt-0.5 text-xs font-bold text-primary">Xem lại bài nộp →</p>
                        </div>
                      ) : item.session?.predictedScore !== null ? (
                        <strong className="text-cyan-700 font-extrabold">Dự kiến: {item.session?.predictedScore}/{item.totalPoints}</strong>
                      ) : (
                        <span className="text-slate-400 font-semibold">Chưa có điểm</span>
                      )}
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
