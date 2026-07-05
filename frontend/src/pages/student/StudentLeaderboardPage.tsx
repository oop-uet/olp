import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
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

  const currentSection =
    sections.find((section) => section.id === selectedSectionId) ?? sections[0]

  // Filter entries based on search input
  const filteredEntries = entries.filter((entry) => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      entry.studentName.toLowerCase().includes(q) ||
      entry.studentId.toLowerCase().includes(q)
    )
  })

  // Paginated entries
  const totalPages = Math.ceil(filteredEntries.length / pageSize)
  const paginatedEntries = filteredEntries.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Course tab navigation & Dropdown picker */}
      <div className="border-b border-slate-200 pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

      {/* Loading states */}
      {loadingBoard && <PageLoader label="Đang tải bảng xếp hạng..." />}

      {/* Empty */}
      {!loadingBoard && entries.length === 0 && (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <LeaderboardIcon className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-500 font-medium">Chưa có dữ liệu bảng xếp hạng cho lớp này.</p>
        </div>
      )}

      {/* Main Leaderboard Table */}
      {!loadingBoard && entries.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Solid Theme Brand Primary Header Bar */}
          <div className="flex items-center gap-2 bg-primary px-5 py-3 text-white">
            <span className="text-base">📋</span>
            <h3 className="text-sm font-bold tracking-wide uppercase">
              {currentSection.name}
            </h3>
          </div>

          <div className="p-5 space-y-4">
            {/* Table Controls (Show entries & Search) */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-medium">
              <div className="flex items-center gap-1.5">
                <span>Hiển thị</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
                <span>dòng</span>
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <span>Tìm kiếm:</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="border border-slate-200 rounded px-2.5 py-1.5 w-full sm:w-60 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Table layout */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left">
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 w-16">#</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-700">Sinh viên</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-700">Lớp học phần</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-700 text-right">Điểm SV/Tổng điểm</th>
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
                          <Link
                            to={`/student/classes/${currentSection.id}/students/${entry.studentUserId || entry.studentId}/profile`}
                            className="text-primary hover:underline cursor-pointer"
                          >
                            {entry.studentName}
                          </Link>
                          {mine && (
                            <span className="ml-2 bg-primary text-white text-[9px] font-extrabold rounded-full px-1.5 py-0.5">
                              Bạn
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-slate-600 font-medium">
                          {currentSection.name}
                        </td>
                        <td className="px-6 py-3.5 text-right font-black text-slate-800">
                          {entry.totalScore.toFixed(0)}/{maxPossibleScore || 100}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 text-xs text-slate-500 font-medium">
                <div>
                  Hiển thị {(currentPage - 1) * pageSize + 1} đến{' '}
                  {Math.min(currentPage * pageSize, filteredEntries.length)} của{' '}
                  {filteredEntries.length} dòng
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Trước
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => (
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
                    className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
