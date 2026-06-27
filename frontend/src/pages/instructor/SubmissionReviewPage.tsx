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
  if (score >= 80) return 'text-success-700'
  if (score >= 50) return 'text-warning-700'
  return 'text-danger-700'
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

// --- Component ---

export function SubmissionReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // List state
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([])
  const [exercises, setExercises] = useState<ExerciseOption[]>([])
  const [loadingList, setLoadingList] = useState(true)

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

  // Map of exerciseId -> title for display (list/detail responses only carry exerciseId)
  const exerciseTitleById = new Map(exercises.map((ex) => [ex.id, ex.title]))

  // Fetch exercises for filter dropdown
  useEffect(() => {
    fetchExercises()
  }, [])

  // Fetch submissions when exercise filter changes
  useEffect(() => {
    fetchSubmissions()
  }, [selectedExerciseId])

  async function fetchExercises() {
    try {
      const response = await api.get('/api/exercises')
      setExercises(
        response.data.map((e: { id: string; title: string }) => ({ id: e.id, title: e.title }))
      )
    } catch {
      // Non-critical: filter will still work without exercise names
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

  function handleSelectSubmission(submissionId: string) {
    fetchSubmissionDetail(submissionId)
  }

  function handleBackToList() {
    setSelectedSubmission(null)
    setDetailError(null)
  }

  // --- Detail View ---
  if (selectedSubmission || loadingDetail) {
    if (loadingDetail) {
      return <PageLoader label="Đang tải chi tiết bài nộp..." />
    }

    if (detailError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8">
          <p className="text-danger-600">{detailError}</p>
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
    const exerciseTitle =
      exerciseTitleById.get(selectedSubmission.exerciseId) || 'Bài tập'
    const studentName = selectedSubmission.student?.username || 'Sinh viên'
    const studentEmail = selectedSubmission.student?.email || ''

    return (
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={handleBackToList}
          className="inline-flex items-center gap-1 text-sm text-primary transition-colors hover:text-primary-600"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Quay lại danh sách
        </button>

        {/* Header card */}
        <div className="card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{exerciseTitle}</h1>
              <p className="mt-1 text-sm text-gray-500">
                {studentName}
                {studentEmail ? ` (${studentEmail})` : ''} — Lần nộp #
                {selectedSubmission.attemptNumber}
              </p>
              <p className="text-xs text-gray-400">{formatTimestamp(selectedSubmission.submittedAt)}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <p className={`text-2xl font-bold ${getScoreColor(effectiveScore)}`}>
                  {effectiveScore.toFixed(1)}%
                </p>
                {isManuallyGraded && <span className="badge-blue">Đã chấm tay</span>}
              </div>
              <p className="text-xs text-gray-500">
                {earnedPoints}/{totalPoints} điểm tự động
              </p>
              {isManuallyGraded && selectedSubmission.score != null && (
                <p className="text-xs text-gray-400">
                  Điểm tự động: {selectedSubmission.score.toFixed(1)}%
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Grading panel */}
        <div className="card">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Chấm điểm thủ công</h2>
          </div>
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="grade-score" className="label">
                  Điểm (0-100)
                </label>
                <input
                  id="grade-score"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={gradeScore}
                  onChange={(e) => setGradeScore(e.target.value)}
                  className="input"
                  placeholder="Nhập điểm..."
                />
              </div>
            </div>
            <div>
              <label htmlFor="grade-feedback" className="label">
                Nhận xét
              </label>
              <textarea
                id="grade-feedback"
                rows={4}
                value={gradeFeedback}
                onChange={(e) => setGradeFeedback(e.target.value)}
                className="input"
                placeholder="Nhận xét cho sinh viên..."
              />
            </div>
            <div className="flex justify-end">
              <button onClick={handleSaveGrade} disabled={savingGrade} className="btn-primary btn-sm">
                {savingGrade ? (
                  <>
                    <Spinner /> Đang lưu...
                  </>
                ) : (
                  'Lưu điểm'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Test case results */}
        <div className="card">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Kết quả bộ test</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {results.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">Không có kết quả bộ test.</p>
            ) : (
              results.map((tc, index) => (
                <div key={tc.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">Bộ test {index + 1}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{tc.testCase?.pointValue ?? 0} điểm</span>
                    {getStatusBadge(tc.status, isPassed(tc.passed))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Anti-cheat log */}
        <div className="card">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Nhật ký chống gian lận</h2>
          </div>
          {antiCheatLog.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-500">Không có sự kiện chống gian lận nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-th">Loại sự kiện</th>
                    <th className="table-th">Số lần cảnh báo</th>
                    <th className="table-th">Thời điểm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {antiCheatLog.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="table-td">{getEventTypeLabel(event.eventType)}</td>
                      <td className="table-td">{event.warningCountAtEvent}</td>
                      <td className="table-td text-gray-500">{formatTimestamp(event.occurredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Submitted code */}
        <div className="card">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Mã đã nộp</h2>
          </div>
          <div className="h-[400px]">
            <Editor
              height="100%"
              language="java"
              value={selectedSubmission.code}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                lineNumbers: 'on',
                wordWrap: 'on',
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  // --- List View ---
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Chấm bài</h1>
      </div>

      {/* Filter by exercise */}
      <div className="flex items-center gap-3">
        <label htmlFor="exercise-filter" className="text-sm font-medium text-gray-700">
          Lọc theo bài tập:
        </label>
        <select
          id="exercise-filter"
          value={selectedExerciseId}
          onChange={(e) => handleExerciseFilter(e.target.value)}
          className="input max-w-xs"
        >
          <option value="">Tất cả bài tập</option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.title}
            </option>
          ))}
        </select>
      </div>

      {/* Submissions table */}
      {loadingList ? (
        <PageLoader label="Đang tải bài nộp..." />
      ) : submissions.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <SubmissionIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">Không tìm thấy bài nộp nào.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Sinh viên</th>
                <th className="table-th">Bài tập</th>
                <th className="table-th">Điểm</th>
                <th className="table-th">Thời điểm nộp</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {submissions.map((sub) => {
                const effective = sub.manualScore ?? sub.score ?? 0
                return (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-gray-900">
                        {sub.student?.username || 'Sinh viên'}
                      </p>
                      <p className="text-xs text-gray-500">{sub.student?.email || ''}</p>
                    </td>
                    <td className="table-td">
                      {exerciseTitleById.get(sub.exerciseId) || '—'}
                    </td>
                    <td className="table-td">
                      <span className={`text-sm font-medium ${getScoreColor(effective)}`}>
                        {effective.toFixed(1)}%
                      </span>
                      {sub.manualScore != null && (
                        <span className="ml-2 badge-blue">Đã chấm tay</span>
                      )}
                    </td>
                    <td className="table-td text-gray-500">{formatTimestamp(sub.submittedAt)}</td>
                    <td className="table-td text-right">
                      <button
                        onClick={() => handleSelectSubmission(sub.id)}
                        className="btn-secondary btn-sm"
                      >
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
