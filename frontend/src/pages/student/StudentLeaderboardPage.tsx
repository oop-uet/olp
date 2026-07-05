import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cachedGet } from '../../lib/api'
import { PageLoader, LeaderboardIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { useAuthStore } from '../../stores/auth.store'

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

function formatScore(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

// --- Component ---

export function StudentLeaderboardPage() {
  const user = useAuthStore((state) => state.user)
  const [searchParams] = useSearchParams()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [maxPossibleScore, setMaxPossibleScore] = useState<number>(0)
  const [loadingSections, setLoadingSections] = useState(true)
  const [loadingBoard, setLoadingBoard] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(30)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

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
      const requestedSectionId = searchParams.get('section_id')
      const initialSection =
        data.find((section) => section.id === requestedSectionId) ?? data[0]
      if (initialSection) {
        setSelectedSectionId(initialSection.id)
        await fetchLeaderboard(initialSection.id)
      }
    } catch {
      toast.error('Không thể tải danh sách lớp học. Vui lòng thử lại.')
    } finally {
      setLoadingSections(false)
    }
  }

  const fetchLeaderboard = useCallback(async (sectionId: string) => {
    try {
      setLoadingBoard(true)
      const response = await cachedGet(`/api/sections/${sectionId}/leaderboard`, undefined, {
        ttlMs: 30_000,
      })
      const data: LeaderboardEntry[] = response.data.leaderboard ?? response.data ?? []
      setEntries(data)
      setMaxPossibleScore(response.data.maxPossibleScore ?? 0)
    } catch {
      toast.error('Không thể tải bảng xếp hạng. Vui lòng thử lại.')
    } finally {
      setLoadingBoard(false)
    }
  }, [])

  function isCurrentUser(entry: LeaderboardEntry): boolean {
    if (!user) return false
    return entry.studentId === user.username || entry.studentName === user.fullName
  }

  const currentSection =
    sections.find((section) => section.id === selectedSectionId) ??
    sections[0] ?? { id: '', name: '', semester: '' }

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

  const filteredEntries = entries.filter((entry) => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      entry.studentName.toLowerCase().includes(q) ||
      entry.studentId.toLowerCase().includes(q) ||
      currentSection.name.toLowerCase().includes(q)
    )
  })

  const sortedEntries = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...filteredEntries].sort((a, b) => {
      if (sortKey === 'rank') return (a.rank - b.rank) * direction
      if (sortKey === 'totalScore') return (a.totalScore - b.totalScore) * direction
      if (sortKey === 'sectionName') return currentSection.name.localeCompare(currentSection.name) * direction
      return a.studentName.localeCompare(b.studentName, 'vi') * direction
    })
  }, [filteredEntries, sortDirection, sortKey, currentSection.name])

  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / pageSize))
  const paginatedEntries = sortedEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const startIndex = sortedEntries.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endIndex = Math.min(currentPage * pageSize, sortedEntries.length)

  if (loadingSections) {
    return <PageLoader label="Đang tải bảng xếp hạng..." />
  }

  // No enrolled sections.
  if (sections.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-gray-800">Bảng xếp hạng</h1>
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <LeaderboardIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">Bạn chưa tham gia lớp học nào.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-1 sm:flex-row sm:items-center">
        <div className="flex border-b-2 border-primary -mb-[2px]">
          <button className="px-4 py-2 text-sm font-bold text-primary">
            Xếp Hạng Theo Khóa Học
          </button>
        </div>

        {sections.length > 1 && (
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <label htmlFor="section-select">Lớp học phần:</label>
            <select
              id="section-select"
              value={currentSection.id}
              onChange={(event) => {
                setSelectedSectionId(event.target.value)
                fetchLeaderboard(event.target.value)
                setCurrentPage(1)
              }}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name} ({section.semester})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loadingBoard && <PageLoader label="Đang tải bảng xếp hạng..." />}

      {/* Empty */}
      {!loadingBoard && entries.length === 0 && (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <LeaderboardIcon className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-500 font-medium">Chưa có dữ liệu bảng xếp hạng cho lớp này.</p>
        </div>
      )}

      {!loadingBoard && entries.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 bg-gradient-to-r from-teal-600 to-cyan-500 px-5 py-3 text-white">
            <LeaderboardIcon className="h-4 w-4" />
            <h3 className="text-sm font-bold uppercase tracking-wide">
              {currentSection.name}
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
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
                  {paginatedEntries.map((entry) => {
                    const mine = isCurrentUser(entry)
                    return (
                      <tr
                        key={entry.studentId}
                        className={
                          mine
                            ? 'bg-primary-50/40 border-l-4 border-primary font-semibold transition-colors'
                            : 'hover:bg-slate-50/50 transition-colors'
                        }
                      >
                        <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                          {entry.rank}
                        </td>
                        <td className="px-6 py-3.5 font-semibold text-slate-800">
                          <span className={mine ? 'text-primary' : 'text-slate-800'}>
                            {entry.studentName}
                          </span>
                          {mine && (
                            <span className="ml-2 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                              Bạn
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-slate-600 font-medium">
                          {currentSection.name}
                        </td>
                        <td className="px-6 py-3.5 text-right font-black text-slate-800">
                          {formatScore(entry.totalScore)}/{formatScore(maxPossibleScore || 100)}
                        </td>
                      </tr>
                    )
                  })}
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
                      className={`px-3 py-1.5 rounded border transition-colors ${
                        currentPage === i + 1
                          ? 'bg-primary text-white border-primary font-bold'
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
