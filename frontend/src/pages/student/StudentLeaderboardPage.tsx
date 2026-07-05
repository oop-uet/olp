import { useEffect, useState, useCallback } from 'react'
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
  const [loadingSections, setLoadingSections] = useState(true)
  const [loadingBoard, setLoadingBoard] = useState(false)

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
      // Endpoint may return either a bare array or { leaderboard: [...] }.
      const data: LeaderboardEntry[] = response.data.leaderboard ?? response.data ?? []
      setEntries(data)
    } catch {
      toast.error('Không thể tải bảng xếp hạng. Vui lòng thử lại.')
    } finally {
      setLoadingBoard(false)
    }
  }, [])



  function getRankBadge(rank: number): React.ReactNode {
    if (rank === 1) return <span className="text-lg">🥇</span>
    if (rank === 2) return <span className="text-lg">🥈</span>
    if (rank === 3) return <span className="text-lg">🥉</span>
    return <span className="text-sm font-medium text-gray-500">#{rank}</span>
  }

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 font-medium py-1 px-3 bg-slate-50 border-b border-slate-100 rounded flex gap-1.5 items-center">
        <span className="text-primary cursor-default">Trang chủ</span>
        <span>/</span>
        <span className="text-slate-400">Bảng xếp hạng</span>
      </div>

      {/* Page header */}
      <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-sans">Bảng Xếp Hạng Lớp Học</h1>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            Xem thứ hạng và tiến độ thực hành của bạn trong lớp học phần.
          </p>
        </div>
      </div>

      {/* Current course section */}
      <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Lớp học phần
        </p>
        <select
          value={currentSection.id}
          onChange={(event) => {
            setSelectedSectionId(event.target.value)
            fetchLeaderboard(event.target.value)
          }}
          className="mt-2 h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name} ({section.semester})
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loadingBoard && <PageLoader label="Đang tải bảng xếp hạng..." />}

      {/* Empty */}
      {!loadingBoard && entries.length === 0 && (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <LeaderboardIcon className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-500 font-medium">Chưa có dữ liệu bảng xếp hạng cho lớp này.</p>
        </div>
      )}

      {/* Leaderboard table */}
      {!loadingBoard && entries.length > 0 && (
        <div className="card overflow-hidden border border-slate-100 shadow-sm">
          {/* Table Header Banner */}
          <div className="panel-header">
            <h3 className="panel-title">
              <span>🏆</span>
              Danh Sách Xếp Hạng Lớp
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
                {entries.map((entry) => {
                  const mine = isCurrentUser(entry)
                  return (
                    <tr
                      key={entry.studentId}
                      className={mine ? 'bg-primary-50/20' : 'hover:bg-slate-50/50 transition-colors'}
                    >
                      <td className="px-5 py-3 text-center font-bold">{getRankBadge(entry.rank)}</td>
                      <td className="px-5 py-3 font-semibold text-slate-800">
                        {entry.studentName}
                        {mine && <span className="ml-2 bg-primary-50 text-primary text-[9px] font-extrabold rounded-full px-1.5 py-0.5 ring-1 ring-primary/10">Bạn</span>}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-400">{entry.studentId}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-bold text-sm text-primary">
                          {entry.totalScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-slate-600">{entry.completedExercises}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
