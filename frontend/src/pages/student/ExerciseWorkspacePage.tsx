import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { api } from '../../lib/api'
import { PageLoader, Spinner, CheckCircleIcon, XCircleIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { AntiCheatMonitor } from '../../components/student/AntiCheatMonitor'

interface TestCase {
  id: string
  input: string
  expectedOutput: string
  pointValue: number
}

// Raw test case shape returned by GET /api/students/exercises/:id
interface ApiTestCase {
  id: string
  inputData: string
  expectedOutput: string
  isVisible: true
  pointValue: number
  timeLimitSeconds: number | null
}

interface ExerciseDetail {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  starterCode: string | null
  sectionId: string
  deadline: string | null
  isAssessment: boolean
  warningThreshold: number
  oopTags: string[]
  testCases: TestCase[]
}

interface TestResult {
  testCaseId: string
  passed: boolean
  actualOutput: string
  status: 'passed' | 'failed' | 'timeout' | 'error'
  executionTimeMs?: number
}

interface ExecutionResult {
  compiled: boolean
  errors?: Array<{ line: number; message: string }>
  testResults?: TestResult[]
}

const difficultyConfig = {
  easy: { label: 'Dễ', className: 'badge-green' },
  medium: { label: 'Trung bình', className: 'badge-yellow' },
  hard: { label: 'Khó', className: 'badge-red' },
}

export function ExerciseWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const [exercise, setExercise] = useState<ExerciseDetail | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [running, setRunning] = useState(false)
  const [antiCheatNullified, setAntiCheatNullified] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [activePanel, setActivePanel] = useState<'description' | 'testcases'>('description')
  const zeroSubmissionSentRef = useRef(false)

  useEffect(() => {
    if (id) {
      fetchExercise(id)
    }
  }, [id])

  async function fetchExercise(exerciseId: string) {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get(`/api/students/exercises/${exerciseId}`)
      const data = response.data
      const detail: ExerciseDetail = {
        id: data.id,
        title: data.title,
        description: data.description,
        difficulty: data.difficulty,
        starterCode: data.starterCode ?? null,
        sectionId: data.sectionId,
        deadline: data.deadline ?? null,
        isAssessment: Boolean(data.isAssessment),
        warningThreshold: data.warningThreshold ?? 3,
        oopTags: data.oopTags ?? [],
        testCases: (data.testCases ?? []).map((tc: ApiTestCase) => ({
          id: tc.id,
          input: tc.inputData,
          expectedOutput: tc.expectedOutput,
          pointValue: tc.pointValue,
        })),
      }
      setExercise(detail)
      setCode(detail.starterCode || '')
    } catch (err) {
      setError('Không thể tải bài tập. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const handleRun = useCallback(async () => {
    if (!exercise) return
    setRunning(true)
    setExecutionResult(null)

    try {
      // Connect to local executor via WebSocket
      const ws = new WebSocket('ws://localhost:9876')

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'compile_and_run',
            code,
            testCases: exercise.testCases.map((tc) => ({
              id: tc.id,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
            })),
          })
        )
      }

      ws.onmessage = (event) => {
        const result = JSON.parse(event.data)
        setExecutionResult(result)
        setRunning(false)
        ws.close()
      }

      ws.onerror = () => {
        setExecutionResult(null)
        toast.error(
          'Không thể kết nối tới Local Executor. Hãy đảm bảo executor JAR đang chạy ở cổng 9876.'
        )
        setRunning(false)
      }

      ws.onclose = (event) => {
        if (!event.wasClean && !executionResult) {
          setRunning(false)
        }
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
          setRunning(false)
          toast.error('Quá thời gian thực thi.')
        }
      }, 30000)
    } catch {
      toast.error('Không thể kết nối tới Local Executor. Vui lòng đảm bảo nó đang chạy.')
      setRunning(false)
    }
  }, [code, exercise, executionResult])

  const handleSubmit = useCallback(async () => {
    if (!exercise) return

    // Require the user to run the code before submitting.
    if (!executionResult?.testResults || executionResult.testResults.length === 0) {
      toast.error('Hãy chạy thử bài làm trước khi nộp.')
      return
    }

    setSubmitting(true)

    try {
      const response = await api.post('/api/submissions', {
        exercise_id: exercise.id,
        section_id: exercise.sectionId,
        code,
        test_results: executionResult.testResults.map((r) => ({
          test_case_id: r.testCaseId,
          actual_output: r.actualOutput ?? '',
          execution_time_ms: r.executionTimeMs ?? 0,
          status: r.status,
        })),
        anti_cheat_nullified: antiCheatNullified,
      })
      const score = response.data.score
      toast.success(`Nộp bài thành công! Điểm: ${score.toFixed(1)}%`)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      const message =
        axiosErr.response?.data?.error?.message || 'Nộp bài thất bại. Vui lòng thử lại.'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }, [antiCheatNullified, code, exercise, executionResult])

  const handleAntiCheatNullified = useCallback(async () => {
    if (!exercise || zeroSubmissionSentRef.current) return

    zeroSubmissionSentRef.current = true
    setAntiCheatNullified(true)

    if (exercise.testCases.length === 0) {
      toast.error('Phiên làm bài đã bị khóa do vượt quá ngưỡng cảnh báo.')
      return
    }

    try {
      await api.post('/api/submissions', {
        exercise_id: exercise.id,
        section_id: exercise.sectionId,
        code: code.trim() || '// Phiên làm bài bị khóa do vượt ngưỡng cảnh báo chống gian lận.',
        test_results: exercise.testCases.map((tc) => ({
          test_case_id: tc.id,
          actual_output: '',
          execution_time_ms: 0,
          status: 'failed',
        })),
        anti_cheat_nullified: true,
      })
      toast.error('Bạn đã vượt quá ngưỡng cảnh báo. Bài làm được ghi nhận 0 điểm.')
    } catch {
      toast.error('Phiên làm bài đã bị khóa. Không thể tự động ghi nhận bài nộp 0 điểm.')
    }
  }, [code, exercise])

  if (loading) {
    return <PageLoader label="Đang tải bài tập..." />
  }

  if (error || !exercise) {
    return (
      <div className="card flex flex-col items-center justify-center gap-4 p-12 text-center">
        <p className="text-gray-700">{error || 'Không tìm thấy bài tập.'}</p>
        <Link to="/student/exercises" className="btn-primary">
          Quay lại danh sách bài tập
        </Link>
      </div>
    )
  }

  const workspace = (
    <div className="flex h-full flex-col gap-4 -m-6 p-4">
      {/* Top bar with exercise title and actions */}
      <div className="card flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/student/exercises"
            className="text-gray-400 hover:text-primary transition-colors text-lg"
            aria-label="Quay lại danh sách bài tập"
          >
            ←
          </Link>
          <h1 className="text-lg font-bold text-gray-900 truncate">{exercise.title}</h1>
          <span className={difficultyConfig[exercise.difficulty].className}>
            {difficultyConfig[exercise.difficulty].label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={running || !code.trim()}
            className="btn-success"
          >
            {running ? <Spinner /> : '▶'}
            {running ? 'Đang chạy...' : 'Chạy thử'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !code.trim()}
            className="btn-primary"
          >
            {submitting ? <Spinner /> : '📤'}
            {submitting ? 'Đang nộp...' : 'Nộp bài'}
          </button>
        </div>
      </div>

      {/* Main workspace area */}
      <div className="flex flex-1 gap-4 overflow-hidden min-h-0">
        {/* Left panel: description + test cases */}
        <div className="card flex w-[380px] flex-shrink-0 flex-col overflow-hidden">
          {/* Panel tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActivePanel('description')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activePanel === 'description'
                  ? 'border-b-2 border-primary text-primary bg-primary-50'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Mô tả
            </button>
            <button
              onClick={() => setActivePanel('testcases')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activePanel === 'testcases'
                  ? 'border-b-2 border-primary text-primary bg-primary-50'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Test case ({exercise.testCases.length})
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activePanel === 'description' ? (
              <DescriptionPanel exercise={exercise} />
            ) : (
              <TestCasesPanel
                testCases={exercise.testCases}
                executionResult={executionResult}
              />
            )}
          </div>
        </div>

        {/* Center: Code editor + output */}
        <div className="flex flex-1 flex-col gap-4 min-w-0 overflow-hidden">
          {/* Monaco Editor */}
          <div className="flex-1 rounded-xl border border-slate-200 overflow-hidden min-h-0 shadow-sm">
            <Editor
              height="100%"
              language="java"
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                wordWrap: 'on',
                padding: { top: 12 },
              }}
              loading={<PageLoader label="Đang tải trình soạn thảo..." />}
            />
          </div>

          {/* Output panel */}
          <OutputPanel executionResult={executionResult} running={running} />
        </div>
      </div>
    </div>
  )

  return (
    <AntiCheatMonitor
      isAssessment={exercise.isAssessment}
      exerciseId={exercise.id}
      warningThreshold={exercise.warningThreshold}
      onNullified={handleAntiCheatNullified}
    >
      {workspace}
    </AntiCheatMonitor>
  )
}

/* --- Sub-components --- */

function DescriptionPanel({ exercise }: { exercise: ExerciseDetail }) {
  return (
    <div className="space-y-4">
      {/* Tags */}
      {exercise.oopTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {exercise.oopTags.map((tag) => (
            <span key={tag} className="badge-blue">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Deadline */}
      {exercise.deadline && (
        <div className="rounded-lg bg-warning-50 border border-warning-100 px-3 py-2">
          <p className="text-xs font-medium text-warning-700">
            ⏰ Hạn nộp: {new Date(exercise.deadline).toLocaleString('vi-VN')}
          </p>
        </div>
      )}

      {/* Description */}
      <div className="prose prose-sm max-w-none">
        <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
          {exercise.description}
        </div>
      </div>
    </div>
  )
}

function TestCasesPanel({
  testCases,
  executionResult,
}: {
  testCases: TestCase[]
  executionResult: ExecutionResult | null
}) {
  return (
    <div className="space-y-3">
      {testCases.length === 0 ? (
        <p className="text-sm text-gray-500">Không có test case công khai.</p>
      ) : (
        testCases.map((tc, index) => {
          const result = executionResult?.testResults?.find((r) => r.testCaseId === tc.id)
          return (
            <div
              key={tc.id}
              className={`rounded-lg border p-3 ${
                result
                  ? result.passed
                    ? 'border-success-100 bg-success-50'
                    : 'border-danger-100 bg-danger-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">
                  Test case {index + 1}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{tc.pointValue} điểm</span>
                  {result && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                        result.passed ? 'text-success-600' : 'text-danger-600'
                      }`}
                    >
                      {result.passed ? (
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                      ) : (
                        <XCircleIcon className="h-3.5 w-3.5" />
                      )}
                      {result.passed ? 'Đạt' : 'Không đạt'}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div>
                  <p className="text-xs font-medium text-gray-600">Đầu vào:</p>
                  <pre className="mt-0.5 rounded bg-white p-2 text-xs text-gray-800 border border-gray-200 overflow-x-auto">
                    {tc.input || '(trống)'}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Đầu ra mong đợi:</p>
                  <pre className="mt-0.5 rounded bg-white p-2 text-xs text-gray-800 border border-gray-200 overflow-x-auto">
                    {tc.expectedOutput}
                  </pre>
                </div>
                {result && !result.passed && result.actualOutput && (
                  <div>
                    <p className="text-xs font-medium text-danger-600">Đầu ra thực tế:</p>
                    <pre className="mt-0.5 rounded bg-white p-2 text-xs text-danger-700 border border-danger-100 overflow-x-auto">
                      {result.actualOutput}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function OutputPanel({
  executionResult,
  running,
}: {
  executionResult: ExecutionResult | null
  running: boolean
}) {
  if (running) {
    return (
      <div className="h-32 rounded-xl border border-gray-200 bg-gray-900 p-4 flex items-center justify-center">
        <div className="flex items-center gap-2 text-success-400">
          <Spinner />
          <span className="text-sm">Đang biên dịch và chạy...</span>
        </div>
      </div>
    )
  }

  if (!executionResult) {
    return (
      <div className="h-32 rounded-xl border border-gray-200 bg-gray-900 p-4 flex items-center justify-center text-center">
        <p className="text-sm text-gray-400">
          Nhấn "Chạy thử" để biên dịch và kiểm tra mã của bạn cục bộ, hoặc "Nộp bài" để chấm điểm với tất cả test case.
        </p>
      </div>
    )
  }

  return (
    <div className="h-40 rounded-xl border border-gray-200 bg-gray-900 p-4 overflow-y-auto">
      {/* Execution results */}
      <div className="space-y-2">
        {!executionResult.compiled && executionResult.errors && (
          <div>
            <p className="text-xs font-semibold text-danger-400 mb-1">Lỗi biên dịch:</p>
            {executionResult.errors.map((err, i) => (
              <p key={i} className="text-xs text-danger-300 font-mono">
                Dòng {err.line}: {err.message}
              </p>
            ))}
          </div>
        )}

        {executionResult.compiled && executionResult.testResults && (
          <div>
            <p className="text-xs font-semibold text-success-400 mb-1">
              Biên dịch thành công ✓ — Kết quả test:
            </p>
            <div className="space-y-1">
              {executionResult.testResults.map((result, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className={`text-xs ${result.passed ? 'text-success-400' : 'text-danger-400'}`}
                  >
                    {result.passed ? '✓' : '✗'}
                  </span>
                  <span className="text-xs text-gray-300">
                    Test {i + 1}:{' '}
                    {result.status === 'timeout'
                      ? 'Quá thời gian'
                      : result.status === 'error'
                        ? 'Lỗi thực thi'
                        : result.passed
                          ? 'Đạt'
                          : 'Không đạt'}
                  </span>
                  {result.executionTimeMs !== undefined && (
                    <span className="text-xs text-gray-500">({result.executionTimeMs}ms)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
