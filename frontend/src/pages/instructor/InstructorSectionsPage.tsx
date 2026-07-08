import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName, formatSemesterDisplayName, parseSemesterId } from '../../utils/semester'

interface InstructorInfo {
  id: string
  fullName?: string | null
  username?: string | null
  email?: string | null
}

export interface InstructorSection {
  id: string
  name: string
  semester: string
  instructorId: string
  createdAt: string
  instructor: InstructorInfo | null
}

interface LeaderboardEntry {
  rank: number
  studentName: string
  studentId: string
  totalScore: number
}

export function InstructorSectionsPage() {
  const [sections, setSections] = useState<InstructorSection[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSectionId, setActiveSectionId] = useState<string>('')
  
  // Leaderboard states
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false)
  const [maxPossibleScore, setMaxPossibleScore] = useState<number>(0)

  useEffect(() => {
    fetchSections()
  }, [])

  useEffect(() => {
    if (activeSectionId) {
      fetchLeaderboard(activeSectionId)
    }
  }, [activeSectionId])

  async function fetchSections() {
    setLoading(true)
    try {
      const response = await api.get('/api/instructor/sections')
      const data = response.data ?? []
      setSections(data)
      if (data.length > 0) {
        setActiveSectionId(data[0].id)
      }
    } catch {
      toast.error('Không thể tải danh sách lớp. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchLeaderboard(sectionId: string) {
    setLoadingLeaderboard(true)
    try {
      const response = await api.get(`/api/sections/${sectionId}/leaderboard`)
      const data: LeaderboardEntry[] = response.data.leaderboard ?? response.data ?? []
      setLeaderboard(data.slice(0, 10)) // top 10
      setMaxPossibleScore(response.data.maxPossibleScore ?? 0)
    } catch {
      setLeaderboard([])
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải danh sách lớp học..." />
  }

  // Group sections by semester
  const sectionsBySemester: Record<string, InstructorSection[]> = {}
  for (const s of sections) {
    if (!sectionsBySemester[s.semester]) {
      sectionsBySemester[s.semester] = []
    }
    sectionsBySemester[s.semester].push(s)
  }

  const sortedSemesters = Object.keys(sectionsBySemester).sort((a, b) => {
    const parsedA = parseSemesterId(a)
    const parsedB = parseSemesterId(b)
    if (!parsedA || !parsedB) return b.localeCompare(a)
    if (parsedA.startYear !== parsedB.startYear) return parsedB.startYear - parsedA.startYear
    return parsedB.hk - parsedA.hk
  })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-800 text-lg shadow-sm">
        CÁC LỚP HỌC PHẦN
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        
        {/* Left Column: Semester Sections (75% width) */}
        <div className="space-y-6 lg:w-3/4">
          {sections.length === 0 ? (
            <div className="card p-12 text-center border border-slate-100 shadow-sm text-slate-400 font-medium">
              Bạn chưa được phân công lớp học phần nào.
            </div>
          ) : (
            sortedSemesters.map((semester) => (
              <div key={semester} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                
                {/* Semester Header: Teal style */}
                <div className="bg-[#00adb5] text-white px-5 py-3 font-bold text-sm tracking-wide select-none">
                  {formatSemesterDisplayName(semester, true)}
                </div>

                {/* Class sections list */}
                <div className="p-4 space-y-3">
                  {sectionsBySemester[semester].map((section) => (
                    <Link
                      key={section.id}
                      to={`/instructor/classes/${section.id}`}
                      className="block w-full text-left bg-[#42a5f5] hover:bg-[#1e88e5] text-white font-bold py-3.5 px-6 rounded-lg shadow-sm transition-all duration-150 active:scale-[0.99] select-none text-sm leading-relaxed"
                    >
                      {formatSectionDisplayName(section.name)} - Lập trình hướng đối tượng
                    </Link>
                  ))}
                </div>

              </div>
            ))
          )}
        </div>

        {/* Right Column: Leaderboard Sidebar (25% width) */}
        {sections.length > 0 && (
          <div className="space-y-5 lg:w-1/4 lg:sticky lg:top-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              
              {/* Leaderboard Header */}
              <div className="bg-[#00adb5] text-white px-4 py-3 flex items-center gap-2 font-bold text-xs uppercase tracking-wide select-none">
                <span>☰</span> Bảng Xếp Hạng
              </div>
              
              <div className="p-4 space-y-4">
                
                {/* Section selection tabs */}
                <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-3">
                  {sections.map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => setActiveSectionId(sec.id)}
                      className={`px-3 py-1.5 text-xs font-bold rounded transition-all duration-150 cursor-pointer ${
                        activeSectionId === sec.id
                          ? 'bg-[#29b6f6] text-white shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {formatSectionDisplayName(sec.name)}
                    </button>
                  ))}
                </div>

                {/* Leaderboard records */}
                {loadingLeaderboard ? (
                  <div className="flex items-center gap-2 py-8 justify-center text-xs text-slate-400">
                    <Spinner /> Đang tải xếp hạng...
                  </div>
                ) : leaderboard.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8 italic font-medium">Chưa có xếp hạng lớp.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-xs">
                    {leaderboard.map((item, idx) => (
                      <li key={item.studentId} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-b-0">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-800 w-4 text-center">
                            {idx + 1 === 1 ? (
                              <span className="text-sm filter drop-shadow-sm select-none" title="Huy chương Vàng">🥇</span>
                            ) : idx + 1 === 2 ? (
                              <span className="text-sm filter drop-shadow-sm select-none" title="Huy chương Bạc">🥈</span>
                            ) : idx + 1 === 3 ? (
                              <span className="text-sm filter drop-shadow-sm select-none" title="Huy chương Đồng">🥉</span>
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <Link
                            to={`/instructor/classes/${activeSectionId}/students/${item.studentId}/profile`}
                            className="text-sky-600 font-semibold hover:underline truncate max-w-[130px]"
                            title={item.studentName}
                          >
                            {item.studentName}
                          </Link>
                        </div>
                        <span className="font-bold text-[#00adb5]">
                          {item.totalScore.toFixed(0)}/{maxPossibleScore || 2201}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
