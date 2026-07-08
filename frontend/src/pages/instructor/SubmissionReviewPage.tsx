import { useEffect, useMemo, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner, CheckCircleIcon, XCircleIcon, SubmissionIcon } from '../../components/ui'
import { StyleAnnotatedCodeViewer } from '../../components/submission/StyleAnnotatedCodeViewer'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName, formatSemesterDisplayName } from '../../utils/semester'

// --- Types ---
type StyleStatus = 'passed' | 'failed' | 'unavailable' | 'skipped'

interface StudentInfo {
  id: string
  username: string
  email: string
  fullName?: string | null
}

interface SubmissionListItem {
  id: string
  exerciseId: string
  score: number | null
  manualScore: number | null
  submittedAt: string
  student?: StudentInfo | null
  exercise?: { id: string; title: string } | null
}

interface TestCaseInfo {
  id: string
  inputData?: string | null
  expectedOutput?: string | null
  isVisible?: number | boolean
  pointValue?: number | null
}

interface TestCaseResult {
  id: string
  passed: number | boolean
  status: 'passed' | 'failed' | 'timeout' | 'error'
  actualOutput?: string | null
  testCase?: TestCaseInfo | null
}

interface SubmissionDetail {
  id: string
  exerciseId: string
  code: string
  functionalScore: number | null
  score: number | null
  manualScore: number | null
  styleScore: number | null
  styleStatus: StyleStatus | null
  styleFeedback: string | null
  styleReport: string | null
  feedback: string | null
  effectiveScore: number | null
  attemptNumber: number
  submittedAt: string
  student?: StudentInfo | null
  results: TestCaseResult[]
  exercise?: { id: string; title: string } | null
}

interface StyleViolation {
  file: string
  line: number | null
  column: number | null
  severity: string
  message: string
  source?: string
  ruleId?: string
  ruleLabel?: string
  category?: string
}

interface ParsedStyleReport {
  status?: StyleStatus
  score?: number | null
  violationCount?: number
  toolVersion?: string
  violations?: StyleViolation[]
}

interface AntiCheatEvent {
  id: string
  eventType: 'fullscreen_exit' | 'visibility_hidden' | 'window_blur'
  warningCountAtEvent: number
  occurredAt: string
}

interface ExerciseOption {
  id: string
  title: string
}

interface SectionOption {
  id: string
  name: string
  semester: string
}

interface LeaderboardEntry {
  rank: number
  studentName: string
  studentId: string
  totalScore: number
}

interface SubmittedSourceFile {
  name: string
  content: string
}

function parseSubmittedFiles(code: string): SubmittedSourceFile[] {
  try {
    const parsed = JSON.parse(code) as {
      format?: string
      files?: Array<{ name?: string; content?: string }>
    }

    if (parsed.format === 'oop-java-files' && Array.isArray(parsed.files)) {
      const files = parsed.files
        .filter((file) => file.name && typeof file.content === 'string')
        .map((file) => ({ name: file.name as string, content: file.content as string }))

      if (files.length > 0) return files
    }
  } catch {
    // Legacy single-file submissions are stored as raw source code.
  }

  return [{ name: 'Main.java', content: code }]
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function buildAllFilesDownload(files: SubmittedSourceFile[]) {
  return files
    .map((file) => `// ===== ${file.name} =====\n${file.content.trimEnd()}\n`)
    .join('\n')
}

function parseStyleReport(report?: string | null): ParsedStyleReport | null {
  if (!report) return null
  try {
    return JSON.parse(report) as ParsedStyleReport
  } catch {
    return null
  }
}

// --- Helpers ---

const PAGE_SIZE = 10

function formatTimestamp(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatTableTimestamp(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  const day = date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return `${time}, ${day}`
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-primary'
  if (score >= 50) return 'text-amber-600'
  return 'text-rose-600'
}

function formatNumberScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function getSubmissionResult(score: number) {
  if (score >= 100) {
    return { label: 'Accepted', className: 'bg-emerald-500 text-white' }
  }
  if (score > 0) {
    return { label: 'Finished', className: 'bg-emerald-500 text-white' }
  }
  return { label: 'Compile Error', className: 'bg-rose-500 text-white' }
}

function isPassed(value: number | boolean): boolean {
  return value === true || value === 1
}

function getEventTypeLabel(eventType: string): string {
  switch (eventType) {
    case 'fullscreen_exit':
      return 'Thoát toàn màn hình'
    case 'visibility_hidden':
      return 'Chuyển tab'
    case 'window_blur':
      return 'Rời cửa sổ'
    default:
      return eventType
  }
}

export function SubmissionReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // List state
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([])
  const [exercises, setExercises] = useState<ExerciseOption[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [currentPage, setCurrentPage] = useState(0)

  // Sidebar leaderboard & sections state
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false)

  // Custom Dropdown State
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Detail state
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null)
  const [antiCheatLog, setAntiCheatLog] = useState<AntiCheatEvent[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [activeSubmittedFile, setActiveSubmittedFile] = useState('Main.java')
  const [activeTab, setActiveTab] = useState<'source' | 'results' | 'anti-cheat'>('source')


  const [sortField, setSortField] = useState<'submittedAt' | 'score' | 'exerciseTitle' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const selectedExerciseId = searchParams.get('exercise_id') || ''

  // Map of exerciseId -> title for display
  const exerciseTitleById = new Map(exercises.map((ex) => [ex.id, ex.title]))
  const selectedSection = sections.find((sec) => sec.id === selectedSectionId)

  const sortedSubmissions = useMemo(() => {
    if (!sortField) return submissions
    return [...submissions].sort((a, b) => {
      let valA: any = ''
      let valB: any = ''
      if (sortField === 'exerciseTitle') {
        valA = exerciseTitleById.get(a.exerciseId) || ''
        valB = exerciseTitleById.get(b.exerciseId) || ''
      } else if (sortField === 'score') {
        valA = a.score ?? 0
        valB = b.score ?? 0
      } else if (sortField === 'submittedAt') {
        valA = a.submittedAt || ''
        valB = b.submittedAt || ''
      }

      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [submissions, sortField, sortOrder, exerciseTitleById])

  const totalPages = Math.max(1, Math.ceil(sortedSubmissions.length / PAGE_SIZE))
  const pageItems = useMemo(
    () => sortedSubmissions.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE),
    [currentPage, sortedSubmissions]
  )

  const toggleSort = (field: 'submittedAt' | 'score' | 'exerciseTitle') => {
    setCurrentPage(0)
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // Fetch initial data
  useEffect(() => {
    fetchExercises()
    fetchSections()
  }, [])

  // Fetch submissions when exercise filter changes
  useEffect(() => {
    fetchSubmissions()
  }, [selectedExerciseId])

  // Load specific submission if submission_id is present in URL
  const selectedSubmissionId = searchParams.get('submission_id')
  useEffect(() => {
    if (selectedSubmissionId) {
      fetchSubmissionDetail(selectedSubmissionId)
    }
  }, [selectedSubmissionId])

  useEffect(() => {
    setCurrentPage(0)
  }, [selectedExerciseId])

  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(totalPages - 1)
    }
  }, [currentPage, totalPages])

  // Fetch leaderboard when section filter changes
  useEffect(() => {
    if (selectedSectionId) {
      fetchLeaderboard(selectedSectionId)
    } else {
      setLeaderboard([])
    }
  }, [selectedSectionId])

  async function fetchExercises() {
    try {
      const response = await api.get('/api/exercises')
      setExercises(
        response.data.map((e: { id: string; title: string }) => ({ id: e.id, title: e.title }))
      )
    } catch {
      // Non-critical filter error
    }
  }

  async function fetchSections() {
    try {
      const response = await api.get('/api/instructor/sections')
      setSections(response.data)
      if (response.data.length > 0) {
        setSelectedSectionId(response.data[0].id)
      }
    } catch {
      // Non-critical sections error
    }
  }

  async function fetchLeaderboard(sectionId: string) {
    setLoadingLeaderboard(true)
    try {
      const response = await api.get(`/api/sections/${sectionId}/leaderboard`)
      const list: LeaderboardEntry[] = response.data.leaderboard ?? response.data ?? []
      setLeaderboard(list.slice(0, 10)) // top 10
    } catch {
      // Ignore mini leaderboard fetch errors
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  async function fetchSubmissions() {
    setLoadingList(true)
    setCurrentPage(0)
    try {
      const params: Record<string, string> = {}
      if (selectedExerciseId) {
        params.exercise_id = selectedExerciseId
      }
      const response = await api.get('/api/submissions', { params })
      setSubmissions(response.data)
    } catch {
      toast.error('Không thể tải danh sách bài nộp. Vui lòng thử lại.')
    } finally {
      setLoadingList(false)
    }
  }

  function applyDetail(detail: SubmissionDetail) {
    setSelectedSubmission(detail)
    
    const files = parseSubmittedFiles(detail.code)
    setActiveSubmittedFile(files[0]?.name ?? 'Main.java')
    setActiveTab('source')
  }

  async function fetchSubmissionDetail(submissionId: string) {
    setLoadingDetail(true)
    setDetailError(null)
    setAntiCheatLog([])
    try {
      const [detailRes, logRes] = await Promise.all([
        api.get(`/api/submissions/${submissionId}`),
        api.get(`/api/submissions/${submissionId}/anticheat-log`).catch(() => ({ data: [] })),
      ])
      applyDetail(detailRes.data)
      setAntiCheatLog(logRes.data)
    } catch {
      setDetailError('Không thể tải chi tiết bài nộp.')
      toast.error('Không thể tải chi tiết bài nộp.')
    } finally {
      setLoadingDetail(false)
    }
  }

  function handleExerciseFilter(exerciseId: string) {
    if (exerciseId) {
      setSearchParams({ exercise_id: exerciseId })
    } else {
      setSearchParams({})
    }
    setSelectedSubmission(null)
  }

  function handleBackToList() {
    setSelectedSubmission(null)
    setDetailError(null)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('submission_id')
    setSearchParams(nextParams)
  }

  function handleSelectSubmission(submissionId: string) {
    fetchSubmissionDetail(submissionId)
  }

  function goToPage(page: number) {
    setCurrentPage(Math.min(Math.max(page, 0), totalPages - 1))
  }

  // --- Detail View ---
  if (selectedSubmission || loadingDetail) {
    if (loadingDetail) {
      return <PageLoader label="Đang tải chi tiết bài nộp..." />
    }

    if (detailError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 animate-fade-in">
          <p className="text-rose-600 font-semibold">{detailError}</p>
          <button onClick={handleBackToList} className="btn-primary">
            Quay lại danh sách
          </button>
        </div>
      )
    }

    if (!selectedSubmission) return null

    const results = selectedSubmission.results ?? []
    const effectiveScore =
      selectedSubmission.effectiveScore ??
      selectedSubmission.score ??
      0
    const exerciseTitle = selectedSubmission.exercise?.title || exerciseTitleById.get(selectedSubmission.exerciseId) || 'Bài thực hành'
    const studentName = selectedSubmission.student?.fullName || selectedSubmission.student?.username || 'Sinh viên'
    const studentUsername = selectedSubmission.student?.username || ''
    const passedCount = results.filter((tc) => isPassed(tc.passed)).length

    const submittedFiles = parseSubmittedFiles(selectedSubmission.code)
    const currentSubmittedFile =
      submittedFiles.find((file) => file.name === activeSubmittedFile) ?? submittedFiles[0]
    const parsedStyleReport = parseStyleReport(selectedSubmission.styleReport)
    const styleViolations = parsedStyleReport?.violations ?? []
    const styleViolationCount = parsedStyleReport?.violationCount ?? styleViolations.length
    const functionalScore = selectedSubmission.functionalScore ?? selectedSubmission.score ?? 0

    return (
      <div className="-m-6 min-h-[calc(100vh-8.25rem)] bg-slate-100 animate-fade-in pb-8">
        
        {/* Full-width white header banner */}
        <div className="border-b border-slate-200 bg-white px-5 py-4 shadow-sm mb-6">
          <div className="mx-auto flex max-w-none flex-wrap items-center justify-between gap-3 px-2 lg:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={handleBackToList}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary text-lg font-bold"
                aria-label="Quay lại danh sách bài nộp"
              >
                ←
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-slate-900">
                  {exerciseTitle}
                </h1>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  Sinh viên: <span className="text-slate-800 font-bold">{studentName} ({studentUsername})</span>
                </p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wide">
                  Lần nộp #{selectedSubmission.attemptNumber} · {formatTimestamp(selectedSubmission.submittedAt)}
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-right bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 flex items-center gap-3">
                <div className="text-right">
                  <span className={`text-2xl font-black tracking-tight ${getScoreColor(effectiveScore)}`}>
                    {effectiveScore.toFixed(1)}%
                  </span>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                    Test: {functionalScore.toFixed(1)} · Style: {selectedSubmission.styleScore == null ? 'N/A' : selectedSubmission.styleScore.toFixed(1)}
                  </p>
                </div>
              </div>
              
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    submittedFiles.length === 1 ? submittedFiles[0].name : `submission-${selectedSubmission.id}.txt`,
                    submittedFiles.length === 1 ? submittedFiles[0].content : buildAllFilesDownload(submittedFiles)
                  )
                }
                className="btn-primary h-10 px-4 text-sm"
              >
                Tải mã nguồn
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Grid aligned to max-w-7xl */}
        <div className="mx-auto grid max-w-none grid-cols-1 gap-4 p-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          
          {/* Left Panel Column (340px) */}
          <aside className="space-y-4">

            {/* Submission summary */}
            <div className="card bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="panel-header py-2.5 px-4">
                <h3 className="panel-title">Chi tiết bài nộp</h3>
              </div>
              <div className="space-y-3 p-4 text-sm text-slate-700">
                <div className="border-b border-slate-100 pb-3">
                  <p className="text-lg font-black text-slate-900">
                    #{selectedSubmission.id.slice(0, 8)}: <span className="text-sky-500">{exerciseTitle}</span>
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Sinh viên: <span className="text-sky-500">{studentName}</span>
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-slate-500">Trạng thái</span>
                  <span className={getSubmissionResult(effectiveScore).className + ' inline-flex rounded px-2 py-1 text-xs font-bold'}>
                    {getSubmissionResult(effectiveScore).label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-slate-500">Điểm chức năng</span>
                  <span className="font-black text-slate-900">{functionalScore.toFixed(1)}/100</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-slate-500">Điểm quy tắc</span>
                  <div className="flex items-center gap-1.5 font-black">
                    <span className="text-slate-900">
                      {selectedSubmission.styleScore == null ? 'Chưa chấm' : `${selectedSubmission.styleScore.toFixed(1)}/100`}
                    </span>
                    {selectedSubmission.styleStatus && (
                      <span className={
                        selectedSubmission.styleStatus === 'failed'
                          ? 'badge-red text-[9px] px-1.5 py-0.5'
                          : selectedSubmission.styleStatus === 'passed'
                            ? 'badge-green text-[9px] px-1.5 py-0.5'
                            : 'badge-gray text-[9px] px-1.5 py-0.5'
                      }>
                        {selectedSubmission.styleStatus.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className={`text-3xl font-black ${getScoreColor(effectiveScore)}`}>
                    {effectiveScore.toFixed(1)}%
                  </p>
                  <p className="text-xs font-bold text-slate-500">Điểm tổng</p>
                </div>
                {selectedSubmission.feedback && (
                  <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                    {selectedSubmission.feedback}
                  </p>
                )}

                {/* Checkstyle details */}
                {(selectedSubmission.styleFeedback || styleViolations.length > 0) && (
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chi tiết Quy tắc Lập trình</p>
                    {selectedSubmission.styleFeedback && (
                      <p className="rounded-md border border-slate-200 bg-slate-50 p-2.5 leading-5 text-xs text-slate-600">
                        {selectedSubmission.styleFeedback}
                      </p>
                    )}
                    {styleViolations.length > 0 && (
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {styleViolations.slice(0, 6).map((violation, index) => (
                          <div key={`${violation.file}-${violation.line}-${index}`} className="rounded-md border border-rose-100 bg-rose-50 p-2 text-xs">
                            <p className="font-bold text-rose-700">
                              {violation.file}
                              {violation.line ? `:${violation.line}` : ''}
                              {violation.column ? `:${violation.column}` : ''}
                            </p>
                            <p className="mt-1 leading-5 text-rose-700">{violation.message}</p>
                          </div>
                        ))}
                        {styleViolationCount > 6 && (
                          <p className="font-semibold text-slate-500 text-xs">
                            Còn {styleViolationCount - 6} lỗi Checkstyle khác.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Submitted Source Files list */}
            <div className="card bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="panel-header py-2.5 px-4">
                <h3 className="panel-title">Bài đã nộp</h3>
              </div>
              <div className="divide-y divide-slate-100 p-3">
                {submittedFiles.map((file) => (
                  <button
                    key={file.name}
                    type="button"
                    onClick={() => setActiveSubmittedFile(file.name)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                      currentSubmittedFile.name === file.name
                        ? 'bg-primary-50 text-primary-800 ring-1 ring-primary-200'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-primary'
                    }`}
                  >
                    <span className="truncate">{file.name}</span>
                    <span className="text-[10px] text-slate-400">{file.content.split('\n').length} dòng</span>
                  </button>
                ))}
              </div>
            </div>
           </aside>

          {/* Right Main Column (Code Editor & Test Case Viewer Tabs) */}
          <main className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col h-[680px]">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-5 py-3 text-white">
              <h3 className="text-sm font-bold uppercase tracking-wide">Kết Quả Đánh Giá</h3>
            </div>
            
            {/* Checkboxes Row */}
            <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5 flex flex-wrap items-center gap-3 text-xs select-none">
              <span className="font-bold text-slate-500 mr-1">Trạng thái đánh giá:</span>
              {selectedSubmission.score === 0 && results.some(r => r.status === 'error') ? (
                <span className="badge-red py-1 px-2.5 rounded-full">Lỗi cấu trúc (SE)</span>
              ) : (
                <span className="badge-green py-1 px-2.5 rounded-full">Cấu trúc đạt (SE)</span>
              )}
              {selectedSubmission.styleStatus === 'failed' ? (
                <span className="badge-red py-1 px-2.5 rounded-full">Lỗi quy tắc (PE)</span>
              ) : selectedSubmission.styleStatus === 'passed' ? (
                <span className="badge-green py-1 px-2.5 rounded-full">Quy tắc đạt (PE)</span>
              ) : (
                <span className="badge-gray py-1 px-2.5 rounded-full">Không xét quy tắc (PE)</span>
              )}
              {results.length > 0 && results.every(r => r.status === 'error') ? (
                <span className="badge-red py-1 px-2.5 rounded-full">Lỗi biên dịch (CE)</span>
              ) : (
                <span className="badge-green py-1 px-2.5 rounded-full">Biên dịch đạt (CE)</span>
              )}
            </div>

            <div className="border-b border-slate-200 bg-white px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-6">
                  {[
                    ['source', 'Mã nguồn'],
                    ['results', `Yêu cầu chức năng (${passedCount}/${results.length})`],
                    ['anti-cheat', 'Vi phạm Fullscreen'],
                  ].map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab as 'source' | 'results' | 'anti-cheat')}
                      className={`border-b-2 py-3 text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        activeTab === tab
                          ? 'border-primary text-primary'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span>{label}</span>
                      {tab === 'anti-cheat' && antiCheatLog.length > 0 && (
                        <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                          {antiCheatLog.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400 py-3">
                  {currentSubmittedFile.name}
                </span>
              </div>
            </div>

            {activeTab === 'source' && (
              <div className="flex-1">
                <StyleAnnotatedCodeViewer
                  fileName={currentSubmittedFile.name}
                  code={currentSubmittedFile.content}
                  violations={styleViolations}
                  fontSize={13}
                />
              </div>
            )}

            {activeTab === 'results' && (
              <div className="flex-1 bg-slate-50 p-4 overflow-y-auto space-y-4">
                {results.length === 0 ? (
                  <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                    <p className="text-sm font-bold text-slate-400">Không có kết quả bộ test</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {results.map((tc, index) => (
                      <FunctionalResultCard
                        key={tc.id}
                        result={tc}
                        index={index}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'anti-cheat' && (
              <div className="flex-1 bg-slate-50 p-5 overflow-y-auto">
                {antiCheatLog.length === 0 ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
                    <span className="text-3xl mb-2">🛡️</span>
                    <p className="text-sm font-bold text-slate-600">Không ghi nhận sự kiện vi phạm nào</p>
                    <p className="text-xs text-slate-400 mt-1">Sinh viên đã hoàn thành bài nộp trong môi trường fullscreen đầy đủ.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-left">
                          <th className="table-th w-16 text-center select-none whitespace-nowrap">STT</th>
                          <th className="table-th select-none whitespace-nowrap">Hành vi vi phạm</th>
                          <th className="table-th w-28 text-center select-none whitespace-nowrap">Số lần</th>
                          <th className="table-th w-52 text-right select-none whitespace-nowrap">Thời điểm ghi nhận</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {antiCheatLog.map((event, idx) => {
                          const dateObj = new Date(event.occurredAt)
                          const timeStr = dateObj.toLocaleTimeString('vi-VN')
                          const dateStr = dateObj.toLocaleDateString('vi-VN')
                          return (
                            <tr key={event.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="table-td text-center text-slate-400 font-bold whitespace-nowrap">{idx + 1}</td>
                              <td className="table-td text-rose-600 font-bold whitespace-nowrap">{getEventTypeLabel(event.eventType)}</td>
                              <td className="table-td text-center font-bold text-slate-700 whitespace-nowrap">{event.warningCountAtEvent}</td>
                              <td className="table-td text-right text-slate-500 font-semibold whitespace-nowrap">{timeStr} {dateStr}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </main>

        </div>

      </div>
    )
  }

  // --- List View ---
  return (
    <div className="space-y-6 animate-fade-in">
      
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.10)]">
          <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-cyan-500 to-teal-500 px-6 py-4 text-white">
            <h1 className="flex items-center gap-3 text-lg font-bold">
              <span className="text-xl leading-none">≡</span>
              Danh Sách Các Bài Nộp
            </h1>
            <div className="hidden items-center gap-2 text-sm font-semibold md:flex">
              <span>Lọc bài tập</span>
              <select
                id="exercise-filter"
                value={selectedExerciseId}
                onChange={(e) => handleExerciseFilter(e.target.value)}
                className="h-9 min-w-56 rounded-md border border-white/40 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none"
              >
                <option value="">Tất cả bài tập</option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-b border-slate-200 px-6 py-6">
            <div className="flex flex-wrap items-center gap-0">
              <button
                type="button"
                onClick={() => goToPage(0)}
                disabled={currentPage === 0}
                className={`h-11 min-w-12 border border-slate-300 px-4 text-sm font-bold transition ${
                  currentPage === 0 ? 'bg-sky-500 text-white' : 'bg-white text-sky-500 hover:bg-sky-50'
                }`}
              >
                0
              </button>
              {Array.from({ length: Math.min(totalPages - 1, 4) }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => goToPage(page)}
                  className={`h-11 min-w-12 border border-l-0 border-slate-300 px-4 text-sm font-bold transition ${
                    currentPage === page ? 'bg-sky-500 text-white' : 'bg-white text-sky-500 hover:bg-sky-50'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages - 1}
                className="h-11 border border-l-0 border-slate-300 bg-white px-5 text-sm font-bold text-sky-500 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Next ›
              </button>
              <button
                type="button"
                onClick={() => goToPage(totalPages - 1)}
                disabled={currentPage >= totalPages - 1}
                className="h-11 border border-l-0 border-slate-300 bg-white px-5 text-sm font-bold text-sky-500 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                Last ››
              </button>
            </div>

            <div className="mt-4 block md:hidden">
              <label htmlFor="exercise-filter-mobile" className="mb-2 block text-xs font-bold uppercase text-slate-500">
                Lọc bài tập
              </label>
              <select
                id="exercise-filter-mobile"
                value={selectedExerciseId}
                onChange={(e) => handleExerciseFilter(e.target.value)}
                className="input"
              >
                <option value="">Tất cả bài tập</option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-24 text-sm font-semibold text-slate-500">
              <Spinner /> Đang nạp danh sách bài nộp...
            </div>
          ) : submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <SubmissionIcon className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">Không tìm thấy bài nộp nào phù hợp.</p>
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
                      className="border-b-2 border-slate-300 px-4 py-5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                    >
                      Bài tập {sortField === 'exerciseTitle' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th
                      onClick={() => toggleSort('submittedAt')}
                      className="border-b-2 border-slate-300 px-4 py-5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                    >
                      Thời gian {sortField === 'submittedAt' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th
                      onClick={() => toggleSort('score')}
                      className="border-b-2 border-slate-300 px-4 py-5 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                    >
                      Điểm {sortField === 'score' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th className="border-b-2 border-slate-300 px-4 py-5 w-36">Kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((sub: SubmissionListItem, index: number) => {
                    const effective = sub.score ?? 0
                    const result = getSubmissionResult(effective)
                    const studentName = sub.student?.fullName || sub.student?.username || 'Sinh viên'
                    const exerciseTitle = sub.exercise?.title || exerciseTitleById.get(sub.exerciseId) || 'Bài thực hành'
                    return (
                      <tr key={sub.id} className="text-base text-slate-700 hover:bg-slate-50">
                        <td className="border-b border-slate-200 px-4 py-4 text-center text-slate-400 font-bold">
                          {index + 1 + currentPage * PAGE_SIZE}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-4">
                          <button
                            type="button"
                            onClick={() => handleSelectSubmission(sub.id)}
                            className="font-semibold text-sky-500 hover:underline"
                          >
                            {sub.id.slice(0, 8)}
                          </button>
                        </td>
                        <td className="border-b border-slate-200 px-4 py-4">
                          <button
                            type="button"
                            onClick={() => handleSelectSubmission(sub.id)}
                            className="font-bold text-sky-500 hover:underline"
                          >
                            {studentName}
                          </button>
                        </td>
                        <td className="border-b border-slate-200 px-4 py-4">
                          <button
                            type="button"
                            onClick={() => handleSelectSubmission(sub.id)}
                            className="font-medium text-sky-500 hover:underline"
                          >
                            {exerciseTitle}
                          </button>
                        </td>
                        <td className="whitespace-nowrap border-b border-slate-200 px-4 py-4 text-slate-600">
                          {formatTableTimestamp(sub.submittedAt)}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-4 text-center font-semibold text-slate-700">
                          {formatNumberScore(effective)}
                        </td>
                        <td className="border-b border-slate-200 px-4 py-4">
                          <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${result.className}`}>
                            {result.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="card rounded-2xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.12)] xl:sticky xl:top-6">
          <div className="bg-gradient-to-r from-cyan-500 to-teal-500 px-6 py-4 text-white">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="text-xl leading-none">≡</span>
              Bảng Xếp Hạng
            </h2>
          </div>

          <div className="px-6 py-5">
            {/* Section selection dropdown */}
            <div className="relative mb-5" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex w-full items-center justify-between rounded bg-[#0284c7] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0270a8] transition-all cursor-pointer select-none"
              >
                <span>{sections.find((s) => s.id === selectedSectionId)?.name ? formatSectionDisplayName(sections.find((s) => s.id === selectedSectionId)!.name) : 'Chọn lớp'}</span>
                <svg className={`h-4 w-4 transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSectionId('')
                      setDropdownOpen(false)
                    }}
                    className={`flex w-full items-center px-4 py-2.5 text-left text-xs font-semibold border-b border-slate-50 last:border-b-0 transition-colors cursor-pointer ${
                      selectedSectionId === ''
                        ? 'bg-sky-50 text-sky-600 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Chọn lớp
                  </button>
                  {sections.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        setSelectedSectionId(sec.id)
                        setDropdownOpen(false)
                      }}
                      className={`flex w-full items-center px-4 py-2.5 text-left text-xs font-semibold border-b border-slate-50 last:border-b-0 transition-colors cursor-pointer ${
                        selectedSectionId === sec.id
                          ? 'bg-sky-50 text-sky-600 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {formatSectionDisplayName(sec.name)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedSection && (
              <p className="mb-4 border-b border-slate-200 pb-4 text-sm font-semibold text-slate-500">
                {formatSemesterDisplayName(selectedSection.semester, true)}
              </p>
            )}

            {!selectedSectionId ? (
              <p className="py-8 text-center text-sm text-slate-400">Chọn một lớp học để xem xếp hạng.</p>
            ) : loadingLeaderboard ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                <Spinner /> Nạp bảng xếp hạng...
              </div>
            ) : leaderboard.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Chưa có xếp hạng cho lớp này.</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {leaderboard.map((item, index) => (
                  <li key={item.studentId} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 py-4">
                    <span className="text-base font-bold text-slate-800">
                      {index + 1 === 1 ? (
                        <span className="text-lg filter drop-shadow-sm select-none" title="Huy chương Vàng">🥇</span>
                      ) : index + 1 === 2 ? (
                        <span className="text-lg filter drop-shadow-sm select-none" title="Huy chương Bạc">🥈</span>
                      ) : index + 1 === 3 ? (
                        <span className="text-lg filter drop-shadow-sm select-none" title="Huy chương Đồng">🥉</span>
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="min-w-0 truncate text-base font-medium text-sky-500" title={item.studentName}>
                      {item.studentName}
                    </span>
                    <span className="text-base font-bold text-sky-500">{formatNumberScore(item.totalScore)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

    </div>
  )
}

function FunctionalResultCard({
  result,
  index,
}: {
  result: TestCaseResult
  index: number
}) {
  const passed = result.passed === true || result.passed === 1
  const pointValue = result.testCase?.pointValue ?? 0
  const statusClass = passed
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700'
  const iconClass = passed ? 'bg-emerald-600' : 'bg-rose-600'
  const statusLabel = passed ? 'Accepted' : result.status === 'timeout' ? 'Timeout' : result.status === 'error' ? 'Error' : 'Wrong Answer'

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${iconClass}`}
          >
            {passed ? (
              <CheckCircleIcon className="h-6 w-6 text-white" />
            ) : (
              <XCircleIcon className="h-6 w-6 text-white" />
            )}
          </span>
          <div className="min-w-0">
            <h3 className={`truncate text-base font-bold ${passed ? 'text-emerald-700' : 'text-rose-700'}`}>
              Bộ test #{index + 1} ({pointValue} điểm)
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {result.status === 'timeout'
                ? 'Chương trình chạy quá thời gian cho phép.'
                : result.status === 'error'
                ? result.actualOutput || 'Chương trình gặp lỗi khi chạy test.'
                : passed
                ? 'Chạy thành công và kết quả chính xác.'
                : 'Kết quả đầu ra không khớp với đầu ra mong đợi.'}
            </p>
          </div>
        </div>
        <span className={`rounded-md border px-3 py-1 text-xs font-bold uppercase ${statusClass}`}>
          {statusLabel}
        </span>
      </div>
    </section>
  )
}
