import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { api } from '../../lib/api'
import { PageLoader, Spinner, CheckCircleIcon, XCircleIcon, SubmissionIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import Editor from '@monaco-editor/react'

// --- Types ---

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
  score: number | null
  manualScore: number | null
  feedback: string | null
  effectiveScore: number | null
  attemptNumber: number
  submittedAt: string
  student?: StudentInfo | null
  results: TestCaseResult[]
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

  // Detail state
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null)
  const [antiCheatLog, setAntiCheatLog] = useState<AntiCheatEvent[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [activeSubmittedFile, setActiveSubmittedFile] = useState('Main.java')
  const [activeTab, setActiveTab] = useState<'source' | 'results'>('source')

  // Grading state
  const [gradeScore, setGradeScore] = useState('')
  const [gradeFeedback, setGradeFeedback] = useState('')
  const [savingGrade, setSavingGrade] = useState(false)


  const selectedExerciseId = searchParams.get('exercise_id') || ''

  // Map of exerciseId -> title for display
  const exerciseTitleById = new Map(exercises.map((ex) => [ex.id, ex.title]))
  const selectedSection = sections.find((sec) => sec.id === selectedSectionId)
  const totalPages = Math.max(1, Math.ceil(submissions.length / PAGE_SIZE))
  const pageItems = useMemo(
    () => submissions.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE),
    [currentPage, submissions]
  )

  // Fetch initial data
  useEffect(() => {
    fetchExercises()
    fetchSections()
  }, [])

  // Fetch submissions when exercise filter changes
  useEffect(() => {
    fetchSubmissions()
  }, [selectedExerciseId])

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
    const prefill = detail.manualScore ?? detail.score
    setGradeScore(prefill != null ? String(prefill) : '')
    setGradeFeedback(detail.feedback ?? '')
    
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

  async function handleSaveGrade() {
    if (!selectedSubmission) return

    const trimmed = gradeScore.trim()
    let scoreValue: number | undefined
    if (trimmed !== '') {
      scoreValue = Number(trimmed)
      if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
        toast.error('Điểm phải là số từ 0 đến 100.')
        return
      }
    }

    setSavingGrade(true)
    try {
      const payload: { score?: number; feedback?: string } = {}
      if (scoreValue !== undefined) payload.score = scoreValue
      payload.feedback = gradeFeedback

      const response = await api.patch(`/api/submissions/${selectedSubmission.id}/grade`, payload)
      applyDetail(response.data)
      toast.success('Đã lưu điểm và nhận xét.')
    } catch (error) {
      const message =
        (error as AxiosError<{ error?: { message?: string } }>)?.response?.data?.error?.message ||
        'Không thể lưu điểm. Vui lòng thử lại.'
      toast.error(message)
    } finally {
      setSavingGrade(false)
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
    const totalPoints = results.reduce((sum, tc) => sum + (tc.testCase?.pointValue ?? 0), 0)
    const earnedPoints = results
      .filter((tc) => isPassed(tc.passed))
      .reduce((sum, tc) => sum + (tc.testCase?.pointValue ?? 0), 0)

    const effectiveScore =
      selectedSubmission.effectiveScore ??
      selectedSubmission.manualScore ??
      selectedSubmission.score ??
      0
    const isManuallyGraded = selectedSubmission.manualScore != null
    const exerciseTitle = exerciseTitleById.get(selectedSubmission.exerciseId) || 'Bài thực hành'
    const studentName = selectedSubmission.student?.fullName || selectedSubmission.student?.username || 'Sinh viên'
    const studentUsername = selectedSubmission.student?.username || ''
    const studentEmail = selectedSubmission.student?.email || ''
    const passedCount = results.filter((tc) => isPassed(tc.passed)).length

    const submittedFiles = parseSubmittedFiles(selectedSubmission.code)
    const currentSubmittedFile =
      submittedFiles.find((file) => file.name === activeSubmittedFile) ?? submittedFiles[0]

    return (
      <div className="-m-6 min-h-[calc(100vh-8.25rem)] bg-slate-100 animate-fade-in pb-8">
        
        {/* Full-width white header banner */}
        <div className="border-b border-slate-200 bg-white px-5 py-4 shadow-sm mb-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
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
                  {studentEmail ? ` · ${studentEmail}` : ''}
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
                    {earnedPoints}/{totalPoints} test cases đạt
                  </p>
                </div>
                {isManuallyGraded && (
                  <span className="badge-blue text-[9px] font-bold">Chấm tay</span>
                )}
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
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          
          {/* Left Panel Column (340px) */}
          <aside className="space-y-4">
            
            {/* Manual Grading */}
            <div className="card bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="panel-header py-2.5 px-4">
                <h3 className="panel-title">Chấm điểm thủ công</h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label htmlFor="grade-score" className="label text-slate-500">
                    Nhập điểm thay thế (0-100)
                  </label>
                  <input
                    id="grade-score"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={gradeScore}
                    onChange={(e) => setGradeScore(e.target.value)}
                    className="input py-2 px-3 text-xs"
                    placeholder="Điểm số..."
                  />
                </div>
                <div>
                  <label htmlFor="grade-feedback" className="label text-slate-500">
                    Nhận xét / Feedback
                  </label>
                  <textarea
                    id="grade-feedback"
                    rows={4}
                    value={gradeFeedback}
                    onChange={(e) => setGradeFeedback(e.target.value)}
                    className="input py-2 px-3 text-xs"
                    placeholder="Nhận xét của giảng viên..."
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleSaveGrade}
                    disabled={savingGrade}
                    className="btn-primary px-3 py-1.5 text-xs font-bold w-full"
                  >
                    {savingGrade ? <Spinner /> : 'Cập nhật điểm'}
                  </button>
                </div>
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

            {/* Anti-cheat logs */}
            <div className="card bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="panel-header py-2.5 px-4">
                <h3 className="panel-title">Vi phạm Fullscreen</h3>
              </div>
              <div className="p-4">
                {antiCheatLog.length === 0 ? (
                  <p className="text-center py-4 text-xs text-slate-400 italic">Không ghi nhận sự kiện vi phạm nào.</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto border border-slate-100 rounded-lg text-xs">
                    <table className="min-w-full divide-y divide-slate-100 text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold">
                        <tr>
                          <th className="px-3 py-1.5">Hành vi</th>
                          <th className="px-3 py-1.5 text-center w-12">Lần</th>
                          <th className="px-3 py-1.5 text-right w-24">Thời điểm</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
                        {antiCheatLog.map((event) => (
                          <tr key={event.id}>
                            <td className="px-3 py-1.5 text-rose-600 font-bold">{getEventTypeLabel(event.eventType)}</td>
                            <td className="px-3 py-1.5 text-center font-bold">{event.warningCountAtEvent}</td>
                            <td className="px-3 py-1.5 text-right text-slate-400">{new Date(event.occurredAt).toLocaleTimeString('vi-VN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </aside>

          {/* Right Main Column (Code Editor & Test Case Viewer Tabs) */}
          <main className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col h-[680px]">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-5 py-3 text-white">
              <h3 className="text-sm font-bold uppercase tracking-wide">Kết Quả Đánh Giá</h3>
            </div>
            
            {/* Checkboxes Row */}
            <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-500">
              <label className="flex items-center gap-1.5 cursor-not-allowed">
                <input type="checkbox" checked={selectedSubmission.score === 0 && results.some(r => r.status === 'error')} disabled className="rounded text-primary focus:ring-primary h-3.5 w-3.5" />
                <span>Lỗi cấu trúc mã nguồn (SE)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-not-allowed">
                <input type="checkbox" checked={false} disabled className="rounded text-primary focus:ring-primary h-3.5 w-3.5" />
                <span>Lỗi quy tắc lập trình (PE)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-not-allowed">
                <input type="checkbox" checked={results.length > 0 && results.every(r => r.status === 'error')} disabled className="rounded text-primary focus:ring-primary h-3.5 w-3.5" />
                <span>Lỗi biên dịch (CE)</span>
              </label>
            </div>

            <div className="border-b border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {[
                    ['source', 'Mã nguồn'],
                    ['results', `Yêu cầu chức năng (${passedCount}/${results.length})`],
                  ].map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab as 'source' | 'results')}
                      className={`h-9 rounded-md px-3 text-sm font-bold transition ${
                        activeTab === tab
                          ? 'bg-primary-50 text-primary-800 ring-1 ring-primary-200'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  {currentSubmittedFile.name}
                </span>
              </div>
            </div>

            {activeTab === 'source' && (
              <div className="flex-1">
                <Editor
                  height="100%"
                  language="java"
                  value={currentSubmittedFile.content}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    fontFamily: 'JetBrains Mono',
                  }}
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
                    <th className="border-b-2 border-slate-300 px-4 py-5">#</th>
                    <th className="border-b-2 border-slate-300 px-4 py-5">Sinh viên</th>
                    <th className="border-b-2 border-slate-300 px-4 py-5">Bài tập</th>
                    <th className="border-b-2 border-slate-300 px-4 py-5">Thời gian</th>
                    <th className="border-b-2 border-slate-300 px-4 py-5 text-center">Điểm</th>
                    <th className="border-b-2 border-slate-300 px-4 py-5">Kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((sub) => {
                    const effective = sub.manualScore ?? sub.score ?? 0
                    const result = getSubmissionResult(effective)
                    const studentName = sub.student?.fullName || sub.student?.username || 'Sinh viên'
                    return (
                      <tr key={sub.id} className="text-base text-slate-700 hover:bg-slate-50">
                        <td className="border-b border-slate-200 px-4 py-4">
                          <button
                            type="button"
                            onClick={() => handleSelectSubmission(sub.id)}
                            className="font-semibold text-sky-500 hover:underline"
                          >
                            {sub.id.slice(0, 6)}
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
                            {exerciseTitleById.get(sub.exerciseId) || 'Bài thực hành'}
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
            <select
              id="board-section-select"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="mb-5 inline-flex h-11 max-w-full rounded bg-sky-500 px-4 text-base font-semibold text-white outline-none"
              aria-label="Chọn lớp học phần"
            >
              <option value="">Chọn lớp</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>

            {selectedSection && (
              <p className="mb-4 border-b border-slate-200 pb-4 text-sm font-semibold text-slate-500">
                {selectedSection.semester}
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
                    <span className="text-base font-bold text-slate-800">{index + 1}</span>
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
