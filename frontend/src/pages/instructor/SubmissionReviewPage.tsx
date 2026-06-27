import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui'
import Editor from '@monaco-editor/react'

// --- Types ---

interface SubmissionListItem {
  id: string
  studentName: string
  studentId: string
  exerciseTitle: string
  score: number
  submittedAt: string
}

interface TestCaseResult {
  id: string
  passed: boolean
  status: 'passed' | 'failed' | 'timeout' | 'error'
  pointValue: number
  testCaseLabel: string
  actualOutput?: string
}

interface SubmissionDetail {
  id: string
  studentName: string
  studentId: string
  exerciseId: string
  exerciseTitle: string
  code: string
  score: number
  attemptNumber: number
  submittedAt: string
  testCaseResults: TestCaseResult[]
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
  if (score >= 80) return 'text-green-700'
  if (score >= 50) return 'text-yellow-700'
  return 'text-red-700'
}

function getStatusBadge(status: string, passed: boolean) {
  if (passed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        Pass
      </span>
    )
  }

  const statusLabel = status === 'timeout' ? 'Timeout' : status === 'error' ? 'Error' : 'Fail'
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
      {statusLabel}
    </span>
  )
}

function getEventTypeLabel(eventType: string): string {
  switch (eventType) {
    case 'fullscreen_exit':
      return 'Fullscreen Exit'
    case 'visibility_hidden':
      return 'Tab Switch'
    case 'window_blur':
      return 'Window Blur'
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
  const [listError, setListError] = useState<string | null>(null)

  // Detail state
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null)
  const [antiCheatLog, setAntiCheatLog] = useState<AntiCheatEvent[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const selectedExerciseId = searchParams.get('exercise_id') || ''

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
      setExercises(response.data.map((e: { id: string; title: string }) => ({ id: e.id, title: e.title })))
    } catch {
      // Non-critical: filter will still work without exercise names
    }
  }

  async function fetchSubmissions() {
    setLoadingList(true)
    setListError(null)
    try {
      const params: Record<string, string> = {}
      if (selectedExerciseId) {
        params.exercise_id = selectedExerciseId
      }
      const response = await api.get('/api/submissions', { params })
      setSubmissions(response.data)
    } catch {
      setListError('Failed to load submissions. Please try again.')
    } finally {
      setLoadingList(false)
    }
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
      setSelectedSubmission(detailRes.data)
      setAntiCheatLog(logRes.data)
    } catch {
      setDetailError('Failed to load submission details.')
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
      return <LoadingIndicator label="Loading submission details..." />
    }

    if (detailError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8">
          <p className="text-red-600">{detailError}</p>
          <button
            onClick={handleBackToList}
            className="rounded-md bg-primary px-4 py-2 text-sm text-white transition-colors hover:bg-primary-600"
          >
            Back to Submissions
          </button>
        </div>
      )
    }

    if (!selectedSubmission) return null

    const totalPoints = selectedSubmission.testCaseResults.reduce((sum, tc) => sum + tc.pointValue, 0)
    const earnedPoints = selectedSubmission.testCaseResults
      .filter((tc) => tc.passed)
      .reduce((sum, tc) => sum + tc.pointValue, 0)

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
          Back to Submissions
        </button>

        {/* Header card */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{selectedSubmission.exerciseTitle}</h1>
              <p className="mt-1 text-sm text-gray-500">
                {selectedSubmission.studentName} ({selectedSubmission.studentId}) — Attempt #
                {selectedSubmission.attemptNumber}
              </p>
              <p className="text-xs text-gray-400">{formatTimestamp(selectedSubmission.submittedAt)}</p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${getScoreColor(selectedSubmission.score)}`}>
                {selectedSubmission.score.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500">
                {earnedPoints}/{totalPoints} points
              </p>
            </div>
          </div>
        </div>

        {/* Test case results */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Test Case Results</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {selectedSubmission.testCaseResults.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">No test case results.</p>
            ) : (
              selectedSubmission.testCaseResults.map((tc, index) => (
                <div key={tc.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">
                      {tc.testCaseLabel || `Test Case ${index + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {tc.pointValue} pt{tc.pointValue !== 1 ? 's' : ''}
                    </span>
                    {getStatusBadge(tc.status, tc.passed)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Anti-cheat log */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Anti-Cheat Log</h2>
          </div>
          {antiCheatLog.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-500">No anti-cheat events recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Event Type
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Warning Count
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {antiCheatLog.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-700">
                        {getEventTypeLabel(event.eventType)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-700">
                        {event.warningCountAtEvent}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-500">
                        {formatTimestamp(event.occurredAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Submitted code */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Submitted Code</h2>
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
        <h1 className="text-2xl font-semibold text-gray-800">Submission Review</h1>
      </div>

      {/* Filter by exercise */}
      <div className="flex items-center gap-3">
        <label htmlFor="exercise-filter" className="text-sm font-medium text-gray-700">
          Filter by exercise:
        </label>
        <select
          id="exercise-filter"
          value={selectedExerciseId}
          onChange={(e) => handleExerciseFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All exercises</option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.title}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {listError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {listError}
          <button onClick={fetchSubmissions} className="ml-2 font-medium underline hover:text-red-800">
            Retry
          </button>
        </div>
      )}

      {/* Submissions table */}
      {loadingList ? (
        <LoadingIndicator label="Loading submissions..." />
      ) : submissions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No submissions found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Student
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Exercise
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Submitted At
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {submissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{sub.studentName}</p>
                      <p className="text-xs text-gray-500">{sub.studentId}</p>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                    {sub.exerciseTitle}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className={`text-sm font-medium ${getScoreColor(sub.score)}`}>
                      {sub.score.toFixed(1)}%
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {formatTimestamp(sub.submittedAt)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <button
                      onClick={() => handleSelectSubmission(sub.id)}
                      className="text-sm font-medium text-primary hover:text-primary-600"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
