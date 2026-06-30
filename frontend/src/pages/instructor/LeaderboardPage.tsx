import { useEffect, useState, useRef, useCallback } from 'react'
import { api } from '../../lib/api'
import { PageLoader, LeaderboardIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

// --- Types ---

interface LeaderboardEntry {
  rank: number
  studentName: string
  studentId: string
  totalScore: number
  completedExercises: number
}

interface SectionOption {
  id: string
  name: string
  semester: string
}

// --- Constants ---

const AUTO_REFRESH_INTERVAL_MS = 10000

// --- Component ---

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

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
      setEntries(response.data)
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
    setLoading(true)
    // Loading will be cleared when fetchLeaderboard resolves
    fetchLeaderboard(sectionId).finally(() => setLoading(false))
  }



  function getRankBadge(rank: number): React.ReactNode {
    if (rank === 1) {
      return <span className="text-lg">🥇</span>
    }
    if (rank === 2) {
      return <span className="text-lg">🥈</span>
    }
    if (rank === 3) {
      return <span className="text-lg">🥉</span>
    }
    return <span className="text-sm font-medium text-gray-500">#{rank}</span>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 font-medium py-1 px-3 bg-[#fafafa] border-b border-slate-100 rounded flex gap-1.5 items-center">
        <span className="text-teal-600 cursor-default">Trang chủ</span>
        <span>/</span>
        <span className="text-slate-400">Bảng xếp hạng</span>
      </div>

      {/* Page header */}
      <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-sans">Bảng Xếp Hạng Lớp Học</h1>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            Xem thứ hạng và tiến độ thực hành của sinh viên trong lớp học phần.
          </p>
        </div>
        {lastRefreshed && (
          <div className="text-right text-[11px] font-semibold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 self-start md:self-auto">
            Tự động cập nhật mỗi 10s · Lần cuối:{' '}
            <span className="text-teal-600 font-bold">
              {lastRefreshed.toLocaleTimeString('vi-VN')}
            </span>
          </div>
        )}
      </div>

      {/* Section filter */}
      <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
        <label htmlFor="section-filter" className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Lớp học phần:
        </label>
        <select
          id="section-filter"
          value={selectedSectionId}
          onChange={(e) => handleSectionChange(e.target.value)}
          className="input py-1.5 px-3 max-w-xs text-xs font-semibold"
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

      {/* Leaderboard table */}
      {selectedSectionId && !loading && entries.length === 0 && (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <p className="text-slate-500 font-medium">Chưa có dữ liệu bảng xếp hạng cho lớp này.</p>
        </div>
      )}

      {selectedSectionId && !loading && entries.length > 0 && (
        <div className="card overflow-hidden border border-slate-100 shadow-sm">
          {/* Table Header Banner */}
          <div className="panel-header">
            <h3 className="panel-title">
              <span>🏆</span>
              Danh Sách Xếp Hạng Sinh Viên
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-24">Hạng</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Họ và Tên</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 w-44">Mã sinh viên</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 w-36">Tổng điểm</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 w-48">Bài đã hoàn thành</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
                {entries.map((entry) => (
                  <tr key={entry.studentId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-center font-bold">{getRankBadge(entry.rank)}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">{entry.studentName}</td>
                    <td className="px-5 py-3 font-medium text-slate-400">{entry.studentId}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-bold text-sm text-teal-600">
                        {entry.totalScore.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-slate-600">{entry.completedExercises}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
