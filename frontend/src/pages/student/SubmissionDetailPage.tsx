import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, CheckCircleIcon, XCircleIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
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
  if (score >= 80) return 'text-success-700'
  if (score >= 50) return 'text-warning-700'
  return 'text-danger-700'
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

  const statusLabel =
    status === 'timeout' ? 'Quá thời gian' : status === 'error' ? 'Lỗi' : 'Không đạt'
  return (
    <span className="badge-red">
      <XCircleIcon className="h-3.5 w-3.5" />
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
      setError('Không thể tải chi tiết bài nộp. Vui lòng thử lại.')
      toast.error('Không thể tải chi tiết bài nộp. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải bài nộp..." />
  }

  if (error || !submission) {
    return (
      <div className="card flex flex-col items-center justify-center gap-4 p-12 text-center">
        <p className="text-gray-700">{error ?? 'Không tìm thấy bài nộp.'}</p>
        <Link to="/student/submissions" className="btn-primary">
          Quay lại danh sách bài nộp
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
          className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Quay lại danh sách bài nộp
        </Link>
      </div>

      {/* Header card */}
      <div className="card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{submission.exerciseTitle}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Lần nộp #{submission.attemptNumber} — {formatTimestamp(submission.submittedAt)}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${getScoreColor(submission.score)}`}>
              {submission.score.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500">
              {earnedPoints}/{totalPoints} điểm
            </p>
          </div>
        </div>
      </div>

      {/* Test case results */}
      <div className="card">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Kết quả test case</h2>
          <p className="mt-0.5 text-xs text-gray-500">Chỉ hiển thị test case công khai</p>
        </div>
        <div className="divide-y divide-gray-100">
          {submission.testCaseResults.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-500">
              Không có test case công khai cho bài tập này.
            </p>
          ) : (
            submission.testCaseResults.map((tc, index) => (
              <div key={tc.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">
                    {tc.testCaseLabel || `Test case ${index + 1}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{tc.pointValue} điểm</span>
                  {getStatusBadge(tc.status, tc.passed)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Submitted code */}
      <div className="card overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Mã nguồn đã nộp</h2>
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
