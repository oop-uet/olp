import { useEffect, useState } from 'react'
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

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-[#17a2b8]'
  if (score >= 50) return 'text-amber-600'
  return 'text-rose-600'
}

function isPassed(value: number | boolean): boolean {
  return value === true || value === 1
}

function getStatusBadge(status: string, passed: boolean) {
  if (passed) {
    return (
      <span className="badge-green">
        <CheckCircleIcon className="h-3.5 w-3.5" />
        Đạt
      </span>
    )
  }

  const statusLabel = status === 'timeout' ? 'Quá thời gian' : status === 'error' ? 'Lỗi' : 'Không đạt'
  return (
    <span className="badge-red">
      <XCircleIcon className="h-3.5 w-3.5" />
      {statusLabel}
    </span>
  )
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

  // Grading state
  const [gradeScore, setGradeScore] = useState('')
  const [gradeFeedback, setGradeFeedback] = useState('')
  const [savingGrade, setSavingGrade] = useState(false)

  const selectedExerciseId = searchParams.get('exercise_id') || ''

  // Map of exerciseId -> title for display
  const exerciseTitleById = new Map(exercises.map((ex) => [ex.id, ex.title]))

  // Fetch initial data
  useEffect(() => {
    fetchExercises()
    fetchSections()
  }, [])

  // Fetch submissions when exercise filter changes
  useEffect(() => {
    fetchSubmissions()
  }, [selectedExerciseId])

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

    return (
      <div className="space-y-6 animate-fade-in">
        
        {/* Breadcrumb */}
        <div className="text-xs text-slate-500 font-medium py-1 px-3 bg-[#fafafa] border-b border-slate-100 rounded flex gap-1.5 items-center">
          <button onClick={handleBackToList} className="text-[#17a2b8] hover:underline">Bài nộp</button>
          <span>/</span>
          <span className="text-slate-400">Chi tiết bài làm</span>
        </div>

        {/* Back button */}
        <button
          onClick={handleBackToList}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#17a2b8] hover:text-teal-700 active:scale-95 transition-all"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Quay lại danh sách bài nộp
        </button>

        {/* Header card */}
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{exerciseTitle}</h1>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              Sinh viên: <span className="text-slate-700 font-bold">{studentName} ({studentUsername})</span>
              {studentEmail ? ` · ${studentEmail}` : ''}
            </p>
            <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
              Lần nộp #{selectedSubmission.attemptNumber} · {formatTimestamp(selectedSubmission.submittedAt)}
            </p>
          </div>
          
          <div className="text-right self-start md:self-auto bg-slate-50/50 border border-slate-100 rounded-xl px-4 py-3 flex items-center gap-4">
            <div className="text-right">
              <span className={`text-3xl font-extrabold tracking-tight ${getScoreColor(effectiveScore)}`}>
                {effectiveScore.toFixed(1)}%
              </span>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                {earnedPoints}/{totalPoints} test cases đạt
              </p>
            </div>
            {isManuallyGraded && (
              <span className="badge-blue self-center text-[10px] font-bold">Chấm tay</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Left panel: grading form and results (1/3 width) */}
          <div className="space-y-6 lg:col-span-1">
            
            {/* Grading panel */}
            <div className="card bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-[#17a2b8] text-white px-5 py-3">
                <h3 className="font-bold text-xs uppercase tracking-wide">Chấm điểm thủ công</h3>
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

            {/* Test case results */}
            <div className="card bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-[#17a2b8] text-white px-5 py-3">
                <h3 className="font-bold text-xs uppercase tracking-wide">Kết quả Test Cases</h3>
              </div>
              <div className="p-4 divide-y divide-slate-100">
                {results.length === 0 ? (
                  <p className="text-center py-4 text-xs text-slate-400 italic">Không có kết quả bộ test.</p>
                ) : (
                  results.map((tc, index) => (
                    <div key={tc.id} className="flex items-center justify-between py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700">Bộ test #{index + 1}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">({tc.testCase?.pointValue ?? 0} đ)</span>
                      </div>
                      {getStatusBadge(tc.status, isPassed(tc.passed))}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Anti-cheat logs */}
            <div className="card bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-[#17a2b8] text-white px-5 py-3">
                <h3 className="font-bold text-xs uppercase tracking-wide">Vi phạm Fullscreen</h3>
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

          </div>

          {/* Right panel: Monaco code editor (2/3 width) */}
          <div className="lg:col-span-2 card bg-white border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[650px]">
            <div className="bg-slate-900 text-slate-300 px-4 py-3 flex items-center justify-between border-b border-slate-800">
              <span className="font-mono text-xs font-bold">Solution.java</span>
              <span className="text-[10px] uppercase font-bold text-slate-500">Chế độ xem mã nộp</span>
            </div>
            <div className="flex-1">
              <Editor
                height="100%"
                language="java"
                value={selectedSubmission.code}
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
          </div>

        </div>

      </div>
    )
  }

  // --- List View ---
  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 font-medium py-1 px-3 bg-[#fafafa] border-b border-slate-100 rounded flex gap-1.5 items-center">
        <span className="text-[#17a2b8] cursor-default">Trang chủ</span>
        <span>/</span>
        <span className="text-slate-400">Chấm bài</span>
      </div>

      {/* Two columns layout: Left (75%) Submissions Table, Right (25%) Mini-Leaderboard */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        
        {/* Left Side: Submissions listing (75% width) */}
        <div className="space-y-6 lg:w-3/4">
          
          <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 font-sans">Lịch Sử Nộp Bài</h1>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                Theo dõi tất cả bài thực hành và chấm điểm thủ công/feedback cho sinh viên.
              </p>
            </div>
            
            {/* Filter by exercise */}
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <label htmlFor="exercise-filter">Bài thực hành:</label>
              <select
                id="exercise-filter"
                value={selectedExerciseId}
                onChange={(e) => handleExerciseFilter(e.target.value)}
                className="input py-1 px-3 max-w-xs text-[11px] font-semibold"
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

          {/* Submissions list card */}
          {loadingList ? (
            <div className="py-20 text-slate-400 text-center flex flex-col items-center justify-center gap-2">
              <Spinner /> Đang nạp danh sách bài nộp...
            </div>
          ) : submissions.length === 0 ? (
            <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
              <SubmissionIcon className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-slate-500 font-medium">Không tìm thấy bài nộp nào phù hợp.</p>
            </div>
          ) : (
            <div className="card overflow-hidden border border-slate-100 shadow-sm">
              {/* Header banner */}
              <div className="bg-[#17a2b8] text-white px-5 py-3.5">
                <h3 className="font-bold text-sm uppercase tracking-wide">Danh Sách Các Bài Nộp</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase">
                      <th className="px-5 py-3">Sinh viên</th>
                      <th className="px-5 py-3">Bài thực hành</th>
                      <th className="px-5 py-3 text-center w-32">Điểm số</th>
                      <th className="px-5 py-3 text-center w-48">Thời điểm nộp</th>
                      <th className="px-5 py-3 text-right w-32">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
                    {submissions.map((sub) => {
                      const effective = sub.manualScore ?? sub.score ?? 0
                      return (
                        <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-semibold text-slate-800">
                              {sub.student?.fullName || sub.student?.username || 'Sinh viên'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">
                              MSSV: {sub.student?.username || ''}
                            </p>
                          </td>
                          <td className="px-5 py-3.5 font-medium text-slate-600">
                            {exerciseTitleById.get(sub.exerciseId) || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <div className="flex flex-col items-center">
                              <span className={`font-bold text-sm ${getScoreColor(effective)}`}>
                                {effective.toFixed(1)}%
                              </span>
                              {sub.manualScore != null && (
                                <span className="bg-blue-50 text-blue-700 text-[9px] font-extrabold rounded-full px-1.5 py-0.2 mt-0.5">Đã sửa</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center text-slate-400 font-medium">
                            {formatTimestamp(sub.submittedAt)}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => handleSelectSubmission(sub.id)}
                              className="btn-secondary btn-sm font-bold text-teal-600 hover:text-teal-700"
                            >
                              Chấm bài
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Right Side: Course Mini-Leaderboard widget (25% width) */}
        <div className="lg:sticky lg:top-4 lg:w-1/4 space-y-6">
          <div className="card p-0 bg-white border border-slate-100 shadow-sm overflow-hidden">
            
            {/* Header */}
            <div className="bg-[#17a2b8] text-white px-4 py-3">
              <h3 className="font-bold text-xs uppercase tracking-wide flex items-center gap-1.5">
                <span>🏆</span>
                Bảng Xếp Hạng Lớp
              </h3>
            </div>

            {/* Course Selector Dropdown inside Right Card */}
            <div className="p-3 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between gap-1.5 text-[11px]">
              <label htmlFor="board-section-select" className="font-bold text-slate-600 uppercase">Lớp:</label>
              <select
                id="board-section-select"
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="input py-1 px-2 text-[10px] font-semibold bg-white max-w-[170px]"
              >
                <option value="">-- Chọn lớp --</option>
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Leaderboard content */}
            <div className="p-4">
              {!selectedSectionId ? (
                <p className="text-[11px] text-slate-400 italic text-center py-4">Chọn một lớp học để xem xếp hạng.</p>
              ) : loadingLeaderboard ? (
                <div className="flex items-center gap-2 py-4 justify-center text-[11px] text-slate-400">
                  <Spinner /> Nạp bảng xếp hạng...
                </div>
              ) : leaderboard.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic text-center py-4">Chưa có xếp hạng cho lớp này.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-xs">
                  {leaderboard.map((item, idx) => (
                    <li key={item.studentId} className="flex items-center justify-between py-2 text-slate-700">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-400 w-4 text-center text-[10px]">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                        </span>
                        <span className="font-semibold truncate max-w-[110px]" title={item.studentName}>
                          {item.studentName}
                        </span>
                      </div>
                      <span className="font-bold text-[#17a2b8]">{item.totalScore.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>
        </div>

      </div>

    </div>
  )
}
