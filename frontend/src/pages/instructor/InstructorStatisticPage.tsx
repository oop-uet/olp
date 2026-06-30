import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface SectionOption {
  id: string
  name: string
  semester: string
}

interface ExerciseStat {
  exerciseId: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  attemptedCount: number
  completedCount: number
  averageScore: number
}

interface StatsReport {
  totalStudents: number
  exercises: ExerciseStat[]
}

const DIFFICULTY_BADGE: Record<string, { className: string; label: string }> = {
  easy: { className: 'badge-green', label: 'Dễ' },
  medium: { className: 'badge-yellow', label: 'Trung bình' },
  hard: { className: 'badge-red', label: 'Khó' },
}

function getDifficultyBadge(difficulty: string) {
  return DIFFICULTY_BADGE[difficulty] ?? { className: 'badge-gray', label: difficulty }
}

export function InstructorStatisticPage() {
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [loadingSections, setLoadingSections] = useState(true)

  const [stats, setStats] = useState<StatsReport | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  // Fetch sections
  useEffect(() => {
    fetchSections()
  }, [])

  // Fetch stats when section changes
  useEffect(() => {
    if (selectedSectionId) {
      fetchStats(selectedSectionId)
    } else {
      setStats(null)
    }
  }, [selectedSectionId])

  async function fetchSections() {
    try {
      setLoadingSections(true)
      const response = await api.get('/api/instructor/sections')
      setSections(response.data)
      if (response.data.length > 0) {
        setSelectedSectionId(response.data[0].id)
      }
    } catch {
      toast.error('Không thể tải danh sách lớp học.')
    } finally {
      setLoadingSections(false)
    }
  }

  async function fetchStats(sectionId: string) {
    setLoadingStats(true)
    try {
      const response = await api.get(`/api/instructor/sections/${sectionId}/stats`)
      setStats(response.data)
    } catch {
      toast.error('Không thể tải báo cáo thống kê.')
    } finally {
      setLoadingStats(false)
    }
  }

  if (loadingSections) {
    return <PageLoader label="Đang tải danh sách lớp học..." />
  }

  return (
    <div className="space-y-6">
      
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 font-medium py-1 px-3 bg-[#fafafa] border-b border-slate-100 rounded flex gap-1.5 items-center">
        <Link to="/instructor/classes" className="text-[#17a2b8] hover:underline">Trang chủ</Link>
        <span>/</span>
        <span className="text-slate-400">Thống kê lớp học</span>
      </div>

      {/* Page header */}
      <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-sans">Thống Kê Khóa Học</h1>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            Xem báo cáo nộp bài thực hành, tỷ lệ hoàn thành và điểm trung bình của lớp học phần.
          </p>
        </div>
        
        {/* Section Picker */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <label htmlFor="section-picker-select">Lớp học phần:</label>
          <select
            id="section-picker-select"
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
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
      </div>

      {loadingStats && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
          <Spinner /> Đang tổng hợp số liệu...
        </div>
      )}

      {!loadingStats && !stats && selectedSectionId && (
        <div className="card text-center p-12 text-slate-400 border border-slate-100 shadow-sm">
          Không tìm thấy dữ liệu thống kê cho lớp này.
        </div>
      )}

      {!loadingStats && stats && (
        <div className="space-y-6">
          {/* Summary stats widgets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5 bg-white border border-slate-100 shadow-sm flex flex-col justify-between">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Tổng số sinh viên</p>
              <h2 className="text-3xl font-bold text-[#17a2b8] mt-2">{stats.totalStudents}</h2>
            </div>
            
            <div className="card p-5 bg-white border border-slate-100 shadow-sm flex flex-col justify-between">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Tổng số bài tập đã gán</p>
              <h2 className="text-3xl font-bold text-slate-800 mt-2">{stats.exercises.length}</h2>
            </div>

            <div className="card p-5 bg-white border border-slate-100 shadow-sm flex flex-col justify-between">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Trạng thái lớp</p>
              <h2 className="text-xs font-bold text-emerald-600 mt-2.5 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                ĐANG HOẠT ĐỘNG
              </h2>
            </div>
          </div>

          {/* Detailed exercises table */}
          <div className="card overflow-hidden border border-slate-100 shadow-sm">
            <div className="bg-[#17a2b8] text-white px-5 py-3.5 flex items-center gap-2">
              <span className="text-lg">☰</span>
              <h3 className="font-bold text-sm uppercase tracking-wide">Chi Tiết Báo Cáo Thực Hành</h3>
            </div>
            
            <div className="p-5">
              {stats.exercises.length === 0 ? (
                <p className="text-center py-8 text-sm text-slate-400">Chưa có bài tập nào được phân lịch để thống kê.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase">
                        <th className="px-4 py-3 text-left">Bài thực hành</th>
                        <th className="px-4 py-3 text-left w-24">Độ khó</th>
                        <th className="px-4 py-3 text-center w-28">Đã nộp</th>
                        <th className="px-4 py-3 text-center w-28">Hoàn thành</th>
                        <th className="px-4 py-3 text-center w-28">Điểm trung bình</th>
                        <th className="px-4 py-3 text-left w-60">Tỷ lệ hoàn thành</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                      {stats.exercises.map((ex) => {
                        const badge = getDifficultyBadge(ex.difficulty)
                        const total = stats.totalStudents || 1
                        const compRate = Math.min(100, (ex.completedCount / total) * 100)

                        return (
                          <tr key={ex.exerciseId} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-slate-800 font-bold">{ex.title}</td>
                            <td className="px-4 py-3">
                              <span className={badge.className}>{badge.label}</span>
                            </td>
                            <td className="px-4 py-3 text-center text-slate-600 font-mono">
                              {ex.attemptedCount} / {stats.totalStudents}
                            </td>
                            <td className="px-4 py-3 text-center text-emerald-600 font-bold font-mono">
                              {ex.completedCount}
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-slate-700 font-mono">
                              {ex.averageScore.toFixed(1)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-full bg-slate-100 rounded-full h-2">
                                  <div
                                    className="bg-[#17a2b8] h-2 rounded-full transition-all"
                                    style={{ width: `${compRate}%` }}
                                  ></div>
                                </div>
                                <span className="font-bold text-slate-500 w-10 text-right">
                                  {compRate.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  )
}
