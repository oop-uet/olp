import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { AntiCheatMonitor } from '../../components/student/AntiCheatMonitor'
import { useLocalExecutor } from '../../hooks/useLocalExecutor'
import { useAuthStore } from '../../stores/auth.store'

interface TestCase {
  id: string
  input: string
  expectedOutput: string
  pointValue: number
  type: 'stdio' | 'java_junit'
  testFileName?: string
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

const JAVA_TEST_MARKER = '__OOP_JAVA_TEST__'

function parseJavaTestMetadata(inputData: string) {
  if (!inputData.startsWith(JAVA_TEST_MARKER)) {
    return { type: 'stdio' as const, testFileName: undefined }
  }

  const [, fileName] = inputData.split(/\r?\n/, 2)
  return {
    type: 'java_junit' as const,
    testFileName: fileName?.trim() || 'MyTest.java',
  }
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

interface SourceFile {
  id: string
  name: string
  content: string
}

interface WorkspaceDraft {
  version: 1
  files: SourceFile[]
  activeFileId: string
  updatedAt: string
}

const difficultyConfig = {
  easy: { label: 'Dễ', className: 'badge-green' },
  medium: { label: 'Trung bình', className: 'badge-yellow' },
  hard: { label: 'Khó', className: 'badge-red' },
}

function createInitialSourceFile(code: string): SourceFile {
  const starterFiles = parseStarterFiles(code)
  if (starterFiles.length > 0) {
    return starterFiles[0]
  }

  const className = code.match(/public\s+class\s+([A-Za-z_$][\w$]*)/)?.[1] ?? 'Main'
  return {
    id: `${className}-${Date.now()}`,
    name: `${className}.java`,
    content: code,
  }
}

function parseStarterFiles(code: string): SourceFile[] {
  try {
    const parsed = JSON.parse(code) as {
      format?: string
      files?: Array<{ name?: string; content?: string }>
    }

    if (parsed.format !== 'oop-java-files' || !Array.isArray(parsed.files)) return []

    return parsed.files
      .filter((file) => file.name?.endsWith('.java') && typeof file.content === 'string')
      .map((file, index) => ({
        id: `${file.name}-${Date.now()}-${index}`,
        name: file.name as string,
        content: file.content as string,
      }))
  } catch {
    return []
  }
}

function createNewSourceFile(existingFiles: SourceFile[]): SourceFile {
  let index = existingFiles.length + 1
  let name = `Class${index}.java`

  while (existingFiles.some((file) => file.name === name)) {
    index += 1
    name = `Class${index}.java`
  }

  const className = name.replace(/\.java$/i, '')
  return {
    id: `${className}-${Date.now()}`,
    name,
    content: `public class ${className} {\n}\n`,
  }
}

function filesForExecution(files: SourceFile[]) {
  return files
    .map((file) => ({ name: file.name.trim(), content: file.content }))
    .filter((file) => file.name.endsWith('.java') && file.content.trim().length > 0)
}

function serializeSubmissionFiles(files: Array<{ name: string; content: string }>): string {
  if (files.length === 1) {
    return files[0].content
  }

  return JSON.stringify(
    {
      format: 'oop-java-files',
      version: 1,
      files,
    },
    null,
    2
  )
}

function getDraftKey(exerciseId: string, userId: string) {
  return `oop-workspace-draft:${userId}:${exerciseId}`
}

function readWorkspaceDraft(exerciseId: string, userId: string): WorkspaceDraft | null {
  try {
    const raw = localStorage.getItem(getDraftKey(exerciseId, userId))
    if (!raw) return null
    const draft = JSON.parse(raw) as WorkspaceDraft
    if (
      draft.version !== 1 ||
      !Array.isArray(draft.files) ||
      draft.files.length === 0 ||
      draft.files.some((file) => !file.id || !file.name.endsWith('.java'))
    ) {
      return null
    }
    return draft
  } catch {
    return null
  }
}

function writeWorkspaceDraft(exerciseId: string, userId: string, files: SourceFile[], activeFileId: string) {
  try {
    localStorage.setItem(
      getDraftKey(exerciseId, userId),
      JSON.stringify({
        version: 1,
        files,
        activeFileId,
        updatedAt: new Date().toISOString(),
      } satisfies WorkspaceDraft)
    )
  } catch {
    // Draft persistence is best-effort; editor state still stays in memory.
  }
}

function clearWorkspaceDraft(exerciseId: string, userId: string) {
  try {
    localStorage.removeItem(getDraftKey(exerciseId, userId))
  } catch {
    // Best-effort cleanup.
  }
}

export function ExerciseWorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const userId = useAuthStore((state) => state.user?.id ?? 'anonymous')
  const [exercise, setExercise] = useState<ExerciseDetail | null>(null)
  const [files, setFiles] = useState<SourceFile[]>(() => [
    { id: 'main', name: 'Main.java', content: '' },
  ])
  const [activeFileId, setActiveFileId] = useState('main')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [running, setRunning] = useState(false)
  const [antiCheatNullified, setAntiCheatNullified] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [activePanel, setActivePanel] = useState<'description' | 'testcases'>('description')
  const zeroSubmissionSentRef = useRef(false)
  const {
    status: executorStatus,
    connectionError: executorError,
    isConnected: executorReady,
    connect: connectExecutor,
    compileAndRun,
  } = useLocalExecutor()

  useEffect(() => {
    if (id) {
      fetchExercise(id)
    }
  }, [id, userId])

  useEffect(() => {
    if (exercise) {
      connectExecutor()
    }
  }, [connectExecutor, exercise])

  useEffect(() => {
    if (!exercise || loading) return
    writeWorkspaceDraft(exercise.id, userId, files, activeFileId)
  }, [activeFileId, exercise, files, loading, userId])

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
        testCases: (data.testCases ?? []).map((tc: ApiTestCase) => {
          const metadata = parseJavaTestMetadata(tc.inputData)
          return {
            id: tc.id,
            input: tc.inputData,
            expectedOutput: tc.expectedOutput,
            pointValue: tc.pointValue,
            type: metadata.type,
            testFileName: metadata.testFileName,
          }
        }),
      }
      setExercise(detail)
      const draft = readWorkspaceDraft(exerciseId, userId)
      const starterFiles = parseStarterFiles(detail.starterCode || '')
      const nextFiles = draft?.files.length
        ? draft.files
        : starterFiles.length > 0
          ? starterFiles
          : [createInitialSourceFile(detail.starterCode || '')]
      setFiles(nextFiles)
      setActiveFileId(
        draft?.activeFileId && nextFiles.some((file) => file.id === draft.activeFileId)
          ? draft.activeFileId
          : nextFiles[0].id
      )
      if (draft) {
        toast.success('Đã khôi phục bản nháp bài làm trên máy này.')
      }
    } catch {
      setError('Không thể tải bài tập. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const handleRun = useCallback(async () => {
    if (!exercise) return
    const sourceFiles = filesForExecution(files)
    if (sourceFiles.length === 0) {
      toast.error('Cần có ít nhất một file Java có nội dung.')
      return
    }

    setRunning(true)
    setExecutionResult(null)

    try {
      if (!executorReady) {
        toast.error('Hãy chạy Local Executor và chờ trạng thái sẵn sàng trước khi làm bài.')
        connectExecutor()
        return
      }

      const result = await compileAndRun(
        sourceFiles,
        exercise.testCases.map((tc) => ({
          id: tc.id,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          timeLimit: 5,
          type: tc.type,
          testFileName: tc.testFileName,
        }))
      )

      setExecutionResult({
        compiled: result.compiled,
        errors: result.errors,
        testResults: result.testResults?.map((r) => ({
          testCaseId: r.id,
          passed: r.status === 'passed',
          actualOutput: r.actualOutput ?? '',
          status: r.status,
          executionTimeMs: r.executionTimeMs,
        })),
      })
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Không thể kết nối tới Local Executor. Hãy đảm bảo executor JAR đang chạy ở cổng 9876.'
      toast.error(message)
      connectExecutor()
    } finally {
      setRunning(false)
    }
  }, [compileAndRun, connectExecutor, executorReady, exercise, files])

  const handleSubmit = useCallback(async () => {
    if (!exercise) return
    const sourceFiles = filesForExecution(files)

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
        code: serializeSubmissionFiles(sourceFiles),
        test_results: executionResult.testResults.map((r) => ({
          test_case_id: r.testCaseId,
          actual_output: r.actualOutput ?? '',
          execution_time_ms: r.executionTimeMs ?? 0,
          status: r.status,
        })),
        anti_cheat_nullified: antiCheatNullified,
      })
      const score = response.data.score
      clearWorkspaceDraft(exercise.id, userId)
      toast.success(`Nộp bài thành công! Điểm: ${score.toFixed(1)}%`)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      const message =
        axiosErr.response?.data?.error?.message || 'Nộp bài thất bại. Vui lòng thử lại.'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }, [antiCheatNullified, exercise, executionResult, files, userId])

  const handleAntiCheatNullified = useCallback(async () => {
    if (!exercise || zeroSubmissionSentRef.current) return

    zeroSubmissionSentRef.current = true
    setAntiCheatNullified(true)

    try {
      const sourceFiles = filesForExecution(files)
      await api.post('/api/submissions', {
        exercise_id: exercise.id,
        section_id: exercise.sectionId,
        code:
          sourceFiles.length > 0
            ? serializeSubmissionFiles(sourceFiles)
            : '// Phiên làm bài bị khóa do vượt ngưỡng cảnh báo chống gian lận.',
        test_results: exercise.testCases.map((tc) => ({
          test_case_id: tc.id,
          actual_output: '',
          execution_time_ms: 0,
          status: 'failed',
        })),
        anti_cheat_nullified: true,
      })
    } catch {
      toast.error('Phiên làm bài đã bị khóa. Không thể tự động ghi nhận bài nộp 0 điểm.')
    }
  }, [exercise, files])

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
    <div className="-m-6 flex min-h-[calc(100vh-8.25rem)] flex-col bg-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/student/exercises"
            data-anti-cheat-exit="true"
            data-anti-cheat-to="/student/exercises"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary"
            aria-label="Quay lại danh sách bài tập"
          >
            ←
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">
                {exercise.title}
              </h1>
              <span className={difficultyConfig[exercise.difficulty].className}>
                {difficultyConfig[exercise.difficulty].label}
              </span>
              {exercise.isAssessment && (
                <span className="badge-yellow">Kiểm tra</span>
              )}
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {exercise.deadline
                ? `Hạn nộp: ${new Date(exercise.deadline).toLocaleString('vi-VN')}`
                : 'Không giới hạn thời gian'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleRun}
            disabled={running || filesForExecution(files).length === 0}
            className="btn-success h-10 px-4 text-sm"
          >
            {running ? <Spinner /> : <span aria-hidden="true">▶</span>}
            {running ? 'Đang chạy' : 'Chạy thử'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || filesForExecution(files).length === 0}
            className="btn-primary h-10 px-4 text-sm"
          >
            {submitting ? <Spinner /> : <span aria-hidden="true">↑</span>}
            {submitting ? 'Đang nộp' : 'Nộp bài'}
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-[360px_minmax(0,1fr)] gap-4 overflow-hidden p-4">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50">
            <button
              onClick={() => setActivePanel('description')}
              className={`px-4 py-3 text-sm font-bold transition-colors ${
                activePanel === 'description'
                  ? 'border-b-2 border-primary bg-white text-primary'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              Mô tả
            </button>
            <button
              onClick={() => setActivePanel('testcases')}
              className={`px-4 py-3 text-sm font-bold transition-colors ${
                activePanel === 'testcases'
                  ? 'border-b-2 border-primary bg-white text-primary'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              Test case ({exercise.testCases.length})
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {activePanel === 'description' ? (
              <DescriptionPanel exercise={exercise} />
            ) : (
              <TestCasesPanel
                testCases={exercise.testCases}
                executionResult={executionResult}
              />
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col gap-4 overflow-hidden">
          <div className="min-h-[420px] flex-1 overflow-hidden rounded-lg border border-slate-800 bg-[#1e1e1e] shadow-sm">
            <FileTabs
              files={files}
              activeFileId={activeFileId}
              onSelect={setActiveFileId}
              onAdd={() => {
                const nextFile = createNewSourceFile(files)
                setFiles((current) => [...current, nextFile])
                setActiveFileId(nextFile.id)
              }}
              onRemove={(fileId) => {
                setFiles((current) => {
                  if (current.length === 1) return current
                  const next = current.filter((file) => file.id !== fileId)
                  if (fileId === activeFileId) {
                    setActiveFileId(next[0]?.id ?? 'main')
                  }
                  return next
                })
              }}
            />
            <Editor
              height="calc(100% - 45px)"
              language="java"
              theme="vs-dark"
              value={files.find((file) => file.id === activeFileId)?.content ?? ''}
              onChange={(value) =>
                setFiles((current) =>
                  current.map((file) =>
                    file.id === activeFileId ? { ...file, content: value || '' } : file
                  )
                )
              }
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
                lineHeight: 22,
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

          <OutputPanel executionResult={executionResult} running={running} />
        </section>
      </div>
    </div>
  )

  if (!executorReady) {
    return (
      <ExecutorGate
        status={executorStatus}
        errorMessage={executorError?.message}
        setupInstructions={executorError?.setupInstructions}
        onRetry={connectExecutor}
      />
    )
  }

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

function FileTabs({
  files,
  activeFileId,
  onSelect,
  onAdd,
  onRemove,
}: {
  files: SourceFile[]
  activeFileId: string
  onSelect: (fileId: string) => void
  onAdd: () => void
  onRemove: (fileId: string) => void
}) {
  return (
    <div className="flex h-[45px] items-center gap-1 border-b border-slate-800 bg-slate-900 px-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {files.map((file) => (
          <div
            key={file.id}
            className={`group flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${
              activeFileId === file.id
                ? 'bg-slate-700 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <button onClick={() => onSelect(file.id)} className="h-full text-left">
              {file.name}
            </button>
            {files.length > 1 && (
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  onRemove(file.id)
                }}
                className="rounded px-1 text-slate-400 hover:bg-slate-600 hover:text-white"
                aria-label={`Xóa ${file.name}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={onAdd}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 transition hover:border-secondary hover:bg-secondary/10 hover:text-secondary"
        aria-label="Thêm file Java"
        title="Thêm file Java"
      >
        +
      </button>
    </div>
  )
}

function ExecutorGate({
  status,
  errorMessage,
  setupInstructions,
  onRetry,
}: {
  status: string
  errorMessage?: string
  setupInstructions?: string
  onRetry: () => void
}) {
  const isConnecting = status === 'connecting'
  const downloadBaseUrl = import.meta.env.BASE_URL
  const executorBundleUrl = `${downloadBaseUrl}downloads/oop-local-executor-1.0.0.zip?v=20260630-2`

  return (
    <div className="-m-6 flex min-h-[calc(100vh-8.25rem)] items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              Local Executor
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">
              Cần chạy Local Executor trước khi bắt đầu làm bài
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Hệ thống sẽ biên dịch và chạy Java trên máy cá nhân của sinh viên. Tải ZIP,
              giải nén, mở file chạy nhanh theo hệ điều hành, sau đó thử kết nối lại.
            </p>
          </div>
          <span
            className={`rounded-md px-3 py-1.5 text-xs font-bold ${
              isConnecting
                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                : 'bg-red-50 text-red-700 ring-1 ring-red-200'
            }`}
          >
            {isConnecting ? 'Đang kiểm tra' : 'Chưa sẵn sàng'}
          </span>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">Cách chạy nhanh</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Tải bản ZIP, giải nén, rồi double-click file phù hợp với hệ điều hành:
            <span className="font-semibold"> Start Local Executor.command</span> trên macOS,
            <span className="font-semibold"> Start Local Executor.bat</span> trên Windows.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Nếu macOS hỏi quyền mở file tải từ Internet, chọn Open. Nếu file không chạy,
            mở Terminal trong thư mục đã giải nén và chạy: <span className="font-mono">chmod +x "Start Local Executor.command"</span>.
          </p>
          <p className="mt-4 text-sm font-bold text-slate-800">Lệnh chạy thủ công</p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-3 text-sm text-emerald-300">
            java -jar oop-local-executor-1.0.0.jar
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            File JAR yêu cầu JDK 17+ và sẽ mở WebSocket tại ws://127.0.0.1:9876.
          </p>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">{errorMessage}</p>
            {setupInstructions && (
              <pre className="mt-2 whitespace-pre-wrap text-xs leading-5 text-red-700">
                {setupInstructions}
              </pre>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href={executorBundleUrl}
            className="btn-primary h-10 px-4 text-sm"
            download="oop-local-executor-1.0.0.zip"
          >
            Tải Executor
          </a>
          <button onClick={onRetry} className="btn-primary h-10 px-4 text-sm">
            {isConnecting ? 'Đang kiểm tra...' : 'Thử kết nối lại'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DescriptionPanel({ exercise }: { exercise: ExerciseDetail }) {
  return (
    <div className="space-y-4 select-none" data-protected-content="true">
      {exercise.oopTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {exercise.oopTags.map((tag) => (
            <span key={tag} className="bg-primary-50 text-primary text-[10px] font-extrabold px-2 py-0.5 rounded-full ring-1 ring-primary/10">
              {tag}
            </span>
          ))}
        </div>
      )}

      {exercise.deadline && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 flex items-center justify-between text-xs">
          <div>
            <p className="font-extrabold uppercase tracking-wider text-amber-700">HẠN NỘP BÀI TẬP</p>
            <p className="mt-1 font-bold text-amber-900">
              {new Date(exercise.deadline).toLocaleString('vi-VN')}
            </p>
          </div>
          <span className="text-xl">⏰</span>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
          YÊU CẦU BÀI TẬP
        </h2>
        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/30">
          <FormattedDescription text={exercise.description} />
        </div>
      </div>
    </div>
  )
}

function FormattedDescription({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-6 text-slate-700">
      {text.split('\n').map((rawLine, index) => {
        const line = rawLine.trim()
        if (!line) return <div key={index} className="h-1" />

        if (line.startsWith('# ')) {
          return (
            <h2 key={index} className="text-lg font-bold leading-7 text-slate-900">
              {line.slice(2)}
            </h2>
          )
        }

        if (line.startsWith('## ')) {
          return (
            <h3
              key={index}
              className="border-l-4 border-primary pl-3 text-sm font-bold uppercase tracking-wide text-slate-800"
            >
              {line.slice(3)}
            </h3>
          )
        }

        if (line.startsWith('- ')) {
          return (
            <div key={index} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <p>{renderInlineCode(line.slice(2))}</p>
            </div>
          )
        }

        return <p key={index}>{renderInlineCode(line)}</p>
      })}
    </div>
  )
}

function renderInlineCode(text: string) {
  return text.split(/(`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-900"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={index}>{part}</span>
  })
}

function TestCasesPanel({
  testCases,
  executionResult,
}: {
  testCases: TestCase[]
  executionResult: ExecutionResult | null
}) {
  return (
    <div className="space-y-3 select-none" data-protected-content="true">
      {testCases.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 text-center font-medium">
          Không có test case công khai.
        </div>
      ) : (
        testCases.map((tc, index) => {
          const result = executionResult?.testResults?.find((r) => r.testCaseId === tc.id)
          return (
            <div
              key={tc.id}
              className={`rounded-xl border-l-4 p-4 shadow-sm border ${
                result
                  ? result.passed
                    ? 'border-l-emerald-500 border-slate-200/80 bg-emerald-50/20'
                    : 'border-l-rose-500 border-slate-200/80 bg-rose-50/20'
                  : 'border-l-slate-400 border-slate-200 bg-slate-50/30'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Bộ Test Case {index + 1}
                </span>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-white px-2 py-0.5 text-[10px] font-extrabold text-slate-500 border border-slate-200">
                    {tc.pointValue} điểm
                  </span>
                  {result && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold ${
                        result.passed ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {result.passed ? (
                        <span className="text-emerald-500 font-bold">✓ Đạt</span>
                      ) : (
                        <span className="text-rose-500 font-bold">✗ Không đạt</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {tc.type === 'java_junit' ? (
                  <div className="rounded-lg border border-slate-100 bg-white p-2.5 font-mono text-[11px] text-slate-600">
                    📂 JUnit Test: {tc.testFileName ?? 'MyTest.java'}
                  </div>
                ) : tc.input ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đầu vào (stdin)</p>
                    <pre className="rounded-lg bg-white p-2.5 text-[11px] font-mono text-slate-700 border border-slate-100 overflow-x-auto leading-relaxed">
                      {tc.input}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-[11px] text-slate-400 italic">
                    Chương trình chạy tự sinh dữ liệu, không cần nhập stdin.
                  </div>
                )}
                {tc.type === 'stdio' && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đầu ra mong đợi</p>
                    <pre className="rounded-lg bg-white p-2.5 text-[11px] font-mono text-slate-700 border border-slate-100 overflow-x-auto leading-relaxed">
                      {tc.expectedOutput}
                    </pre>
                  </div>
                )}
                {result && !result.passed && result.actualOutput && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Đầu ra thực tế</p>
                    <pre className="rounded-lg bg-rose-50/30 p-2.5 text-[11px] font-mono text-rose-700 border border-rose-100 overflow-x-auto leading-relaxed">
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
      <div className="h-36 rounded-xl border border-slate-800 bg-slate-950 p-4 flex flex-col justify-between shadow-inner">
        <div className="flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
          <span className="w-2 h-2 rounded-full bg-rose-500/80"></span>
          <span className="w-2 h-2 rounded-full bg-amber-500/80"></span>
          <span className="w-2 h-2 rounded-full bg-emerald-500/80"></span>
          <span className="text-[9px] font-black text-slate-500 ml-2 uppercase tracking-wider">Console</span>
        </div>
        <div className="flex-1 flex items-center justify-center gap-2 text-emerald-400">
          <Spinner />
          <span className="text-xs font-mono">Đang biên dịch và thực thi chương trình...</span>
        </div>
      </div>
    )
  }

  if (!executionResult) {
    return (
      <div className="h-36 rounded-xl border border-slate-800 bg-slate-950 flex flex-col shadow-inner">
        <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-2 bg-slate-900/40">
          <span className="w-2 h-2 rounded-full bg-slate-700"></span>
          <span className="w-2 h-2 rounded-full bg-slate-700"></span>
          <span className="w-2 h-2 rounded-full bg-slate-700"></span>
          <span className="text-[9px] font-black text-slate-500 ml-2 uppercase tracking-wider">Console</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-xs font-mono text-slate-500 px-4 text-center">
          Nhấn "Chạy thử" để biên dịch và chạy kiểm tra trên máy cá nhân bằng Local Executor.
        </div>
      </div>
    )
  }

  return (
    <div className="h-44 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 flex flex-col shadow-inner">
      <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-2 bg-slate-900/40">
        <span className="w-2 h-2 rounded-full bg-rose-500/80"></span>
        <span className="w-2 h-2 rounded-full bg-amber-500/80"></span>
        <span className="w-2 h-2 rounded-full bg-emerald-500/80"></span>
        <span className="text-[9px] font-black text-slate-500 ml-2 uppercase tracking-wider">Console Output</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {!executionResult.compiled && executionResult.errors && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-rose-400">✗ Lỗi biên dịch (Compilation Error):</p>
            {executionResult.errors.map((err, i) => (
              <p key={i} className="text-xs text-rose-300/90 font-mono leading-relaxed bg-rose-950/20 px-3 py-1.5 rounded-lg border border-rose-900/30">
                Dòng {err.line}: {err.message}
              </p>
            ))}
          </div>
        )}

        {executionResult.compiled && executionResult.testResults && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-emerald-400">
              ✓ Biên dịch thành công. Kết quả chạy thử bộ test:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {executionResult.testResults.map((result, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-slate-900/60 border border-slate-800/40 p-2 rounded-lg">
                  <span
                    className={`text-sm ${result.passed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}`}
                  >
                    {result.passed ? '✓' : '✗'}
                  </span>
                  <div className="text-xs font-mono">
                    <p className="font-bold text-slate-300">Test Case {i + 1}</p>
                    <p className={`text-[10px] mt-0.5 ${
                      result.status === 'timeout'
                        ? 'text-amber-400'
                        : result.status === 'error'
                          ? 'text-rose-400'
                          : result.passed
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                    }`}>
                      {result.status === 'timeout'
                        ? 'Quá thời gian'
                        : result.status === 'error'
                          ? 'Lỗi thực thi'
                          : result.passed
                            ? 'Đạt'
                            : 'Không đạt'}
                      {result.executionTimeMs !== undefined && ` (${result.executionTimeMs}ms)`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
