import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { api } from '../../lib/api'
import { PageLoader, LeaderboardIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { Link } from 'react-router-dom'

// --- Types ---

interface LeaderboardEntry {
  rank: number
  studentName: string
  studentId: string
  studentUserId?: string
  totalScore: number
  completedExercises: number
}

interface SectionOption {
  id: string
  name: string
  semester: string
}

type SortKey = 'rank' | 'studentName' | 'sectionName' | 'totalScore'
type SortDirection = 'asc' | 'desc'

// --- Constants ---

const AUTO_REFRESH_INTERVAL_MS = 10000

function formatScore(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

// --- Component ---

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [maxPossibleScore, setMaxPossibleScore] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(30)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch available sections
  useEffect(() => {
    fetchSections()
  }, [])

  // Start auto-refresh when a section is selected
  useEffect(() => {
    if (selectedSectionId) {
      fetchLeaderboard(selectedSectionId)
      startAutoRefresh(selectedSectionId)
    } else {
      setEntries([])
      stopAutoRefresh()
    }

    return () => stopAutoRefresh()
  }, [selectedSectionId])

  async function fetchSections() {
    try {
      // Instructors see their own sections; admins see all.
      const sectionsRes = await api.get('/api/instructor/sections')
      setSections(
        sectionsRes.data.map((s: { id: string; name: string; semester: string }) => ({
          id: s.id,
          name: s.name,
          semester: s.semester,
        }))
      )
      // Auto-select first section
      if (sectionsRes.data.length > 0) {
        setSelectedSectionId(sectionsRes.data[0].id)
      }
    } catch {
      // If the sections endpoint is not accessible, sections dropdown remains empty
    }
  }

  const fetchLeaderboard = useCallback(async (sectionId: string) => {
    if (!sectionId) return

    try {
      const response = await api.get(`/api/sections/${sectionId}/leaderboard`)
      const data: LeaderboardEntry[] = response.data.leaderboard ?? response.data ?? []
      setEntries(data)
      setMaxPossibleScore(response.data.maxPossibleScore ?? 0)
      setLastRefreshed(new Date())
    } catch {
      toast.error('Không thể tải bảng xếp hạng. Vui lòng thử lại.')
    }
  }, [])

  function startAutoRefresh(sectionId: string) {
    stopAutoRefresh()
    intervalRef.current = setInterval(() => {
      fetchLeaderboard(sectionId)
    }, AUTO_REFRESH_INTERVAL_MS)
  }

  function stopAutoRefresh() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function handleSectionChange(sectionId: string) {
    setSelectedSectionId(sectionId)
    setCurrentPage(1)
    setSearchQuery('')
    setLoading(true)
    // Loading will be cleared when fetchLeaderboard resolves
    fetchLeaderboard(sectionId).finally(() => setLoading(false))
  }

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(nextKey)
      setSortDirection(nextKey === 'totalScore' ? 'desc' : 'asc')
    }
    setCurrentPage(1)
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return <span className="ml-1 text-slate-300">↕</span>
    return <span className="ml-1 text-primary">{sortDirection === 'asc' ? '▲' : '▼'}</span>
  }

  const currentSection =
    sections.find((section) => section.id === selectedSectionId) ?? sections[0]

  const filteredEntries = entries.filter((entry) => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      entry.studentName.toLowerCase().includes(q) ||
      entry.studentId.toLowerCase().includes(q) ||
      (currentSection?.name ?? '').toLowerCase().includes(q)
    )
  })

  const sortedEntries = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...filteredEntries].sort((a, b) => {
      if (sortKey === 'rank') return (a.rank - b.rank) * direction
      if (sortKey === 'totalScore') return (a.totalScore - b.totalScore) * direction
      if (sortKey === 'sectionName') return (currentSection?.name ?? '').localeCompare(currentSection?.name ?? '') * direction
      return a.studentName.localeCompare(b.studentName, 'vi') * direction
    })
  }, [filteredEntries, sortDirection, sortKey, currentSection?.name])

  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / pageSize))
  const paginatedEntries = sortedEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const startIndex = sortedEntries.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endIndex = Math.min(currentPage * pageSize, sortedEntries.length)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 font-medium py-1 px-3 bg-slate-50 border-b border-slate-100 rounded flex gap-1.5 items-center">
        <span className="text-primary cursor-default">Trang chủ</span>
        <span>/</span>
        <span className="text-slate-400">Bảng xếp hạng</span>
      </div>

      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-1 sm:flex-row sm:items-center">
        <div className="flex border-b-2 border-primary -mb-[2px]">
          <button className="px-4 py-2 text-sm font-bold text-primary">
            Xếp Hạng Theo Khóa Học
          </button>
        </div>
        {lastRefreshed && (
          <div className="self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-right text-[11px] font-semibold text-slate-400 md:self-auto">
            Tự động cập nhật mỗi 10s · Lần cuối:{' '}
            <span className="text-primary font-bold">
              {lastRefreshed.toLocaleTimeString('vi-VN')}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="section-filter" className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Lớp học phần:
        </label>
        <select
          id="section-filter"
          value={selectedSectionId}
          onChange={(e) => handleSectionChange(e.target.value)}
          className="input max-w-xs px-3 py-1.5 text-xs font-semibold"
        >
          <option value="">-- Chọn lớp học --</option>
          {sections.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.name} ({sec.semester})
            </option>
          ))}
        </select>
      </div>

      {/* No section selected */}
      {!selectedSectionId && !loading && (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <LeaderboardIcon className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-500 font-medium">Chọn một lớp học để xem bảng xếp hạng.</p>
        </div>
      )}

      {/* Loading */}
      {loading && <PageLoader label="Đang tải bảng xếp hạng..." />}

      {selectedSectionId && !loading && entries.length === 0 && (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <p className="text-slate-500 font-medium">Chưa có dữ liệu bảng xếp hạng cho lớp này.</p>
        </div>
      )}

      {selectedSectionId && !loading && entries.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 bg-primary px-5 py-3 text-white">
            <LeaderboardIcon className="h-4 w-4" />
            <h3 className="text-sm font-bold uppercase tracking-wide">
              {currentSection?.name ?? 'Bảng xếp hạng'}
            </h3>
          </div>

          <div className="space-y-4 p-5">
            <div className="flex flex-col items-center justify-between gap-3 text-xs font-medium text-slate-600 sm:flex-row">
              <div className="flex items-center gap-1.5">
                <span>Hiển thị</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
                <span>dòng</span>
              </div>

              <div className="flex w-full items-center gap-1.5 sm:w-auto">
                <span>Tìm kiếm:</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 sm:w-60"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left">
                    <th className="w-16 px-4 py-3 text-center text-xs font-bold text-slate-700">
                      <button type="button" onClick={() => handleSort('rank')} className="inline-flex items-center">
                        #
                        {sortIndicator('rank')}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-700">
                      <button type="button" onClick={() => handleSort('studentName')} className="inline-flex items-center">
                        Sinh viên
                        {sortIndicator('studentName')}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-700">
                      <button type="button" onClick={() => handleSort('sectionName')} className="inline-flex items-center">
                        Lớp học phần
                        {sortIndicator('sectionName')}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-700">
                      <button type="button" onClick={() => handleSort('totalScore')} className="inline-flex items-center">
                        Điểm SV/Tổng điểm
                        {sortIndicator('totalScore')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-xs text-slate-700">
                  {paginatedEntries.map((entry) => (
                    <tr key={entry.studentId} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-4 py-3.5 text-center font-bold text-slate-800">{entry.rank}</td>
                      <td className="px-6 py-3.5 font-semibold">
                        <Link
                          to={`/instructor/classes/${selectedSectionId}/students/${entry.studentUserId || entry.studentId}/profile`}
                          className="cursor-pointer text-primary hover:underline"
                        >
                          {entry.studentName}
                        </Link>
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-600">
                        {currentSection?.name ?? ''}
                      </td>
                      <td className="px-6 py-3.5 text-right font-black text-slate-800">
                        {formatScore(entry.totalScore)}/{formatScore(maxPossibleScore || 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sortedEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-medium text-slate-500">
                Không có sinh viên phù hợp với từ khóa tìm kiếm.
              </div>
            ) : (
              <div className="flex flex-col items-center justify-between gap-3 pt-3 text-xs font-medium text-slate-500 sm:flex-row">
                <div>
                  Hiển thị {startIndex} đến {endIndex} của {sortedEntries.length} dòng
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    className="rounded border border-slate-200 px-3 py-1.5 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Trước
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(i + 1)}
                      className={`rounded border px-3 py-1.5 transition-colors ${
                        currentPage === i + 1
                          ? 'border-primary bg-primary font-bold text-white'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    className="rounded border border-slate-200 px-3 py-1.5 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
