import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, CheckCircleIcon, XCircleIcon } from '../../components/ui'
import { StyleAnnotatedCodeViewer } from '../../components/submission/StyleAnnotatedCodeViewer'
import { toast } from '../../stores/toast.store'
import { useAuthStore } from '../../stores/auth.store'

type ResultStatus = 'passed' | 'failed' | 'timeout' | 'error'
type ReviewTab = 'source' | 'results'
type StyleStatus = 'passed' | 'failed' | 'unavailable' | 'skipped'

interface ApiTestCaseInfo {
  inputData?: string | null
  expectedOutput?: string | null
  pointValue?: number | null
  isVisible?: number | boolean
}

interface ApiResult {
  id?: string
  passed?: boolean | number
  status?: ResultStatus
  actualOutput?: string | null
  actual_output?: string | null
  executionTimeMs?: number | null
  execution_time_ms?: number | null
  pointValue?: number
  point_value?: number
  testCaseLabel?: string
  testCase?: ApiTestCaseInfo | null
}

interface TestCaseResult {
  id: string
  passed: boolean
  status: ResultStatus
  pointValue: number
  testCaseLabel: string
  inputData: string
  expectedOutput: string
  actualOutput: string
  executionTimeMs: number | null
}

interface SubmissionDetail {
  id: string
  sectionId: string
  studentId: string
  exerciseId: string
  exerciseTitle: string
  studentName: string | null
  studentUsername: string | null
  studentEmail: string | null
  code: string
  functionalScore: number | null
  score: number
  manualScore: number | null
  styleScore: number | null
  styleStatus: StyleStatus | null
  styleFeedback: string | null
  styleReport: StyleReport | null
  feedback: string | null
  attemptNumber: number
  submittedAt: string
  testCaseResults: TestCaseResult[]
}

type SubmissionDetailResponse = Partial<SubmissionDetail> & {
  section_id?: string
  student_id?: string
  exercise?: {
    title?: string
  }
  student?: {
    id?: string | null
    fullName?: string | null
    username?: string | null
    email?: string | null
  }
  exercise_id?: string
  attempt_number?: number
  submitted_at?: string
  functional_score?: number | null
  style_score?: number | null
  style_status?: StyleStatus | null
  style_feedback?: string | null
  style_report?: string | null
  effectiveScore?: number | null
  results?: ApiResult[]
  testCaseResults?: ApiResult[]
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

interface StyleReport {
  provider?: string
  status?: StyleStatus
  score?: number | null
  violationCount?: number
  toolVersion?: string
  violations?: StyleViolation[]
}

interface SubmittedSourceFile {
  name: string
  content: string
}

function isPassed(value: boolean | number | undefined): boolean {
  return value === true || value === 1
}

function normalizeResult(result: ApiResult, index: number): TestCaseResult {
  const pointValue = Number(result.pointValue ?? result.point_value ?? result.testCase?.pointValue ?? 0)
  const status = result.status ?? (isPassed(result.passed) ? 'passed' : 'failed')
  return {
    id: result.id ?? `result-${index}`,
    passed: isPassed(result.passed) || status === 'passed',
    status,
    pointValue,
    testCaseLabel: result.testCaseLabel ?? `Test case ${index + 1}`,
    inputData: result.testCase?.inputData ?? '',
    expectedOutput: result.testCase?.expectedOutput ?? '',
    actualOutput: result.actualOutput ?? result.actual_output ?? '',
    executionTimeMs: result.executionTimeMs ?? result.execution_time_ms ?? null,
  }
}

function normalizeSubmissionDetail(data: SubmissionDetailResponse): SubmissionDetail {
  const rawResults = Array.isArray(data.testCaseResults)
    ? data.testCaseResults
    : Array.isArray(data.results)
      ? data.results
      : []

  return {
    id: data.id ?? '',
    sectionId: data.sectionId ?? data.section_id ?? '',
    studentId: data.studentId ?? data.student_id ?? data.student?.id ?? '',
    exerciseId: data.exerciseId ?? data.exercise_id ?? '',
    exerciseTitle: data.exerciseTitle ?? data.exercise?.title ?? 'Bài tập',
    studentName: data.studentName ?? data.student?.fullName ?? null,
    studentUsername: data.studentUsername ?? data.student?.username ?? null,
    studentEmail: data.studentEmail ?? data.student?.email ?? null,
    code: data.code ?? '',
    functionalScore: data.functionalScore ?? data.functional_score ?? null,
    score: Number(data.effectiveScore ?? data.manualScore ?? data.score ?? 0),
    manualScore: data.manualScore ?? null,
    styleScore: data.styleScore ?? data.style_score ?? null,
    styleStatus: data.styleStatus ?? data.style_status ?? null,
    styleFeedback: data.styleFeedback ?? data.style_feedback ?? null,
    styleReport: parseStyleReport(data.styleReport ?? data.style_report ?? null),
    feedback: data.feedback ?? null,
    attemptNumber: Number(data.attemptNumber ?? data.attempt_number ?? 1),
    submittedAt: data.submittedAt ?? data.submitted_at ?? new Date().toISOString(),
    testCaseResults: rawResults.map(normalizeResult),
  }
}

function parseStyleReport(value?: string | StyleReport | null): StyleReport | null {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value) as StyleReport
  } catch {
    return null
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
  if (score >= 80) return 'text-emerald-700'
  if (score >= 50) return 'text-amber-700'
  return 'text-rose-700'
}

function getFunctionalMessage(tc: TestCaseResult) {
  if (tc.passed) {
    return 'Kết quả đúng.'
  }
  if (tc.status === 'timeout') {
    return 'Chương trình chạy quá thời gian cho phép.'
  }
  if (tc.status === 'error') {
    return tc.actualOutput || 'Chương trình gặp lỗi khi chạy test.'
  }
  return 'Kết quả sai.'
}

function isSubmissionNullified(submission: SubmissionDetail) {
  const feedback = submission.feedback?.toLowerCase() ?? ''
  return (
    submission.score === 0 &&
    (feedback.includes('hủy') ||
      feedback.includes('0 điểm') ||
      feedback.includes('cảnh báo') ||
      feedback.includes('toàn màn hình'))
  )
}

function getSubmissionStatus(submission: SubmissionDetail) {
  if (isSubmissionNullified(submission)) {
    return { label: 'Bị hủy', className: 'badge-red' }
  }

  if (submission.score >= 100) {
    return { label: 'Accepted', className: 'badge-green' }
  }

  if (submission.score > 0) {
    return { label: 'Finished', className: 'badge-blue' }
  }

  return { label: 'Wrong answer', className: 'badge-red' }
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

function basename(path: string) {
  return path.replace(/\\/g, '/').split('/').pop() ?? path
}

function resolveSubmittedFileName(files: SubmittedSourceFile[], violationFile: string) {
  return (
    files.find((file) => file.name === violationFile || basename(file.name) === basename(violationFile))
      ?.name ?? files[0]?.name ?? 'Main.java'
  )
}

export function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const userRole = useAuthStore((state) => state.user?.role)
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSubmittedFile, setActiveSubmittedFile] = useState('Main.java')
  const [activeTab, setActiveTab] = useState<ReviewTab>('source')
  const [focusStyleLine, setFocusStyleLine] = useState<number | null>(null)

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

  const review = useMemo(() => {
    const results = submission?.testCaseResults ?? []
    if (submission && isSubmissionNullified(submission)) {
      return {
        results: results.map((tc) => ({ ...tc, passed: false, status: 'failed' as ResultStatus })),
        passedCount: 0,
        rawPassedCount: results.filter((tc) => tc.passed).length,
      }
    }

    const passedCount = results.filter((tc) => tc.passed).length
    return { results, passedCount, rawPassedCount: passedCount }
  }, [submission])

  if (loading) {
    return <PageLoader label="Đang tải bài nộp..." />
  }

  const submissionsPath = userRole === 'instructor' ? '/instructor/submissions' : '/student/submissions'
  const isInstructorView = userRole === 'instructor'

  if (error || !submission) {
    return (
      <div className="card flex flex-col items-center justify-center gap-4 p-12 text-center">
        <p className="text-gray-700">{error ?? 'Không tìm thấy bài nộp.'}</p>
        <Link to={submissionsPath} className="btn-primary">
          Quay lại danh sách bài nộp
        </Link>
      </div>
    )
  }

  const submittedFiles = parseSubmittedFiles(submission.code)
  const currentSubmittedFile =
    submittedFiles.find((file) => file.name === activeSubmittedFile) ?? submittedFiles[0]
  const hasPublicResults = review.results.length > 0
  const functionalScore = submission.functionalScore ?? submission.score
  const submissionStatus = getSubmissionStatus(submission)
  const nullified = isSubmissionNullified(submission)

  return (
    <div className="-m-6 min-h-[calc(100vh-8.25rem)] bg-slate-100">
      <div className="border-b border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="mx-auto flex max-w-none flex-wrap items-center justify-between gap-3 px-2 lg:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to={submissionsPath}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary"
              aria-label="Quay lại danh sách bài nộp"
            >
              ←
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-slate-900">
                #{submission.id.slice(0, 8)}: {submission.exerciseTitle}
              </h1>
              <p className="text-xs font-medium text-slate-500">
                {isInstructorView && (submission.studentName || submission.studentUsername)
                  ? `${submission.studentName ?? submission.studentUsername} · `
                  : ''}
                Lần nộp #{submission.attemptNumber} · {formatTimestamp(submission.submittedAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                submittedFiles.length === 1 ? submittedFiles[0].name : `submission-${submission.id}.txt`,
                submittedFiles.length === 1 ? submittedFiles[0].content : buildAllFilesDownload(submittedFiles)
              )
            }
            className="btn-primary h-10 px-4 text-sm"
          >
            Tải mã nguồn
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-none grid-cols-1 gap-4 p-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white">
                Chi tiết bài nộp
              </h2>
            </div>
            <div className="space-y-3 p-4 text-sm text-slate-700">
              {isInstructorView && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sinh viên</p>
                  <p className="mt-1 font-bold text-slate-900">
                    {submission.studentId && submission.sectionId ? (
                      <Link
                        to={`/instructor/classes/${submission.sectionId}/students/${submission.studentId}/profile`}
                        className="text-sky-600 hover:text-sky-800 hover:underline"
                      >
                        {submission.studentName ?? submission.studentUsername ?? 'Không rõ'}
                      </Link>
                    ) : (
                      submission.studentName ?? submission.studentUsername ?? 'Không rõ'
                    )}
                  </p>
                  {(submission.studentUsername || submission.studentEmail) && (
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {[submission.studentUsername, submission.studentEmail].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-500">Trạng thái</span>
                <span className={submissionStatus.className}>{submissionStatus.label}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-500">Điểm chức năng</span>
                <span className="font-bold text-slate-900">
                  {functionalScore.toFixed(1)}/100
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-500">Điểm quy tắc</span>
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-slate-900">
                    {submission.styleScore == null ? 'Chưa chấm' : `${submission.styleScore.toFixed(1)}/100`}
                  </span>
                  {submission.styleStatus && (
                    <span className={
                      submission.styleStatus === 'failed'
                        ? 'badge-red text-[9px] px-1.5 py-0.5'
                        : submission.styleStatus === 'passed'
                          ? 'badge-green text-[9px] px-1.5 py-0.5'
                          : 'badge-gray text-[9px] px-1.5 py-0.5'
                    }>
                      {submission.styleStatus.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-500">
                  {isInstructorView ? 'Test đạt' : 'Test public đạt'}
                </span>
                <span className="font-bold text-slate-900">
                  {review.passedCount}/{review.results.length}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-right">
                <p className={`text-3xl font-extrabold ${getScoreColor(submission.score)}`}>
                  {submission.score.toFixed(1)}%
                </p>
                <p className="text-xs font-semibold text-slate-500">Điểm tổng</p>
              </div>
              {submission.feedback && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  {submission.feedback}
                </div>
              )}

              {/* Checkstyle details */}
              {(submission.styleFeedback || (submission.styleReport?.violations && submission.styleReport.violations.length > 0)) && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chi tiết Quy tắc Checkstyle</p>
                  {submission.styleFeedback && (
                    <p className="rounded-md border border-slate-200 bg-slate-50 p-2.5 leading-5 text-xs text-slate-600">
                      {submission.styleFeedback}
                    </p>
                  )}
                  {submission.styleReport?.violations && submission.styleReport.violations.length > 0 && (
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {submission.styleReport.violations.map((violation, index) => (
                        <button
                          key={`${violation.file}-${violation.line}-${index}`}
                          type="button"
                          onClick={() => {
                            setActiveSubmittedFile(resolveSubmittedFileName(submittedFiles, violation.file))
                            setActiveTab('source')
                            setFocusStyleLine(violation.line ?? null)
                          }}
                          className="block w-full rounded-md bg-slate-50 p-2 text-left text-xs transition hover:bg-amber-50"
                        >
                          <p className="font-bold text-slate-700">
                            {violation.file}
                            {violation.line ? `:${violation.line}` : ''}
                            {violation.column ? `:${violation.column}` : ''}
                          </p>
                          {(violation.ruleLabel || violation.ruleId) && (
                            <p className="mt-1 font-bold text-amber-700">
                              {violation.ruleLabel ?? violation.ruleId}
                            </p>
                          )}
                          <p className="mt-1 leading-5 text-slate-600">{violation.message}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white">
                Bài đã nộp
              </h2>
            </div>
            <div className="divide-y divide-slate-100 p-3">
              {submittedFiles.map((file) => (
                <button
                  key={file.name}
                  type="button"
                  onClick={() => {
                    setActiveSubmittedFile(file.name)
                    setActiveTab('source')
                  }}
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
          </section>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col h-[680px]">
          <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-5 py-3 text-white">
            <h3 className="text-sm font-bold uppercase tracking-wide">Kết Quả Đánh Giá</h3>
          </div>
          
          {/* Checkboxes Row */}
          <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5 flex flex-wrap items-center gap-3 text-xs select-none">
            <span className="font-bold text-slate-500 mr-1">Trạng thái đánh giá:</span>
            {submission.score === 0 && review.results.some(r => r.status === 'error') ? (
              <span className="badge-red py-1 px-2.5 rounded-full">Lỗi cấu trúc (SE)</span>
            ) : (
              <span className="badge-green py-1 px-2.5 rounded-full">Cấu trúc đạt (SE)</span>
            )}
            {submission.styleStatus === 'failed' ? (
              <span className="badge-red py-1 px-2.5 rounded-full">Lỗi quy tắc (PE)</span>
            ) : submission.styleStatus === 'passed' ? (
              <span className="badge-green py-1 px-2.5 rounded-full">Quy tắc đạt (PE)</span>
            ) : (
              <span className="badge-gray py-1 px-2.5 rounded-full">Không xét quy tắc (PE)</span>
            )}
            {review.results.length > 0 && review.results.every(r => r.status === 'error') ? (
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
                  ['results', `Yêu cầu chức năng (${review.passedCount}/${review.results.length})`],
                ].map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab as ReviewTab)}
                    className={`border-b-2 py-3 text-sm font-bold transition-all cursor-pointer ${
                      activeTab === tab
                        ? 'border-primary text-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400 py-3">
                {currentSubmittedFile.name}
              </span>
            </div>
          </div>

          {activeTab === 'source' && (
            <div className="flex-1 bg-slate-950">
              <StyleAnnotatedCodeViewer
                fileName={currentSubmittedFile.name}
                code={currentSubmittedFile?.content ?? ''}
                violations={submission.styleReport?.violations ?? []}
                focusLine={focusStyleLine}
              />
            </div>
          )}

          {activeTab === 'results' && (
            <div className="flex-1 bg-slate-50 p-4 overflow-y-auto space-y-4">
              {!hasPublicResults ? (
                <EmptyResults />
              ) : (
                <div className="space-y-4">
                  {nullified && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                      Bài nộp đã bị hủy điểm, nên {review.rawPassedCount}/{review.results.length} test public chạy đúng không được tính vào điểm.
                    </div>
                  )}
                  {review.results.map((tc, index) => (
                    <FunctionalResultCard
                      key={tc.id}
                      result={tc}
                      index={index}
                      nullified={nullified}
                      isInstructor={isInstructorView}
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

function EmptyResults() {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div>
        <p className="text-sm font-bold text-slate-700">Không có test case công khai</p>
        <p className="mt-1 text-sm text-slate-500">
          Bài nộp có thể chỉ được chấm bằng test ẩn hoặc bị ghi nhận 0 điểm do phiên làm bài.
        </p>
      </div>
    </div>
  )
}


function FunctionalResultCard({
  result,
  index,
  nullified = false,
  isInstructor = false,
}: {
  result: TestCaseResult
  index: number
  nullified?: boolean
  isInstructor?: boolean
}) {
  const [expanded, setExpanded] = useState(!result.passed)
  const statusClass = result.passed
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700'
  const iconClass = result.passed ? 'bg-emerald-600' : 'bg-rose-600'
  const statusLabel = nullified
    ? 'Bị hủy'
    : result.passed
      ? 'Accepted'
      : result.status === 'timeout'
        ? 'Timeout'
        : result.status === 'error'
          ? 'Error'
          : 'Wrong answer'
  const message = nullified
    ? 'Kết quả test không được tính vì bài nộp đã bị hủy điểm.'
    : getFunctionalMessage(result)

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-4">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${iconClass}`}
          >
            {result.passed ? (
              <CheckCircleIcon className="h-6 w-6" />
            ) : (
              <XCircleIcon className="h-6 w-6" />
            )}
          </span>
          <div className="min-w-0">
            <h3 className={`truncate text-base font-bold ${result.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
              {result.testCaseLabel || `Test case ${index + 1}`} ({result.pointValue} điểm)
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {result.executionTimeMs != null ? `${result.executionTimeMs} ms · ` : ''}
              {message}
            </p>
          </div>
        </div>
        <span className={`rounded-md border px-3 py-1 text-xs font-bold uppercase ${statusClass}`}>
          {statusLabel}
        </span>
      </button>

      {expanded && (
        <div className={`border-t px-5 py-4 ${result.passed ? 'border-emerald-100 bg-emerald-50/60' : 'border-rose-100 bg-rose-50/70'}`}>
          <div className="mx-auto max-w-none space-y-5 font-mono text-sm leading-6">
            <OutputBlock
              title="View"
              wrongLabel="Kết quả thực tế"
              wrongValue={isInstructor ? (result.actualOutput || 'Không có output') : (result.actualOutput || (result.passed ? result.expectedOutput : 'Không có output.'))}
              correctLabel="Kết quả đúng"
              correctValue={isInstructor ? (result.expectedOutput || 'Không có') : (result.expectedOutput || (result.passed ? result.actualOutput : 'Không công khai.'))}
              passed={result.passed}
            />
            {(isInstructor || result.inputData || result.actualOutput || result.expectedOutput) && (
              <OutputBlock
                title="Original code"
                wrongLabel="Đầu vào"
                wrongValue={isInstructor ? (result.inputData || 'Không có stdin') : (result.inputData || 'Không có stdin công khai.')}
                correctLabel="Trạng thái"
                correctValue={getFunctionalMessage(result)}
                passed={result.passed}
                compact
              />
            )}
          </div>
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
