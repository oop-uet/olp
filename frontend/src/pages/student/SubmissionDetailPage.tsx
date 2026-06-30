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

type SubmissionDetailResponse = Partial<SubmissionDetail> & {
  exercise?: {
    title?: string
  }
  exercise_id?: string
  attempt_number?: number
  submitted_at?: string
}

interface SubmittedSourceFile {
  name: string
  content: string
}

function normalizeSubmissionDetail(data: SubmissionDetailResponse): SubmissionDetail {
  return {
    id: data.id ?? '',
    exerciseId: data.exerciseId ?? data.exercise_id ?? '',
    exerciseTitle: data.exerciseTitle ?? data.exercise?.title ?? 'Bài tập',
    code: data.code ?? '',
    score: Number(data.score ?? 0),
    attemptNumber: Number(data.attemptNumber ?? data.attempt_number ?? 1),
    submittedAt: data.submittedAt ?? data.submitted_at ?? new Date().toISOString(),
    testCaseResults: Array.isArray(data.testCaseResults) ? data.testCaseResults : [],
  }
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
  const [activeSubmittedFile, setActiveSubmittedFile] = useState('Main.java')

  useEffect(() => {
    if (id) fetchSubmission(id)
  }, [id])

  useEffect(() => {
    if (submission) {
      setActiveSubmittedFile(parseSubmittedFiles(submission.code)[0]?.name ?? 'Main.java')
    }
  }, [submission])

  async function fetchSubmission(submissionId: string) {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get(`/api/submissions/${submissionId}`)
      setSubmission(normalizeSubmissionDetail(response.data))
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

  const testCaseResults = submission.testCaseResults ?? []
  const totalPoints = testCaseResults.reduce((sum, tc) => sum + tc.pointValue, 0)
  const earnedPoints = testCaseResults
    .filter((tc) => tc.passed)
    .reduce((sum, tc) => sum + tc.pointValue, 0)
  const submittedFiles = parseSubmittedFiles(submission.code)
  const currentSubmittedFile =
    submittedFiles.find((file) => file.name === activeSubmittedFile) ?? submittedFiles[0]

  return (
    <div className="-m-6 min-h-[calc(100vh-8.25rem)] bg-slate-100">
      <div className="border-b border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/student/submissions"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
              aria-label="Quay lại danh sách bài nộp"
            >
              ←
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-900">
                {submission.exerciseTitle}
              </h1>
              <p className="text-xs font-medium text-slate-500">
                Lần nộp #{submission.attemptNumber} · {formatTimestamp(submission.submittedAt)}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-right">
            <p className={`text-2xl font-bold ${getScoreColor(submission.score)}`}>
              {submission.score.toFixed(1)}%
            </p>
            <p className="text-xs font-medium text-slate-500">
              {earnedPoints}/{totalPoints} điểm
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
              Kết quả test case
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Chỉ hiển thị test case công khai</p>
          </div>
          <div className="divide-y divide-slate-100">
            {testCaseResults.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500">
                Không có test case công khai cho bài tập này.
              </p>
            ) : (
              testCaseResults.map((tc, index) => (
                <div key={tc.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {tc.testCaseLabel || `Test case ${index + 1}`}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{tc.pointValue} điểm</p>
                    </div>
                    {getStatusBadge(tc.status, tc.passed)}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 shadow-sm">
          <div className="flex h-11 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3">
            <h2 className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-300">
              Mã nguồn đã nộp
            </h2>
            {submittedFiles.length > 1 && (
              <div className="flex min-w-0 gap-1 overflow-x-auto">
                {submittedFiles.map((file) => (
                  <button
                    key={file.name}
                    onClick={() => setActiveSubmittedFile(file.name)}
                    className={`h-8 shrink-0 rounded-md px-3 text-xs font-semibold ${
                      currentSubmittedFile.name === file.name
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {file.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="h-[calc(100vh-16rem)] min-h-[480px]">
            <Editor
              height="100%"
              language="java"
              value={currentSubmittedFile?.content ?? ''}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                lineHeight: 22,
                lineNumbers: 'on',
                wordWrap: 'on',
                automaticLayout: true,
              }}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
