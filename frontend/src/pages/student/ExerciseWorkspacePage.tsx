import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui'

interface TestCase {
  id: string
  input: string
  expectedOutput: string
  pointValue: number
}

interface ExerciseDetail {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  starterCode: string
  deadline: string | null
  oopTags: string[]
  visibleTestCases: TestCase[]
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
  easy: { label: 'Easy', className: 'bg-green-100 text-green-800' },
  medium: { label: 'Medium', className: 'bg-yellow-100 text-yellow-800' },
  hard: { label: 'Hard', className: 'bg-red-100 text-red-800' },
}

export function ExerciseWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const [exercise, setExercise] = useState<ExerciseDetail | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [running, setRunning] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activePanel, setActivePanel] = useState<'description' | 'testcases'>('description')

  useEffect(() => {
    if (id) {
      fetchExercise(id)
    }
  }, [id])

  async function fetchExercise(exerciseId: string) {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get(`/api/exercises/${exerciseId}`)
      const data = response.data
      setExercise(data)
      setCode(data.starterCode || '')
    } catch (err) {
      setError('Failed to load exercise. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleRun = useCallback(async () => {
    if (!exercise) return
    setRunning(true)
    setExecutionResult(null)
    setSubmitMessage(null)

    try {
      // Connect to local executor via WebSocket
      const ws = new WebSocket('ws://localhost:9876')

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'compile_and_run',
            code,
            testCases: exercise.visibleTestCases.map((tc) => ({
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
        setSubmitMessage({
          type: 'error',
          text: 'Cannot connect to Local Executor. Make sure the executor JAR is running on port 9876.',
        })
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
          setSubmitMessage({ type: 'error', text: 'Execution timed out.' })
        }
      }, 30000)
    } catch {
      setSubmitMessage({
        type: 'error',
        text: 'Cannot connect to Local Executor. Please ensure it is running.',
      })
      setRunning(false)
    }
  }, [code, exercise, executionResult])

  const handleSubmit = useCallback(async () => {
    if (!exercise) return
    setSubmitting(true)
    setSubmitMessage(null)

    try {
      const response = await api.post('/api/submissions', {
        exerciseId: exercise.id,
        code,
      })
      const score = response.data.score
      setSubmitMessage({
        type: 'success',
        text: `Submission successful! Score: ${score.toFixed(1)}%`,
      })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      const message =
        axiosErr.response?.data?.error?.message || 'Submission failed. Please try again.'
      setSubmitMessage({ type: 'error', text: message })
    } finally {
      setSubmitting(false)
    }
  }, [code, exercise])

  if (loading) {
    return <LoadingIndicator label="Loading exercise..." />
  }

  if (error || !exercise) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-600">{error || 'Exercise not found.'}</p>
        <Link
          to="/student/exercises"
          className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-600 transition-colors"
        >
          Back to Exercises
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 -m-6 p-4">
      {/* Top bar with exercise title and actions */}
      <div className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/student/exercises"
            className="text-gray-400 hover:text-primary transition-colors"
            aria-label="Back to exercises"
          >
            ←
          </Link>
          <h1 className="text-lg font-bold text-gray-900 truncate">{exercise.title}</h1>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${difficultyConfig[exercise.difficulty].className}`}
          >
            {difficultyConfig[exercise.difficulty].label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={running || !code.trim()}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running ? 'Running...' : '▶ Run'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !code.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting...' : '📤 Submit'}
          </button>
        </div>
      </div>

      {/* Main workspace area */}
      <div className="flex flex-1 gap-4 overflow-hidden min-h-0">
        {/* Left panel: description + test cases */}
        <div className="flex w-[380px] flex-shrink-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
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
              Description
            </button>
            <button
              onClick={() => setActivePanel('testcases')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activePanel === 'testcases'
                  ? 'border-b-2 border-primary text-primary bg-primary-50'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Test Cases ({exercise.visibleTestCases.length})
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activePanel === 'description' ? (
              <DescriptionPanel exercise={exercise} />
            ) : (
              <TestCasesPanel
                testCases={exercise.visibleTestCases}
                executionResult={executionResult}
              />
            )}
          </div>
        </div>

        {/* Center: Code editor + output */}
        <div className="flex flex-1 flex-col gap-4 min-w-0 overflow-hidden">
          {/* Monaco Editor */}
          <div className="flex-1 rounded-lg border border-gray-200 overflow-hidden min-h-0">
            <Editor
              height="100%"
              language="java"
              theme="vs-light"
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
              loading={<LoadingIndicator label="Loading editor..." />}
            />
          </div>

          {/* Output panel */}
          <OutputPanel
            executionResult={executionResult}
            submitMessage={submitMessage}
            running={running}
          />
        </div>
      </div>
    </div>
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
            <span
              key={tag}
              className="inline-flex items-center rounded bg-primary-50 px-2 py-0.5 text-xs text-primary-600 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Deadline */}
      {exercise.deadline && (
        <div className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2">
          <p className="text-xs font-medium text-orange-700">
            ⏰ Deadline: {new Date(exercise.deadline).toLocaleString('vi-VN')}
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
        <p className="text-sm text-gray-500">No visible test cases available.</p>
      ) : (
        testCases.map((tc, index) => {
          const result = executionResult?.testResults?.find((r) => r.testCaseId === tc.id)
          return (
            <div
              key={tc.id}
              className={`rounded-md border p-3 ${
                result
                  ? result.passed
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">
                  Test Case {index + 1}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{tc.pointValue} pts</span>
                  {result && (
                    <span
                      className={`text-xs font-medium ${result.passed ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {result.passed ? '✓ Passed' : '✗ Failed'}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div>
                  <p className="text-xs font-medium text-gray-600">Input:</p>
                  <pre className="mt-0.5 rounded bg-white p-2 text-xs text-gray-800 border border-gray-200 overflow-x-auto">
                    {tc.input || '(empty)'}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600">Expected Output:</p>
                  <pre className="mt-0.5 rounded bg-white p-2 text-xs text-gray-800 border border-gray-200 overflow-x-auto">
                    {tc.expectedOutput}
                  </pre>
                </div>
                {result && !result.passed && result.actualOutput && (
                  <div>
                    <p className="text-xs font-medium text-red-600">Actual Output:</p>
                    <pre className="mt-0.5 rounded bg-white p-2 text-xs text-red-700 border border-red-200 overflow-x-auto">
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
  submitMessage,
  running,
}: {
  executionResult: ExecutionResult | null
  submitMessage: { type: 'success' | 'error'; text: string } | null
  running: boolean
}) {
  if (running) {
    return (
      <div className="h-32 rounded-lg border border-gray-200 bg-gray-900 p-4 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
          <span className="text-sm text-green-400">Compiling and running...</span>
        </div>
      </div>
    )
  }

  if (!executionResult && !submitMessage) {
    return (
      <div className="h-32 rounded-lg border border-gray-200 bg-gray-900 p-4 flex items-center justify-center">
        <p className="text-sm text-gray-400">
          Click "Run" to compile and test your code locally, or "Submit" to evaluate against all test cases.
        </p>
      </div>
    )
  }

  return (
    <div className="h-40 rounded-lg border border-gray-200 bg-gray-900 p-4 overflow-y-auto">
      {/* Submit message */}
      {submitMessage && (
        <div
          className={`mb-2 rounded px-3 py-2 text-sm font-medium ${
            submitMessage.type === 'success'
              ? 'bg-green-900/30 text-green-400'
              : 'bg-red-900/30 text-red-400'
          }`}
        >
          {submitMessage.text}
        </div>
      )}

      {/* Execution results */}
      {executionResult && (
        <div className="space-y-2">
          {!executionResult.compiled && executionResult.errors && (
            <div>
              <p className="text-xs font-semibold text-red-400 mb-1">Compilation Errors:</p>
              {executionResult.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-300 font-mono">
                  Line {err.line}: {err.message}
                </p>
              ))}
            </div>
          )}

          {executionResult.compiled && executionResult.testResults && (
            <div>
              <p className="text-xs font-semibold text-green-400 mb-1">
                Compilation successful ✓ — Test Results:
              </p>
              <div className="space-y-1">
                {executionResult.testResults.map((result, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className={`text-xs ${result.passed ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {result.passed ? '✓' : '✗'}
                    </span>
                    <span className="text-xs text-gray-300">
                      Test {i + 1}:{' '}
                      {result.status === 'timeout'
                        ? 'Time Limit Exceeded'
                        : result.status === 'error'
                          ? 'Runtime Error'
                          : result.passed
                            ? 'Passed'
                            : 'Failed'}
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
      )}
    </div>
  )
}
