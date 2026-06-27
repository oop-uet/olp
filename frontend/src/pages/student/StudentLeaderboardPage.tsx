import { useEffect, useState, useCallback } from 'react'
import { api } from '../../lib/api'
import { PageLoader, LeaderboardIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { useAuthStore } from '../../stores/auth.store'

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

// --- Component ---

export function StudentLeaderboardPage() {
  const user = useAuthStore((state) => state.user)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [loadingSections, setLoadingSections] = useState(true)
  const [loadingBoard, setLoadingBoard] = useState(false)

  // Fetch enrolled sections on mount.
  useEffect(() => {
    fetchSections()
  }, [])

  // Fetch leaderboard whenever the selected section changes.
  useEffect(() => {
    if (selectedSectionId) {
      fetchLeaderboard(selectedSectionId)
    } else {
      setEntries([])
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

  const fetchLeaderboard = useCallback(async (sectionId: string) => {
    try {
      setLoadingBoard(true)
      const response = await api.get(`/api/sections/${sectionId}/leaderboard`)
      // Endpoint may return either a bare array or { leaderboard: [...] }.
      const data: LeaderboardEntry[] = response.data.leaderboard ?? response.data ?? []
      setEntries(data)
    } catch {
      toast.error('Không thể tải bảng xếp hạng. Vui lòng thử lại.')
    } finally {
      setLoadingBoard(false)
    }
  }, [])

  function getScoreColor(score: number): string {
    if (score >= 80) return 'text-success-700'
    if (score >= 50) return 'text-warning-700'
    return 'text-danger-700'
  }

  function getRankBadge(rank: number): React.ReactNode {
    if (rank === 1) return <span className="text-lg">🥇</span>
    if (rank === 2) return <span className="text-lg">🥈</span>
    if (rank === 3) return <span className="text-lg">🥉</span>
    return <span className="text-sm font-medium text-gray-500">#{rank}</span>
  }

  function isCurrentUser(entry: LeaderboardEntry): boolean {
    if (!user) return false
    return entry.studentName === user.username || entry.studentId === user.id
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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <h1 className="text-2xl font-semibold text-gray-800">Bảng xếp hạng</h1>

      {/* Section picker */}
      <div className="flex items-center gap-3">
        <label htmlFor="section-filter" className="text-sm font-medium text-gray-700">
          Lớp học:
        </label>
        <select
          id="section-filter"
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

      {/* Loading */}
      {loadingBoard && <PageLoader label="Đang tải bảng xếp hạng..." />}

      {/* Empty */}
      {!loadingBoard && entries.length === 0 && (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <LeaderboardIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">Chưa có dữ liệu bảng xếp hạng cho lớp này.</p>
        </div>
      )}

      {/* Leaderboard table */}
      {!loadingBoard && entries.length > 0 && (
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
              {entries.map((entry) => {
                const mine = isCurrentUser(entry)
                return (
                  <tr
                    key={entry.studentId}
                    className={mine ? 'bg-primary-50' : 'hover:bg-gray-50'}
                  >
                    <td className="table-td text-center">{getRankBadge(entry.rank)}</td>
                    <td className="table-td font-medium text-gray-900">
                      {entry.studentName}
                      {mine && <span className="ml-2 badge-blue">Bạn</span>}
                    </td>
                    <td className="table-td text-gray-500">{entry.studentId}</td>
                    <td className="table-td text-right">
                      <span className={`text-sm font-bold ${getScoreColor(entry.totalScore)}`}>
                        {entry.totalScore.toFixed(1)}
                      </span>
                    </td>
                    <td className="table-td text-right text-gray-700">
                      {entry.completedExercises}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
