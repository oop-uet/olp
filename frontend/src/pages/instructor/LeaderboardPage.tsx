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
      // Try to get sections from the admin endpoint
      const sectionsRes = await api.get('/api/admin/sections')
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
      // If admin sections endpoint is not accessible, sections dropdown remains empty
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

  function getScoreColor(score: number): string {
    if (score >= 80) return 'text-success-700'
    if (score >= 50) return 'text-warning-700'
    return 'text-danger-700'
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
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Bảng xếp hạng</h1>
        {lastRefreshed && (
          <p className="text-xs text-gray-400">
            Tự động làm mới mỗi 10s · Cập nhật lần cuối:{' '}
            {lastRefreshed.toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        )}
      </div>

      {/* Section filter */}
      <div className="flex items-center gap-3">
        <label htmlFor="section-filter" className="text-sm font-medium text-gray-700">
          Lớp học:
        </label>
        <select
          id="section-filter"
          value={selectedSectionId}
          onChange={(e) => handleSectionChange(e.target.value)}
          className="input max-w-xs"
        >
          <option value="">Chọn lớp học</option>
          {sections.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.name} ({sec.semester})
            </option>
          ))}
        </select>
      </div>

      {/* No section selected */}
      {!selectedSectionId && !loading && (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <LeaderboardIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">Chọn một lớp học để xem bảng xếp hạng.</p>
        </div>
      )}

      {/* Loading */}
      {loading && <PageLoader label="Đang tải bảng xếp hạng..." />}

      {/* Leaderboard table */}
      {selectedSectionId && !loading && entries.length === 0 && (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <p className="text-gray-500">Chưa có dữ liệu bảng xếp hạng cho lớp này.</p>
        </div>
      )}

      {selectedSectionId && !loading && entries.length > 0 && (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th text-center">Hạng</th>
                <th className="table-th">Tên</th>
                <th className="table-th">Mã sinh viên</th>
                <th className="table-th text-right">Tổng điểm</th>
                <th className="table-th text-right">Bài đã hoàn thành</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry) => (
                <tr key={entry.studentId} className="hover:bg-gray-50">
                  <td className="table-td text-center">{getRankBadge(entry.rank)}</td>
                  <td className="table-td font-medium text-gray-900">{entry.studentName}</td>
                  <td className="table-td text-gray-500">{entry.studentId}</td>
                  <td className="table-td text-right">
                    <span className={`text-sm font-bold ${getScoreColor(entry.totalScore)}`}>
                      {entry.totalScore.toFixed(1)}
                    </span>
                  </td>
                  <td className="table-td text-right text-gray-700">{entry.completedExercises}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
