import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, SubmissionIcon, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName, formatSemesterDisplayName } from '../../utils/semester'

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
      className: 'bg-emerald-500 text-white shadow-sm',
    }
  }
  if (score === 0) {
    return {
      label: 'Compile Error',
      className: 'bg-rose-500 text-white shadow-sm',
    }
  }
  return {
    label: 'Finished',
    className: 'bg-blue-500 text-white shadow-sm',
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

  // Sorting and Pagination state
  const [sortField, setSortField] = useState<'submittedAt' | 'score' | 'exerciseTitle' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
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

  const sortedSubmissions = useMemo(() => {
    if (!sortField) return filteredSubmissions
    return [...filteredSubmissions].sort((a, b) => {
      let valA = sortField === 'exerciseTitle' ? a.exercise.title : a[sortField]
      let valB = sortField === 'exerciseTitle' ? b.exercise.title : b[sortField]
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredSubmissions, sortField, sortOrder])

  const toggleSort = (field: 'submittedAt' | 'score' | 'exerciseTitle') => {
    setCurrentPage(1)
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // Pagination calculation
  const totalSubmissions = sortedSubmissions.length
  const totalPages = Math.ceil(totalSubmissions / pageSize)
  const paginatedSubmissions = useMemo(() => {
    return sortedSubmissions.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }, [sortedSubmissions, currentPage, pageSize])

  if (loadingSections) {
    return <PageLoader label="Đang tải danh sách lớp học..." />
  }

  if (sections.length === 0) {
    return (
      <div className="space-y-5">
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
                {formatSectionDisplayName(sec.name)} ({formatSemesterDisplayName(sec.semester)})
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
            <div className="overflow-x-auto px-6 pb-8">
              <table className="min-w-full border-separate border-spacing-0 text-left">
                <thead>
                  <tr className="text-base font-bold text-slate-800">
                    <th className="border-b-2 border-slate-300 px-4 py-5 text-center w-20 select-none">STT</th>
                    <th className="border-b-2 border-slate-300 px-4 py-5 w-28"># ID</th>
                    <th className="border-b-2 border-slate-300 px-4 py-5">Sinh viên</th>
                    <th
                      onClick={() => toggleSort('exerciseTitle')}
                      className="border-b-2 border-slate-300 px-4 py-5 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-800"
                    >
                      Bài tập {sortField === 'exerciseTitle' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th
                      onClick={() => toggleSort('submittedAt')}
                      className="border-b-2 border-slate-300 px-4 py-5 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-800"
                    >
                      Thời gian {sortField === 'submittedAt' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th
                      onClick={() => toggleSort('score')}
                      className="border-b-2 border-slate-300 px-4 py-5 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-800"
                    >
                      Điểm {sortField === 'score' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th className="border-b-2 border-slate-300 px-4 py-5 w-36">Kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSubmissions.map((submission: Submission, index: number) => {
                    const statusInfo = getStatusBadge(submission.score)
                    return (
                      <tr key={submission.id} className="text-base text-slate-700 hover:bg-slate-50">
                        <td className="border-b border-slate-200 px-4 py-4 text-center text-slate-400 font-bold">
                          {index + 1 + (currentPage - 1) * pageSize}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-4">
                          <Link
                            to={`/student/submissions/${submission.id}`}
                            className="font-semibold text-sky-500 hover:underline"
                          >
                            {submission.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="border-b border-slate-200 px-4 py-4">
                          <Link
                            to={`/student/classes/${selectedSectionId}/students/${submission.student.id}/profile`}
                            className="font-bold text-sky-500 hover:underline"
                          >
                            {submission.student.fullName || submission.student.username}
                          </Link>
                        </td>
                        <td className="border-b border-slate-200 px-4 py-4 text-slate-800 font-semibold">
                          {submission.exercise.title}
                        </td>
                        <td className="whitespace-nowrap border-b border-slate-200 px-4 py-4 text-slate-600">
                          {formatTimestamp(submission.submittedAt)}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-4 text-center font-bold text-slate-700">
                          {submission.score.toFixed(0)}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-4">
                          <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${statusInfo.className}`}>
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.12)]">
          {/* Sidebar Header */}
          <div className="bg-gradient-to-r from-cyan-500 to-teal-500 px-6 py-4 text-white">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="text-xl leading-none">≡</span>
              Bảng Xếp Hạng
            </h2>
          </div>

          {/* Sidebar Content */}
          <div className="px-6 py-5">
            {selectedSection && (
              <div className="mb-4 border-b border-slate-200 pb-4 space-y-2">
                <div className="inline-flex rounded bg-sky-500 px-3 py-1 text-xs font-bold text-white uppercase">
                  {formatSectionDisplayName(selectedSection.name)}
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  {formatSemesterDisplayName(selectedSection.semester, true)}
                </p>
              </div>
            )}

            {loadingData ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                <Spinner /> Nạp bảng xếp hạng...
              </div>
            ) : leaderboard.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Chưa có xếp hạng cho lớp này.</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {leaderboard.slice(0, 10).map((entry, index) => (
                  <li key={entry.studentId} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 py-4">
                    <span className="text-base font-bold text-slate-800">{index + 1}</span>
                    <Link
                      to={`/student/classes/${selectedSectionId}/students/${entry.studentUserId || entry.studentId}/profile`}
                      className="min-w-0 truncate text-base font-medium text-sky-500 hover:underline"
                      title={entry.studentName}
                    >
                      {entry.studentName}
                    </Link>
                    <span className="text-base font-bold text-sky-500">{entry.totalScore.toFixed(0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
