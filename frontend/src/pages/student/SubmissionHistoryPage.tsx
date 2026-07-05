import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, SubmissionIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface StudentInfo {
  id: string
  username: string
  email: string
  fullName: string | null
}

interface ExerciseInfo {
  id: string
  title: string
}

interface SectionInfo {
  id: string
  name: string
}

interface Submission {
  id: string
  exerciseId: string
  sectionId: string
  score: number
  attemptNumber: number
  submittedAt: string
  student: StudentInfo
  exercise: ExerciseInfo
  section: SectionInfo
}

interface LeaderboardEntry {
  rank: number
  studentName: string
  studentId: string
  studentUserId?: string
  totalScore: number
  completedExercises: number
}

interface Section {
  id: string
  name: string
  semester: string
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts
  return (
    date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }) +
    ', ' +
    date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  )
}

function getStatusBadge(score: number): { label: string; className: string } {
  if (score >= 100) {
    return {
      label: 'Accepted',
      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-700/10 font-bold',
    }
  }
  if (score === 0) {
    return {
      label: 'Compile Error',
      className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-700/10 font-bold',
    }
  }
  return {
    label: 'Finished',
    className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-700/10 font-bold',
  }
}

export function SubmissionHistoryPage() {
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const [loadingSections, setLoadingSections] = useState(true)
  const [loadingData, setLoadingData] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  // Fetch sections once on mount
  useEffect(() => {
    async function fetchSections() {
      try {
        setLoadingSections(true)
        const response = await api.get('/api/students/sections')
        const list = response.data ?? []
        setSections(list)
        if (list.length > 0) {
          setSelectedSectionId(list[0].id)
        }
      } catch {
        toast.error('Không thể tải danh sách lớp học. Vui lòng thử lại.')
      } finally {
        setLoadingSections(false)
      }
    }
    fetchSections()
  }, [])

  // Fetch submissions and leaderboard when selected section changes
  useEffect(() => {
    if (!selectedSectionId) return

    async function fetchSubmissionsAndLeaderboard() {
      try {
        setLoadingData(true)
        const [subsRes, lbRes] = await Promise.all([
          api.get('/api/submissions', { params: { section_id: selectedSectionId } }),
          api.get(`/api/sections/${selectedSectionId}/leaderboard`),
        ])
        setSubmissions(subsRes.data.submissions ?? [])
        setLeaderboard(lbRes.data.leaderboard ?? [])
      } catch {
        toast.error('Không thể tải lịch sử bài nộp hoặc bảng xếp hạng.')
      } finally {
        setLoadingData(false)
      }
    }

    fetchSubmissionsAndLeaderboard()
  }, [selectedSectionId])

  // Filter submissions by search query
  const filteredSubmissions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return submissions
    return submissions.filter((sub) => {
      const fullName = sub.student.fullName?.toLowerCase() ?? ''
      const username = sub.student.username.toLowerCase()
      const exerciseTitle = sub.exercise.title.toLowerCase()
      return (
        fullName.includes(q) ||
        username.includes(q) ||
        exerciseTitle.includes(q) ||
        sub.id.toLowerCase().includes(q)
      )
    })
  }, [submissions, searchQuery])

  // Pagination calculation
  const totalSubmissions = filteredSubmissions.length
  const totalPages = Math.ceil(totalSubmissions / pageSize)
  const paginatedSubmissions = useMemo(() => {
    return filteredSubmissions.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [filteredSubmissions, currentPage])

  if (loadingSections) {
    return <PageLoader label="Đang tải danh sách lớp học..." />
  }

  if (sections.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-1.5 rounded border-b border-slate-100 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
          <Link to="/student/exercises" className="text-primary hover:underline">
            Trang chủ
          </Link>
          <span>/</span>
          <span className="text-slate-400">Bài nộp</span>
        </div>
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <SubmissionIcon className="h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">Không có lớp học phần</p>
          <p className="text-sm text-gray-500">
            Bạn chưa đăng ký lớp học phần nào trên hệ thống.
          </p>
        </div>
      </div>
    )
  }

  const selectedSection = sections.find((s) => s.id === selectedSectionId)

  return (
    <div className="space-y-5">
      {/* Authentic UET Breadcrumb Navigation */}
      <div className="flex items-center gap-1.5 rounded border-b border-slate-100 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
        <Link to="/student/exercises" className="text-primary hover:underline">
          Trang chủ
        </Link>
        <span>/</span>
        <span className="text-slate-400">Bài nộp</span>
      </div>

      {/* Header Selector Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h1 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
          <span>📁</span> Lịch sử nộp bài
        </h1>
        <div className="flex items-center gap-2">
          <label
            htmlFor="section-select"
            className="text-xs font-bold uppercase tracking-wider text-slate-500"
          >
            Lớp học phần:
          </label>
          <select
            id="section-select"
            value={selectedSectionId}
            onChange={(e) => {
              setSelectedSectionId(e.target.value)
              setCurrentPage(1)
            }}
            className="input py-1.5 px-3 max-w-xs text-xs font-bold border-slate-200 focus:ring-primary/20"
          >
            {sections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name} ({sec.semester})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Left Column: Submissions Table Card */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Card Header Banner */}
          <div className="flex flex-wrap items-center justify-between bg-gradient-to-r from-teal-600 to-cyan-500 px-5 py-3.5 text-white gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <h3 className="text-xs font-bold tracking-wide uppercase">
                Danh Sách Các Bài Nộp
              </h3>
            </div>
            {/* Search Input */}
            <input
              type="text"
              placeholder="Tìm theo SV, bài tập..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="text-[11px] font-medium text-slate-800 bg-white/95 placeholder:text-slate-400 rounded-lg px-2.5 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-secondary/50 border-0 shadow-inner"
            />
          </div>

          {loadingData ? (
            <div className="py-20 text-center">
              <PageLoader label="Đang tải dữ liệu bài nộp..." />
            </div>
          ) : paginatedSubmissions.length === 0 ? (
            <div className="py-16 text-center text-slate-500 font-medium space-y-2">
              <p>Chưa có dữ liệu bài nộp nào trong lớp học này.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase select-none">
                    <th className="px-4 py-3 text-left w-24"># ID</th>
                    <th className="px-4 py-3 text-left">Sinh viên</th>
                    <th className="px-4 py-3 text-left">Bài tập</th>
                    <th className="px-4 py-3 text-left w-52">Thời gian</th>
                    <th className="px-4 py-3 text-center w-20">Điểm</th>
                    <th className="px-4 py-3 text-center w-36">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
                  {paginatedSubmissions.map((submission) => {
                    const statusInfo = getStatusBadge(submission.score)
                    return (
                      <tr key={submission.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold">
                          <Link
                            to={`/student/submissions/${submission.id}`}
                            className="text-primary hover:underline"
                          >
                            {submission.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/student/classes/${selectedSectionId}/students/${submission.student.id}/profile`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {submission.student.fullName || submission.student.username}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/student/exercises/${submission.exerciseId}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {submission.exercise.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-medium">
                          {formatTimestamp(submission.submittedAt)}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-900">
                          {submission.score.toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge ${statusInfo.className}`}>
                            {statusInfo.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 gap-2">
                  <span className="text-xs text-slate-500 font-medium">
                    Hiển thị dòng {(currentPage - 1) * pageSize + 1} -{' '}
                    {Math.min(currentPage * pageSize, totalSubmissions)} trong tổng số{' '}
                    {totalSubmissions}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(1)}
                      className="btn btn-secondary btn-sm select-none"
                    >
                      Đầu
                    </button>
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((prev) => prev - 1)}
                      className="btn btn-secondary btn-sm select-none"
                    >
                      Trước
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = currentPage - 2 + i
                      if (currentPage <= 2) pageNum = i + 1
                      else if (currentPage >= totalPages - 1) pageNum = totalPages - 4 + i

                      if (pageNum < 1 || pageNum > totalPages) return null

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`btn btn-sm ${
                            currentPage === pageNum ? 'btn-primary' : 'btn-secondary'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((prev) => prev + 1)}
                      className="btn btn-secondary btn-sm select-none"
                    >
                      Sau
                    </button>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      className="btn btn-secondary btn-sm select-none"
                    >
                      Cuối
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Leaderboard Sidebar */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Sidebar Header */}
          <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-4 py-3.5 text-white">
            <h3 className="text-xs font-black uppercase tracking-wide flex items-center gap-1.5">
              <span>🏆</span> Bảng Xếp Hạng
            </h3>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[10px] bg-secondary/80 text-white font-extrabold px-1.5 py-0.5 rounded uppercase">
                {selectedSection?.name}
              </span>
            </div>
          </div>

          {/* Sidebar Content */}
          <div className="p-4 space-y-3">
            {loadingData ? (
              <p className="text-xs text-slate-400 py-4 text-center">Đang tải...</p>
            ) : leaderboard.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Không có xếp hạng.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {leaderboard.slice(0, 10).map((entry) => (
                  <div
                    key={entry.studentId}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 text-xs gap-2"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-bold text-slate-500 w-4 select-none">
                        {entry.rank}
                      </span>
                      <Link
                        to={`/student/classes/${selectedSectionId}/students/${
                          entry.studentUserId || entry.studentId
                        }/profile`}
                        className="font-semibold text-primary hover:underline truncate"
                      >
                        {entry.studentName}
                      </Link>
                    </div>
                    <span className="text-slate-400 font-mono select-none">{entry.studentId}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
