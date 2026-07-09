import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName } from '../../utils/semester'

interface StudentInfo {
  userId: string
  studentId: string
  username: string
  fullName: string
  email: string
}

interface SectionInfo {
  id: string
  name: string
  semester: string
}

interface Summary {
  rank: number
  attemptedExercises: number
  completedExercises: number
  attemptCount: number
  totalScore: number
  totalPossible: number
  completionPercent: number
}

interface SubmissionRow {
  id: string
  exerciseId: string
  exerciseTitle: string
  score: number | null
  manualScore: number | null
  effectiveScore: number
  attemptNumber: number
  submittedAt: string
  status: 'finished' | 'submitted'
}

interface ExerciseProgress {
  exerciseId: string
  title: string
  week: number | null
  bestScore: number
  attemptCount: number
  lastSubmittedAt: string | null
  status: 'completed' | 'in_progress' | 'not_started'
}

interface ProfileResponse {
  section: SectionInfo
  student: StudentInfo
  summary: Summary
  submissions: SubmissionRow[]
  progress: ExerciseProgress[]
}

function formatTimestamp(ts: string) {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}


function getStatusLabel(status: SubmissionRow['status'], score: number) {
  if (score >= 100) return { label: 'Hoàn thành', className: 'badge-green' }
  return status === 'finished'
    ? { label: 'Hoàn thành', className: 'badge-green' }
    : { label: 'Đã nộp', className: 'badge-yellow' }
}

export function InstructorStudentProfilePage() {
  const { id, studentId } = useParams<{ id: string; studentId: string }>()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  
  const isStudentView = window.location.pathname.startsWith('/student')

  useEffect(() => {
    if (id && studentId) fetchProfile(id, studentId)
  }, [id, studentId])

  async function fetchProfile(sectionId: string, studentUserId: string) {
    setLoading(true)
    try {
      const response = await api.get(`/api/sections/${sectionId}/students/${studentUserId}/profile`)
      setProfile(response.data)
    } catch {
      toast.error('Không thể tải hồ sơ sinh viên.')
    } finally {
      setLoading(false)
    }
  }

  const submissions = useMemo(() => profile?.submissions ?? [], [profile?.submissions])

  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'exerciseTitle' | 'submittedAt' | 'effectiveScore' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filteredSubmissions = useMemo(() => {
    if (!search.trim()) return submissions
    const q = search.toLowerCase()
    return submissions.filter((s) => s.exerciseTitle.toLowerCase().includes(q))
  }, [submissions, search])

  const sortedSubmissions = useMemo(() => {
    if (!sortField) return filteredSubmissions
    return [...filteredSubmissions].sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredSubmissions, sortField, sortOrder])

  const paginatedSubmissions = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedSubmissions.slice(startIndex, startIndex + pageSize)
  }, [sortedSubmissions, currentPage, pageSize])

  const totalPages = Math.ceil(sortedSubmissions.length / pageSize)

  const toggleSort = (field: 'exerciseTitle' | 'submittedAt' | 'effectiveScore') => {
    setCurrentPage(1)
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const exerciseColorMap = useMemo(() => {
    const uniqueExercises = Array.from(new Set(submissions.map((s) => s.exerciseTitle)))
    const palette = [
      '#0ea5e9', // sky blue
      '#ef4444', // red
      '#84cc16', // lime green
      '#06b6d4', // cyan
      '#a855f7', // purple
      '#3b82f6', // blue
      '#10b981', // emerald
      '#f59e0b', // amber
      '#ec4899', // pink
      '#f97316', // orange
    ]
    const map = new Map<string, string>()
    uniqueExercises.forEach((title, idx) => {
      map.set(title, palette[idx % palette.length])
    })
    return map
  }, [submissions])

  if (loading) return <PageLoader label="Đang tải hồ sơ sinh viên..." />

  if (!profile) {
    return (
      <div className="card p-12 text-center text-slate-500">
        Không tìm thấy hồ sơ sinh viên.
      </div>
    )
  }

  const { student, section, summary, progress } = profile
  const completed = progress.filter((item) => item.status === 'completed').length
  const attempted = progress.filter((item) => item.attemptCount > 0 && item.status !== 'completed').length
  const notStarted = Math.max(0, progress.length - completed - attempted)

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-500 p-5 text-white">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/40 bg-white/20 text-2xl font-black">
                  {student.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-black">{student.fullName}</h1>
                  <p className="mt-1 text-sm font-bold text-primary-100">MSV: {student.studentId}</p>
                  <p className="text-sm font-semibold text-primary-100">Lớp: {formatSectionDisplayName(section.name)}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-200 p-4 text-center">
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Điểm</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{summary.totalScore.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Hạng</p>
                <p className="mt-1 text-2xl font-black text-slate-900">#{summary.rank}</p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-4 py-3 text-white">
              <h2 className="text-sm font-black uppercase tracking-wide">Mức độ hoàn thành</h2>
            </div>
            <div className="p-5">
              <CompletionDonut percent={summary.completionPercent} />
              <div className="mt-5 space-y-2 text-sm">
                <Legend color="bg-emerald-500" label={`Hoàn thành: ${completed}`} />
                <Legend color="bg-amber-400" label={`Đã nộp chưa đạt: ${attempted}`} />
                <Legend color="bg-rose-400" label={`Chưa làm: ${notStarted}`} />
              </div>
            </div>
          </div>
        </aside>

        <main className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-5 py-4 text-white flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-sm font-black uppercase tracking-wide">Danh sách bài nộp</h2>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setCurrentPage(1)
                }}
                className="input text-xs py-1 px-3 max-w-xs text-slate-800 border-white/20 bg-white"
                style={{ height: '32px' }}
                placeholder="Tìm bài tập..."
              />
            </div>
            <div className="overflow-x-auto p-5">
              {submissions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Sinh viên chưa có bài nộp.</p>
              ) : filteredSubmissions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Không tìm thấy bài nộp nào khớp với từ khóa.</p>
              ) : (
                <>
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-300 text-xs font-black uppercase text-slate-700">
                        <th className="px-3 py-3 w-16 text-center select-none">STT</th>
                        <th className="px-3 py-3 w-28 select-none">Mã bài nộp</th>
                        <th
                          onClick={() => toggleSort('exerciseTitle')}
                          className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                        >
                          Tên bài tập {sortField === 'exerciseTitle' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                        </th>
                        <th
                          onClick={() => toggleSort('submittedAt')}
                          className="px-3 py-3 w-48 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                        >
                          Thời gian nộp {sortField === 'submittedAt' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                        </th>
                        <th
                          onClick={() => toggleSort('effectiveScore')}
                          className="px-3 py-3 text-center w-24 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                        >
                          Điểm {sortField === 'effectiveScore' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                        </th>
                        <th className="px-3 py-3 text-center w-28">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedSubmissions.map((submission, index) => {
                        const status = getStatusLabel(submission.effectiveScore >= 100 ? 'finished' : 'submitted', submission.effectiveScore)
                        return (
                          <tr key={submission.id} className="hover:bg-slate-50">
                            <td className="px-3 py-3 font-semibold text-slate-500 text-center">
                              {index + 1 + (currentPage - 1) * pageSize}
                            </td>
                            <td className="px-3 py-3 font-bold">
                              <Link
                                to={isStudentView ? `/student/submissions/${submission.id}` : `/instructor/submissions/${submission.id}`}
                                className="text-primary hover:text-primary-800 hover:underline transition-colors"
                              >
                                {submission.id.slice(0, 8)}
                              </Link>
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-700">
                              <Link
                                to={isStudentView ? `/student/exercises/${submission.exerciseId}` : `/instructor/exercises/${submission.exerciseId}?section_id=${id}`}
                                className="hover:text-primary hover:underline transition-colors"
                              >
                                {submission.exerciseTitle}
                              </Link>
                            </td>
                            <td className="px-3 py-3 text-slate-500">{formatTimestamp(submission.submittedAt)}</td>
                            <td className="px-3 py-3 text-center font-bold">{submission.effectiveScore.toFixed(1)}/100</td>
                            <td className="px-3 py-3 text-center">
                              <span className={status.className}>{status.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {sortedSubmissions.length > 0 && (
                    <div className="flex justify-between items-center text-xs text-slate-500 pt-4 border-t border-slate-100 bg-white flex-wrap gap-3">
                      <div>
                        Hiển thị {Math.min(sortedSubmissions.length, (currentPage - 1) * pageSize + 1)} đến{' '}
                        {Math.min(sortedSubmissions.length, currentPage * pageSize)} trong tổng số{' '}
                        {sortedSubmissions.length} bài nộp
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {totalPages > 1 && (
                          <div className="flex gap-1">
                            <button
                              disabled={currentPage === 1}
                              onClick={() => setCurrentPage(currentPage - 1)}
                              className="btn btn-secondary btn-sm select-none"
                            >
                              Trước
                            </button>
                            {[...Array(totalPages)].map((_, i) => (
                              <button
                                key={i}
                                onClick={() => setCurrentPage(i + 1)}
                                className={`btn btn-sm select-none ${
                                  currentPage === i + 1
                                    ? 'btn-primary'
                                    : 'btn-secondary'
                                }`}
                              >
                                {i + 1}
                              </button>
                            ))}
                            <button
                              disabled={currentPage === totalPages}
                              onClick={() => setCurrentPage(currentPage + 1)}
                              className="btn btn-secondary btn-sm select-none"
                            >
                              Sau
                            </button>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                          <span>Số dòng hiển thị:</span>
                          <select
                            value={pageSize === 999999 ? 'all' : pageSize}
                            onChange={(e) => {
                              const val = e.target.value
                              setPageSize(val === 'all' ? 999999 : Number(val))
                              setCurrentPage(1)
                            }}
                            className="h-8 rounded border border-slate-200 bg-white px-2 outline-none cursor-pointer text-slate-700 font-semibold"
                          >
                            <option value="5">5</option>
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                            <option value="all">Tất cả</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <SubmissionScatterChart submissions={submissions} exerciseColorMap={exerciseColorMap} />
          </div>
        </main>
      </div>
    </div>
  )
}

function CompletionDonut({ percent }: { percent: number }) {
  const radius = 58
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, percent) / 100) * circumference
  return (
    <div className="flex items-center justify-center">
      <svg width="170" height="170" viewBox="0 0 170 170" role="img" aria-label={`Hoàn thành ${percent.toFixed(1)}%`}>
        <circle cx="85" cy="85" r={radius} fill="none" stroke="#f43f5e" strokeWidth="22" />
        <circle
          cx="85"
          cy="85"
          r={radius}
          fill="none"
          stroke="#0ea5a4"
          strokeWidth="22"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 85 85)"
        />
        <text x="85" y="80" textAnchor="middle" className="fill-slate-900 text-2xl font-black">
          {percent.toFixed(1)}%
        </text>
        <text x="85" y="104" textAnchor="middle" className="fill-slate-400 text-xs font-bold">
          hoàn thành
        </text>
      </svg>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 font-semibold text-slate-600">
      <span className={`h-3 w-8 rounded ${color}`} />
      <span>{label}</span>
    </div>
  )
}

function formatMonthLabel(val: string) {
  const [year, month] = val.split('-')
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const mIdx = Number(month) - 1
  return `${monthNames[mIdx]} ${year}`
}

function SubmissionScatterChart({
  submissions,
  exerciseColorMap,
}: {
  submissions: SubmissionRow[]
  exerciseColorMap: Map<string, string>
}) {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (submissions.length > 0) {
      const latestDate = new Date(submissions[0].submittedAt)
      return `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, '0')}`
    }
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [hoveredPoint, setHoveredPoint] = useState<{ sub: SubmissionRow; x: number; y: number } | null>(null)

  const filteredByMonth = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    return submissions.filter((sub) => {
      const d = new Date(sub.submittedAt)
      return d.getFullYear() === year && (d.getMonth() + 1) === month
    })
  }, [submissions, selectedMonth])

  const { xMin, xMax, ticks } = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const startOfMonth = new Date(year, month - 1, 1).getTime()
    const endOfMonth = new Date(year, month, 1).getTime() - 1

    if (filteredByMonth.length === 0) {
      const ticksList: Array<{ time: number; label: string }> = []
      for (let i = 0; i < 5; i++) {
        const t = startOfMonth + (endOfMonth - startOfMonth) * (i / 4)
        const d = new Date(t)
        ticksList.push({
          time: t,
          label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        })
      }
      return { xMin: startOfMonth, xMax: endOfMonth, ticks: ticksList }
    }

    const times = filteredByMonth.map((s) => new Date(s.submittedAt).getTime())
    let minTime = Math.min(...times)
    let maxTime = Math.max(...times)

    const minRange = 24 * 60 * 60 * 1000
    if (maxTime - minTime < minRange) {
      const center = (minTime + maxTime) / 2
      minTime = center - minRange / 2
      maxTime = center + minRange / 2
    } else {
      const pad = (maxTime - minTime) * 0.05
      minTime -= pad
      maxTime += pad
    }

    const duration = maxTime - minTime
    const ticksList: Array<{ time: number; label: string }> = []

    if (duration <= 3 * 24 * 60 * 60 * 1000) {
      const sixHours = 6 * 60 * 60 * 1000
      let t = Math.ceil(minTime / sixHours) * sixHours
      while (t <= maxTime) {
        const d = new Date(t)
        let hour = d.getHours()
        const ampm = hour >= 12 ? 'PM' : 'AM'
        hour = hour % 12
        if (hour === 0) hour = 12
        const label = `${String(hour).padStart(2, '0')}:00 ${ampm}`
        ticksList.push({ time: t, label })
        t += sixHours
      }
    } else {
      const numTicks = Math.min(8, Math.max(4, Math.round(duration / (24 * 60 * 60 * 1000))))
      for (let i = 0; i < numTicks; i++) {
        const t = minTime + duration * (i / (numTicks - 1))
        const d = new Date(t)
        const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
        ticksList.push({ time: t, label })
      }
    }

    return { xMin: minTime, xMax: maxTime, ticks: ticksList }
  }, [filteredByMonth, selectedMonth])

  const width = 800
  const height = 350
  const paddingTop = 25
  const paddingBottom = 65
  const paddingLeft = 60
  const paddingRight = 40
  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom

  const yTicks = [0, 20, 40, 60, 80, 100]

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="relative inline-flex items-center">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <button className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer select-none">
            <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{formatMonthLabel(selectedMonth)}</span>
          </button>
        </div>

        <h3 className="text-xl font-bold text-slate-800 tracking-wide select-none md:absolute md:left-1/2 md:-translate-x-1/2">
          Biểu đồ nộp bài
        </h3>

        <div className="text-xs font-bold text-slate-500 select-none">
          {filteredByMonth.length} lượt nộp trong tháng
        </div>
      </div>

      <div className="relative w-full aspect-[800/350] bg-white border border-slate-150 rounded-lg p-2 shadow-inner">
        <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} overflow="visible">
          <line
            x1={paddingLeft}
            y1={paddingTop}
            x2={paddingLeft}
            y2={paddingTop + plotHeight}
            stroke="#94a3b8"
            strokeWidth="1.5"
          />

          <line
            x1={paddingLeft}
            y1={paddingTop + plotHeight}
            x2={width - paddingRight}
            y2={paddingTop + plotHeight}
            stroke="#94a3b8"
            strokeWidth="1.5"
          />

          <text
            x={paddingLeft - 45}
            y={paddingTop + plotHeight / 2}
            transform={`rotate(-90 ${paddingLeft - 45} ${paddingTop + plotHeight / 2})`}
            textAnchor="middle"
            className="fill-slate-700 text-sm font-bold"
          >
            Điểm
          </text>

          {yTicks.map((val) => {
            const y = paddingTop + plotHeight - (val / 100) * plotHeight
            return (
              <g key={val}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray={val === 0 ? "0" : "4 4"}
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-xs font-bold"
                >
                  {val}
                </text>
              </g>
            )
          })}

          {ticks.map((t, idx) => {
            const x = paddingLeft + ((t.time - xMin) / (xMax - xMin)) * plotWidth
            if (x < paddingLeft || x > width - paddingRight) return null
            return (
              <g key={idx}>
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={paddingTop + plotHeight}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <line
                  x1={x}
                  y1={paddingTop + plotHeight}
                  x2={x}
                  y2={paddingTop + plotHeight + 6}
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                />
                <text
                  x={x}
                  y={paddingTop + plotHeight + 20}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px] font-bold"
                >
                  {t.label}
                </text>
              </g>
            )
          })}

          {filteredByMonth.map((sub, idx) => {
            const score = sub.effectiveScore ?? 0
            const time = new Date(sub.submittedAt).getTime()
            const x = paddingLeft + ((time - xMin) / (xMax - xMin)) * plotWidth
            const y = paddingTop + plotHeight - (score / 100) * plotHeight
            const color = exerciseColorMap.get(sub.exerciseTitle) || '#0284c7'

            return (
              <circle
                key={sub.id || idx}
                cx={x}
                cy={y}
                r={6.5}
                fill={color}
                stroke="#ffffff"
                strokeWidth={1.5}
                className="cursor-pointer transition-all duration-150 hover:scale-125 filter drop-shadow-sm origin-center"
                onMouseEnter={() => setHoveredPoint({ sub, x, y })}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            )
          })}
        </svg>

        {hoveredPoint && (
          <div
            className="absolute z-20 pointer-events-none rounded-lg bg-slate-900/95 px-3 py-2 text-xs font-semibold text-white shadow-xl max-w-xs border border-slate-700"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
              transform: 'translate(-50%, -115%)',
            }}
          >
            <p className="font-extrabold text-cyan-300">{hoveredPoint.sub.exerciseTitle}</p>
            <p className="mt-1 text-slate-200">Điểm: <span className="font-black text-white text-sm">{hoveredPoint.sub.effectiveScore}</span></p>
            <p className="text-[10px] text-slate-400 mt-0.5">{formatTimestamp(hoveredPoint.sub.submittedAt)}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mt-4 pt-4 border-t border-slate-100">
        {Array.from(exerciseColorMap.entries()).map(([title, color]) => (
          <div key={title} className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span className="h-3.5 w-3.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }} />
            <span>{title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
