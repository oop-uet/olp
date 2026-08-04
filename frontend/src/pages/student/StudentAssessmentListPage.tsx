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

  // Stats calculation
  const stats = useMemo(() => {
    const now = Date.now()
    let openCount = 0
    let upcomingCount = 0
    let completedCount = 0

    items.forEach((item) => {
      const openTime = new Date(item.opensAt).getTime()
      const closeTime = new Date(item.closesAt).getTime()
      if (now >= openTime && now < closeTime) openCount++
      if (now < openTime) upcomingCount++
      if (item.session && item.session.status !== 'in_progress') completedCount++
    })

    return { total: items.length, openCount, upcomingCount, completedCount }
  }, [items])

  // Filtered items
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return items.filter((item) => {
      const timeInfo = timeStatus(item)

      // Tab filter
      if (activeTab === 'open' && timeInfo.status !== 'open') return false
      if (activeTab === 'upcoming' && timeInfo.status !== 'upcoming') return false
      if (activeTab === 'closed' && timeInfo.status !== 'closed') return false

      // Search query filter
      if (query) {
        const matchesTitle = item.title.toLowerCase().includes(query)
        const matchesSection = (item.sectionName || '').toLowerCase().includes(query)
        if (!matchesTitle && !matchesSection) return false
      }

      return true
    })
  }, [items, activeTab, searchQuery])

  if (loading) return <PageLoader label="Đang tải danh sách bài kiểm tra..." />

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-cyan-700 to-blue-800 p-6 text-white shadow-md border-b-4 border-secondary">
        <div className="absolute right-0 top-0 h-48 w-48 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-sm">
              Bài kiểm tra của tôi
            </h1>
            <p className="mt-1 text-xs font-semibold text-cyan-100/90">
              Danh sách các bài kiểm tra được giao theo các lớp học phần bạn đã tham gia
            </p>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-lg bg-white/15 px-3 py-1.5 backdrop-blur-sm border border-white/20">
              Tổng số: {stats.total}
            </span>
            <span className="rounded-lg bg-emerald-500/30 text-emerald-100 px-3 py-1.5 backdrop-blur-sm border border-emerald-400/30">
              Đang mở: {stats.openCount}
            </span>
            <span className="rounded-lg bg-blue-500/30 text-blue-100 px-3 py-1.5 backdrop-blur-sm border border-blue-400/30">
              Sắp mở: {stats.upcomingCount}
            </span>
            <span className="rounded-lg bg-white/10 text-slate-200 px-3 py-1.5 backdrop-blur-sm border border-white/15">
              Đã nộp: {stats.completedCount}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar: Search + Filter Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200/80">
          <button
            onClick={() => setActiveTab('all')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'all'
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            Tất cả ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('open')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'open'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            Đang mở ({stats.openCount})
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'upcoming'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            Sắp mở ({stats.upcomingCount})
          </button>
          <button
            onClick={() => setActiveTab('closed')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'closed'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            Đã đóng
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Tìm tên bài hoặc lớp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <svg
            className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main List */}
      {filteredItems.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <ExerciseIcon className="h-7 w-7" />
          </div>
          <p className="mt-4 text-base font-bold text-slate-700">
            {searchQuery
              ? 'Không tìm thấy bài kiểm tra phù hợp với từ khóa'
              : activeTab !== 'all'
              ? 'Không có bài kiểm tra nào trong danh mục này'
              : 'Chưa có bài kiểm tra nào được giao'}
          </p>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            Các bài kiểm tra do giảng viên thiết lập cho lớp học phần của bạn sẽ xuất hiện tại đây.
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
            const isInProgress = item.session?.status === 'in_progress'
            const isOpen = timeInfo.status === 'open'
            const canAttempt = isOpen && (isInProgress || attemptsUsed < maxAttempts)

            return (
              <Link
                key={item.id}
                to={`/student/assessments/${item.id}`}
                className={`card group relative flex flex-col justify-between border-l-4 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                  isOpen
                    ? 'border-l-emerald-500 bg-white hover:bg-emerald-50/20'
                    : timeInfo.status === 'upcoming'
                    ? 'border-l-blue-500 bg-white hover:bg-blue-50/20'
                    : 'border-l-slate-300 bg-slate-50/60 hover:bg-slate-100/60'
                }`}
              >
                <div>
                  {/* Top Info */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="inline-block rounded bg-cyan-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-800">
                        {item.sectionName}
                      </span>
                      <h2 className="mt-1.5 flex flex-wrap items-center gap-2 text-base font-extrabold text-slate-900 group-hover:text-primary transition-colors">
                        {isCompleted ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xs font-black" title="Đã hoàn thành">
                            ✓
                          </span>
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-cyan-500" />
                        )}
                        <span>{item.title}</span>
                      </h2>
                    </div>
                    <span className={timeInfo.className}>{timeInfo.label}</span>
                  </div>

                  {/* Details Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-600 rounded-xl bg-slate-50/80 p-3 border border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Thời lượng</span>
                      <p className="font-extrabold text-slate-800">{item.durationMinutes} phút</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tổng điểm</span>
                      <p className="font-extrabold text-slate-800">{item.totalPoints} điểm</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Số lần làm bài</span>
                      <p className="font-bold text-slate-800">
                        {attemptsUsed}/{maxAttempts} {attemptsUsed >= maxAttempts && <span className="text-amber-600">(Đã hết lượt)</span>}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Khung thời gian thi</span>
                      <p className="font-semibold text-slate-700 leading-tight">
                        {new Date(item.opensAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })} –{' '}
                        {new Date(item.closesAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom Footer Action & Score */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5">
                  <div className="flex items-center gap-2">
                    {progress ? (
                      <span className={progress.className}>{progress.label}</span>
                    ) : item.requiresPassword || item.hasPassword ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        🔒 Có mật khẩu
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    {item.session?.reviewStatus === 'official' && item.session.officialScore !== null ? (
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Điểm chính thức</span>
                        <p className="text-base font-black text-emerald-600 leading-none">
                          {item.session.officialScore} <span className="text-xs font-semibold text-slate-400">/ {item.totalPoints}</span>
                        </p>
                      </div>
                    ) : item.session?.predictedScore !== null && item.session?.predictedScore !== undefined ? (
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Điểm dự kiến</span>
                        <p className="text-base font-black text-cyan-600 leading-none">
                          {item.session.predictedScore} <span className="text-xs font-semibold text-slate-400">/ {item.totalPoints}</span>
                        </p>
                      </div>
                    ) : null}

                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all shadow-sm ${
                        isInProgress
                          ? 'bg-amber-500 text-white group-hover:bg-amber-600'
                          : canAttempt
                          ? 'bg-primary text-white group-hover:bg-primary-600'
                          : isCompleted
                          ? 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isInProgress
                        ? 'Tiếp tục làm →'
                        : canAttempt
                        ? 'Vào làm bài →'
                        : isCompleted
                        ? 'Xem lại bài làm'
                        : 'Xem thông tin'}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
