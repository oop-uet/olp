import { useEffect, useMemo, useState, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api, cachedGet } from '../../lib/api'
import { PageLoader, Spinner, CheckCircleIcon, XCircleIcon, SubmissionIcon } from '../../components/ui'
import { StyleAnnotatedCodeViewer } from '../../components/submission/StyleAnnotatedCodeViewer'
import { JUnitFunctionalSummary } from '../../components/submission/JUnitFunctionalSummary'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName } from '../../utils/semester'
import { deduplicateCheckstyleViolations } from '../../utils/checkstyle'
import {
  buildJUnitAssertionResultDisplays,
  isJavaJUnitTestInput,
  type JUnitRequirementKind,
} from '../../utils/junitAssertions'

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
  input_data?: string | null
  expectedOutput?: string | null
  expected_output?: string | null
  isVisible?: number | boolean
  pointValue?: number | null
  point_value?: number | null
}

interface TestCaseResult {
  id: string
  passed: number | boolean
  status: 'passed' | 'failed' | 'timeout' | 'error'
  actualOutput?: string | null
  testCase?: TestCaseInfo | null
  isJUnitAssertion?: boolean
  junitAssertionLabel?: string
  junitFileName?: string
  assertionIndex?: number
  totalAssertions?: number
  lineNumber?: number
  requirementKind?: JUnitRequirementKind
}

interface SubmissionDetail {
  id: string
  exerciseId: string
  sectionId?: string
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
    const parsed = JSON.parse(report) as ParsedStyleReport
    const violations = deduplicateCheckstyleViolations(parsed.violations ?? [])
    return {
      ...parsed,
      violations,
      violationCount: violations.length,
    }
  } catch {
    return null
  }
}

// --- Helpers ---

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

function expandJUnitAssertionResults(results: TestCaseResult[]): TestCaseResult[] {
  return results.flatMap((result) => {
    const inputData = result.testCase?.inputData ?? result.testCase?.input_data ?? ''
    const expectedOutput = result.testCase?.expectedOutput ?? result.testCase?.expected_output ?? ''
    if (!isJavaJUnitTestInput(inputData)) return [result]

    const assertionResults = buildJUnitAssertionResultDisplays({
      id: result.id,
      inputData,
      expectedOutput,
      actualOutput: result.actualOutput ?? '',
      passed: isPassed(result.passed),
      status: result.status,
      pointValue: result.testCase?.pointValue ?? result.testCase?.point_value ?? 0,
    })

    if (assertionResults.length === 0) return [result]

    return assertionResults.map((assertionResult) => ({
      ...result,
      id: assertionResult.id,
      passed: assertionResult.passed,
      status: assertionResult.status,
      actualOutput: assertionResult.actualOutput,
      testCase: {
        ...(result.testCase ?? { id: result.id }),
        inputData,
        expectedOutput,
        pointValue: assertionResult.pointValue,
      },
      isJUnitAssertion: true,
      junitAssertionLabel: assertionResult.label,
      junitFileName: assertionResult.fileName,
      assertionIndex: assertionResult.assertionIndex,
      totalAssertions: assertionResult.totalAssertions,
      lineNumber: assertionResult.lineNumber,
      requirementKind: assertionResult.requirementKind,
    }))
  })
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
  const [sectionsLoaded, setSectionsLoaded] = useState(false)
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
  const [activeTab, setActiveTab] = useState<'source' | 'results' | 'structure' | 'anti-cheat' | 'style'>('source')
  const [focusStyleLine, setFocusStyleLine] = useState<number | null>(null)
  const [pageSize, setPageSize] = useState(10)


  const [sortField, setSortField] = useState<'submittedAt' | 'score' | 'exerciseTitle' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const selectedExerciseId = searchParams.get('exercise_id') || ''

  // Map of exerciseId -> title for display
  const exerciseTitleById = new Map(exercises.map((ex) => [ex.id, ex.title]))


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

  const totalPages = Math.max(1, Math.ceil(sortedSubmissions.length / pageSize))
  const pageItems = useMemo(
    () => sortedSubmissions.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    [currentPage, sortedSubmissions, pageSize]
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

  // Fetch submissions after the section filter is known, so the first load stays scoped.
  useEffect(() => {
    if (!sectionsLoaded) return
    if (sections.length === 0) {
      setSubmissions([])
      setLoadingList(false)
      return
    }
    if (!selectedSectionId) return
    fetchSubmissions()
  }, [sectionsLoaded, sections.length, selectedExerciseId, selectedSectionId])

  // Load specific submission if submission_id is present in URL
  const selectedSubmissionId = searchParams.get('submission_id')
  useEffect(() => {
    if (selectedSubmissionId) {
      fetchSubmissionDetail(selectedSubmissionId)
    }
  }, [selectedSubmissionId])

  useEffect(() => {
    setCurrentPage(0)
  }, [selectedExerciseId, selectedSectionId])

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
      const [exercisesRes, libraryRes] = await Promise.all([
        cachedGet('/api/exercises', undefined, { ttlMs: 60_000 }),
        cachedGet('/api/exercises/library').catch(() => ({ data: [] })),
      ])
      const exerciseData = Array.isArray(exercisesRes.data)
        ? exercisesRes.data
        : exercisesRes.data?.data ?? []
      const libraryData = Array.isArray(libraryRes.data)
        ? libraryRes.data
        : libraryRes.data?.data ?? []

      const exerciseMap = new Map<string, { id: string; title: string }>()
      ;[...libraryData, ...exerciseData].forEach((e) => {
        if (e?.id && e?.title) {
          exerciseMap.set(e.id, { id: e.id, title: e.title })
        }
      })

      const sortedEx = [...exerciseMap.values()].sort((a, b) => {
        const getWeek = (title: string) => {
          const match = title.match(/^[Tt]uần\s+(\d+)/)
          return match ? parseInt(match[1], 10) : Infinity
        }
        const weekA = getWeek(a.title)
        const weekB = getWeek(b.title)
        if (weekA !== weekB) return weekA - weekB
        return a.title.localeCompare(b.title, 'vi')
      })
      setExercises(sortedEx)
    } catch {
      // Non-critical filter error
    }
  }

  async function fetchSections() {
    try {
      const response = await cachedGet('/api/instructor/sections')
      setSections(response.data)
      if (response.data.length > 0) {
        setSelectedSectionId(response.data[0].id)
      }
    } catch {
      // Non-critical sections error
    } finally {
      setSectionsLoaded(true)
    }
  }

  async function fetchLeaderboard(sectionId: string) {
    setLoadingLeaderboard(true)
    try {
      const response = await cachedGet(`/api/sections/${sectionId}/leaderboard`, undefined, { ttlMs: 30_000 })
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
      if (selectedSectionId) {
        params.section_id = selectedSectionId
      }
      const response = await cachedGet('/api/submissions', { params }, { ttlMs: 15_000 })
      setSubmissions(response.data)
    } catch {
      toast.error('Không thể tải danh sách bài nộp. Vui lòng thử lại.')
    } finally {
      setLoadingList(false)
    }
  }

  function applyDetail(detail: SubmissionDetail) {
    setSelectedSubmission(detail)
    if (detail.sectionId) {
      setSelectedSectionId(detail.sectionId)
    }
    
    const files = parseSubmittedFiles(detail.code)
    setActiveSubmittedFile(files[0]?.name ?? 'Main.java')
    setActiveTab('source')
    setFocusStyleLine(null)
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

    const results = expandJUnitAssertionResults(selectedSubmission.results ?? [])
    const functionalResults = results.filter((tc) => tc.requirementKind !== 'structure')
    const structureResults = results.filter((tc) => tc.requirementKind === 'structure')
    const effectiveScore =
      selectedSubmission.effectiveScore ??
      selectedSubmission.score ??
      0
    const exerciseTitle = selectedSubmission.exercise?.title || exerciseTitleById.get(selectedSubmission.exerciseId) || 'Bài thực hành'
    const studentName = selectedSubmission.student?.fullName || selectedSubmission.student?.username || 'Sinh viên'
    const studentUsername = selectedSubmission.student?.username || ''
    const functionalPassedCount = functionalResults.filter((tc) => isPassed(tc.passed)).length
    const structurePassedCount = structureResults.filter((tc) => isPassed(tc.passed)).length
    const hasStructureResults = structureResults.length > 0

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
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              
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
                    #{selectedSubmission.id.slice(0, 8)}:{' '}
                    <Link
                      to={`/instructor/exercises/${selectedSubmission.exerciseId}?section_id=${selectedSectionId}`}
                      className="text-sky-500 hover:text-sky-700 hover:underline"
                    >
                      {exerciseTitle}
                    </Link>
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Sinh viên:{' '}
                    {selectedSubmission.student?.id ? (
                      <Link
                        to={`/instructor/classes/${selectedSectionId}/students/${selectedSubmission.student.id}/profile`}
                        className="text-sky-500 hover:text-sky-700 hover:underline font-bold"
                      >
                        {studentName} ({studentUsername})
                      </Link>
                    ) : (
                      <span className="text-sky-500 font-bold">{studentName} ({studentUsername})</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Lần nộp #{selectedSubmission.attemptNumber} · {formatTimestamp(selectedSubmission.submittedAt)}
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
              {hasStructureResults ? (
                structurePassedCount === structureResults.length ? (
                  <span className="badge-green py-1 px-2.5 rounded-full">Cấu trúc đạt (SE)</span>
                ) : (
                  <span className="badge-red py-1 px-2.5 rounded-full">Lỗi cấu trúc (SE)</span>
                )
              ) : selectedSubmission.score === 0 && results.some(r => r.status === 'error') ? (
                <span className="badge-red py-1 px-2.5 rounded-full">Lỗi cấu trúc (SE)</span>
              ) : (
                <span className="badge-gray py-1 px-2.5 rounded-full">Không xét cấu trúc (SE)</span>
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
                    ['results', `Yêu cầu chức năng (${functionalPassedCount}/${functionalResults.length})`],
                    ...(hasStructureResults
                      ? [['structure', `Yêu cầu cấu trúc (${structurePassedCount}/${structureResults.length})`]]
                      : []),
                    ['anti-cheat', 'Vi phạm Fullscreen'],
                    ['style', 'Quy tắc lập trình'],
                  ].map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab as 'source' | 'results' | 'structure' | 'anti-cheat' | 'style')}
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
                      {tab === 'style' && styleViolations.length > 0 && (
                        <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                          {styleViolationCount}
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
                  focusLine={focusStyleLine}
                />
              </div>
            )}

            {activeTab === 'results' && (
              <div className="flex-1 bg-slate-50 p-4 overflow-y-auto space-y-4">
                {functionalResults.length === 0 ? (
                  <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                    <p className="text-sm font-bold text-slate-400">
                      {hasStructureResults ? 'Không có yêu cầu chức năng' : 'Không có kết quả bộ test'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {functionalResults.map((tc, index) => (
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

            {activeTab === 'structure' && (
              <div className="flex-1 bg-slate-50 p-4 overflow-y-auto space-y-4">
                {structureResults.length === 0 ? (
                  <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                    <p className="text-sm font-bold text-slate-400">Không có yêu cầu cấu trúc</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {structureResults.map((tc, index) => (
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

            {activeTab === 'style' && (
              <div className="flex-1 bg-slate-50 p-5 overflow-y-auto">
                {selectedSubmission.styleScore == null ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-700">Không có kết quả chấm quy tắc</p>
                    <p className="mt-1 text-sm text-slate-500">Bài nộp này chưa được chấm quy tắc hoặc không xét quy tắc.</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-3xl mx-auto">
                    {styleViolations.length > 0 ? (
                      <div className="space-y-3">
                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Danh sách vi phạm ({styleViolations.length})</h4>
                        <div className="space-y-2">
                          {styleViolations.map((violation, index) => (
                            <button
                              key={`${violation.file}-${violation.line}-${index}`}
                              type="button"
                              onClick={() => {
                                const matchingFile = submittedFiles.find(f => f.name.toLowerCase() === violation.file.toLowerCase() || f.name.toLowerCase().endsWith('/' + violation.file.toLowerCase()))
                                if (matchingFile) {
                                  setActiveSubmittedFile(matchingFile.name)
                                }
                                setActiveTab('source')
                                setFocusStyleLine(violation.line ?? null)
                              }}
                              className="block w-full text-left rounded-xl border border-rose-100 bg-rose-50/50 hover:bg-rose-50 p-4 transition-all cursor-pointer shadow-sm group"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-bold text-rose-700 text-xs">
                                    {violation.file}
                                    {violation.line ? ` : Dòng ${violation.line}` : ''}
                                    {violation.column ? `, cột ${violation.column}` : ''}
                                  </p>
                                  <p className="mt-1 text-sm leading-relaxed text-slate-700 font-medium group-hover:text-rose-950 transition-colors">
                                    {violation.message}
                                  </p>
                                </div>
                                <span className="text-[10px] bg-rose-200/50 text-rose-800 font-bold px-2 py-0.5 rounded uppercase flex-shrink-0 group-hover:bg-rose-200 transition-all">
                                  Checkstyle
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-center">
                        <p className="text-sm font-bold text-emerald-600">Không phát hiện lỗi Checkstyle nào!</p>
                      </div>
                    )}
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
            <div className="flex flex-wrap items-center justify-between gap-4">
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

              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span>Số dòng hiển thị:</span>
                <select
                  value={pageSize === Number.MAX_SAFE_INTEGER ? 'all' : pageSize}
                  onChange={(e) => {
                    const val = e.target.value
                    setPageSize(val === 'all' ? Number.MAX_SAFE_INTEGER : Number(val))
                    setCurrentPage(0)
                  }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2.5 outline-none cursor-pointer text-slate-700 font-bold shadow-sm"
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="all">Tất cả</option>
                </select>
              </div>
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
                          {index + 1 + currentPage * pageSize}
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
                          <Link
                            to={selectedSectionId ? `/instructor/exercises/${sub.exerciseId}?section_id=${selectedSectionId}` : `/instructor/exercises/${sub.exerciseId}`}
                            className="font-medium text-sky-500 hover:underline"
                          >
                            {exerciseTitle}
                          </Link>
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
                    <Link
                      to={`/instructor/classes/${selectedSectionId}/students/${item.studentId}/profile`}
                      className="min-w-0 truncate text-base font-medium text-sky-500 hover:underline"
                      title={item.studentName}
                    >
                      {item.studentName}
                    </Link>
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

function getFunctionalMessage(tc: TestCaseResult) {
  const passed = tc.passed === true || tc.passed === 1
  if (passed) {
    return 'Chạy thành công và kết quả chính xác.'
  }
  if (tc.status === 'timeout') {
    return 'Chương trình chạy quá thời gian cho phép.'
  }
  if (tc.status === 'error') {
    return tc.actualOutput || 'Chương trình gặp lỗi khi chạy test.'
  }
  return 'Kết quả đầu ra không khớp với đầu ra mong đợi.'
}

function FunctionalResultCard({
  result,
  index,
}: {
  result: TestCaseResult
  index: number
}) {
  const passed = result.passed === true || result.passed === 1
  const [expanded, setExpanded] = useState(!passed)
  const inputData = result.testCase?.inputData ?? result.testCase?.input_data ?? ''
  const expectedOutput = result.testCase?.expectedOutput ?? result.testCase?.expected_output ?? ''
  const pointValue = result.testCase?.pointValue ?? result.testCase?.point_value ?? 0
  const actualOutput = result.actualOutput ?? ''
  const isJUnitTest = isJavaJUnitTestInput(inputData)
  const statusClass = passed
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700'
  const iconClass = passed ? 'bg-emerald-600' : 'bg-rose-600'
  const statusLabel = passed ? 'Accepted' : result.status === 'timeout' ? 'Timeout' : result.status === 'error' ? 'Error' : 'Wrong Answer'
  const message = getFunctionalMessage(result)

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
      >
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
              {result.isJUnitAssertion
                ? result.junitAssertionLabel
                : `Bộ test #${index + 1}`} ({pointValue} điểm)
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {message}
            </p>
          </div>
        </div>
        <span className={`rounded-md border px-3 py-1 text-xs font-bold uppercase ${statusClass}`}>
          {statusLabel}
        </span>
      </button>

      {expanded && (
        <div className={`border-t px-5 py-4 ${passed ? 'border-emerald-100 bg-emerald-50/60' : 'border-rose-100 bg-rose-50/70'}`}>
          {isJUnitTest ? (
            <JUnitFunctionalSummary
              inputData={inputData}
              expectedOutput={expectedOutput}
              actualOutput={actualOutput}
              passed={passed}
              assertionLabel={result.isJUnitAssertion ? result.junitAssertionLabel : undefined}
              assertionIndex={result.assertionIndex}
              totalAssertions={result.totalAssertions}
              lineNumber={result.lineNumber}
              fileName={result.junitFileName}
              summaryTitle={result.requirementKind === 'structure' ? 'Yêu cầu cấu trúc' : undefined}
            />
          ) : (
            <div className="mx-auto max-w-none space-y-5 font-mono text-sm leading-6">
              <OutputBlock
                title="View"
                wrongLabel="Kết quả thực tế"
                wrongValue={actualOutput || (passed ? expectedOutput : 'Không có output.')}
                correctLabel="Kết quả đúng"
                correctValue={expectedOutput || (passed ? actualOutput : '') || 'Không có.'}
                passed={passed}
              />
              <OutputBlock
                title="Original code"
                wrongLabel="Đầu vào"
                wrongValue={inputData || 'Không có stdin.'}
                correctLabel="Trạng thái"
                correctValue={message}
                passed={passed}
                compact
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function OutputBlock({
  title,
  wrongLabel,
  wrongValue,
  correctLabel,
  correctValue,
  passed,
  compact = false,
}: {
  title: string
  wrongLabel: string
  wrongValue: string
  correctLabel: string
  correctValue: string
  passed: boolean
  compact?: boolean
}) {
  return (
    <div className="space-y-3">
      <p className="text-center font-mono text-base text-slate-700">
        ---------- {title} ----------
      </p>
      <div>
        <p className={`font-semibold ${passed ? 'text-emerald-700' : 'text-rose-700'}`}>
          {wrongLabel}:
        </p>
        <pre className={`mt-1 whitespace-pre-wrap break-words text-sm ${passed ? 'text-emerald-800' : 'text-rose-700'} ${compact ? 'max-h-48 overflow-auto' : ''}`}>
          {wrongValue}
        </pre>
      </div>
      <div>
        <p className="font-semibold text-emerald-700">{correctLabel}:</p>
        <pre className={`mt-1 whitespace-pre-wrap break-words text-sm text-emerald-800 ${compact ? 'max-h-48 overflow-auto' : ''}`}>
          {correctValue}
        </pre>
      </div>
    </div>
  )
}
