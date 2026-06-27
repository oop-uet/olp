import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui'
import Editor from '@monaco-editor/react'

interface TestCaseResult {
  id: string
  passed: boolean
  status: 'passed' | 'failed' | 'timeout' | 'error'
  pointValue: number
  testCaseLabel: string
}

interface SubmissionDetail {
  id: string
  exerciseId: string
  exerciseTitle: string
  code: string
  score: number
  attemptNumber: number
  submittedAt: string
  testCaseResults: TestCaseResult[]
}

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
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-xs font-medium text-green-700">
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
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-700">
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

export function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id) fetchSubmission(id)
  }, [id])

  async function fetchSubmission(submissionId: string) {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get(`/api/submissions/${submissionId}`)
      setSubmission(response.data)
    } catch {
      setError('Failed to load submission details. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingIndicator label="Loading submission..." />
  }

  if (error || !submission) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-600">{error ?? 'Submission not found.'}</p>
        <Link
          to="/student/submissions"
          className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-600 transition-colors"
        >
          Back to Submissions
        </Link>
      </div>
    )
  }

  const totalPoints = submission.testCaseResults.reduce((sum, tc) => sum + tc.pointValue, 0)
  const earnedPoints = submission.testCaseResults
    .filter((tc) => tc.passed)
    .reduce((sum, tc) => sum + tc.pointValue, 0)

  return (
    <div className="space-y-6">
      {/* Breadcrumb / Back link */}
      <div>
        <Link
          to="/student/submissions"
          className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Submissions
        </Link>
      </div>

      {/* Header card */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{submission.exerciseTitle}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Attempt #{submission.attemptNumber} — {formatTimestamp(submission.submittedAt)}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${getScoreColor(submission.score)}`}>
              {submission.score.toFixed(1)}%
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
          <p className="mt-0.5 text-xs text-gray-500">
            Visible test cases only
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {submission.testCaseResults.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-500">No visible test cases for this exercise.</p>
          ) : (
            submission.testCaseResults.map((tc, index) => (
              <div
                key={tc.id}
                className="flex items-center justify-between px-5 py-3"
              >
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

      {/* Submitted code */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Submitted Code</h2>
        </div>
        <div className="h-[400px]">
          <Editor
            height="100%"
            language="java"
            value={submission.code}
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
