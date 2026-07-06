import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

type Tab = 'description' | 'testcases' | 'history' | 'stats'

interface Exercise {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  starterCode?: string | null
  oopTags?: string | string[] | null
  oop_tags?: string[] | null
}

interface TestCase {
  id: string
  inputData?: string | null
  input_data?: string | null
  expectedOutput?: string | null
  expected_output?: string | null
  isVisible?: number | boolean
  is_visible?: number | boolean
  pointValue?: number | null
  point_value?: number | null
  timeLimitSeconds?: number | null
}

interface SubmissionRow {
  id: string
  studentId: string
  student?: {
    id: string
    username: string
    fullName?: string | null
    email?: string | null
  } | null
  sectionId: string
  section?: {
    id: string
    name: string
    semester: string
  } | null
  score: number | null
  manualScore: number | null
  effectiveScore: number
  attemptNumber: number
  submittedAt: string
}

interface SectionStat {
  sectionId: string
  sectionName: string
  semester: string
  studentCount: number
  submittedStudentCount: number
  submissionCount: number
  acceptedCount: number
  averageScore: number
  averageBestScore: number
  maxScore: number
}

interface OverviewResponse {
  exercise: Exercise
  testCases: TestCase[]
  submissions: SubmissionRow[]
  stats: SectionStat[]
}

const JAVA_TEST_MARKER = '__OOP_JAVA_TEST__'

const DIFFICULTY: Record<string, { label: string; className: string }> = {
  easy: { label: 'Dễ', className: 'badge-green' },
  medium: { label: 'Trung bình', className: 'badge-yellow' },
  hard: { label: 'Khó', className: 'badge-red' },
}

function parseTags(exercise: Exercise): string[] {
  const tags = exercise.oop_tags ?? exercise.oopTags
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const time = date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const day = date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return `${time}, ${day}`
}

function formatScore(value: number | null | undefined) {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Number.isInteger(safeValue) ? safeValue.toFixed(0) : safeValue.toFixed(1)
}

function resultBadge(score: number) {
  if (score >= 100) return { label: 'Accepted', className: 'bg-emerald-500 text-white' }
  if (score > 0) return { label: 'Finished', className: 'bg-emerald-500 text-white' }
  return { label: 'Compile Error', className: 'bg-rose-500 text-white' }
}

function isVisible(value: number | boolean | undefined) {
  return value === true || value === 1
}

function getTestCaseInput(testCase: TestCase) {
  return testCase.inputData ?? testCase.input_data ?? ''
}

function getTestCaseExpected(testCase: TestCase) {
  return testCase.expectedOutput ?? testCase.expected_output ?? ''
}

function getTestCasePoints(testCase: TestCase) {
  return testCase.pointValue ?? testCase.point_value ?? 0
}

function getJavaTestFileName(input: string) {
  if (!input.startsWith(JAVA_TEST_MARKER)) return ''
  return input.split(/\r?\n/, 2)[1]?.trim() || 'MyTest.java'
}

export function InstructorExerciseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('description')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchOverview()
  }, [id])

  async function fetchOverview() {
    if (!id) return
    setLoading(true)
    try {
      const response = await api.get<OverviewResponse>(`/api/exercises/${id}/instructor-overview`)
      setData(response.data)
    } catch {
      toast.error('Không thể tải thông tin bài tập.')
    } finally {
      setLoading(false)
    }
  }

  const filteredSubmissions = useMemo(() => {
    const rows = data?.submissions ?? []
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      const studentName = row.student?.fullName ?? row.student?.username ?? ''
      const sectionName = row.section?.name ?? ''
      return (
        row.id.toLowerCase().includes(q) ||
        studentName.toLowerCase().includes(q) ||
        sectionName.toLowerCase().includes(q)
      )
    })
  }, [data?.submissions, search])

  if (loading) return <PageLoader label="Đang tải bài tập..." />

  if (!data) {
    return (
      <div className="card flex flex-col items-center justify-center p-12 text-center">
        <ExerciseIcon className="mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm font-semibold text-slate-500">Không tìm thấy thông tin bài tập.</p>
        <button onClick={() => navigate(-1)} className="btn-secondary btn-sm mt-4">
          Quay lại
        </button>
      </div>
    )
  }

  const { exercise, testCases, stats } = data
  const tags = parseTags(exercise)
  const difficulty = DIFFICULTY[exercise.difficulty] ?? { label: exercise.difficulty, className: 'badge-gray' }
  const correctCount = new Set(
    data.submissions.filter((row) => row.effectiveScore >= 100).map((row) => row.studentId)
  ).size

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <button onClick={() => navigate(-1)} className="btn-ghost btn-sm mb-4">
            ← Quay lại
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900">{exercise.title}</h1>
            <span className={difficulty.className}>{difficulty.label}</span>
          </div>
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="badge-blue">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="grid min-w-[260px] grid-cols-2 overflow-hidden rounded-lg border border-slate-200 text-sm">
          <div className="bg-slate-50 px-4 py-2 font-semibold text-slate-500">Tổng số bài làm đúng</div>
          <div className="px-4 py-2 text-right font-bold text-primary">{correctCount}</div>
          <div className="bg-slate-50 px-4 py-2 font-semibold text-slate-500">Tổng lượt nộp</div>
          <div className="px-4 py-2 text-right font-bold text-slate-800">{data.submissions.length}</div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap gap-2" aria-label="Exercise tabs">
          <TabButton active={activeTab === 'description'} onClick={() => setActiveTab('description')}>
            Mô tả
          </TabButton>
          <TabButton active={activeTab === 'testcases'} onClick={() => setActiveTab('testcases')}>
            Test cases ({testCases.length})
          </TabButton>
          <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
            Lịch sử ({data.submissions.length})
          </TabButton>
          <TabButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')}>
            Thống kê
          </TabButton>
        </nav>
      </div>

      {activeTab === 'description' && (
        <div className="card">
          <div className="panel-header">
            <h2 className="panel-title">Đề bài</h2>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_360px]">
            <div className="prose max-w-none whitespace-pre-line text-sm leading-7 text-slate-700">
              {exercise.description}
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Mã nguồn mẫu</p>
                <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                  {exercise.starterCode || 'Bài tập này chưa có mã nguồn mẫu.'}
                </pre>
              </div>
              <Link to={`/instructor/exercises/${exercise.id}/edit`} className="btn-secondary w-full">
                Sửa đề bài
              </Link>
              <Link to={`/instructor/exercises/${exercise.id}/testcases`} className="btn-primary w-full">
                Soạn bộ test
              </Link>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'testcases' && (
        <div className="card">
          <div className="panel-header">
            <h2 className="panel-title">Chi tiết test cases</h2>
            <Link to={`/instructor/exercises/${exercise.id}/testcases`} className="btn-secondary btn-sm">
              Chỉnh sửa test
            </Link>
          </div>
          <div className="space-y-4 p-5">
            {testCases.length === 0 ? (
              <p className="text-sm font-semibold text-slate-400">Bài tập chưa có test case.</p>
            ) : (
              testCases.map((testCase, index) => {
                const input = getTestCaseInput(testCase)
                const expected = getTestCaseExpected(testCase)
                const javaFileName = getJavaTestFileName(input)
                return (
                  <div key={testCase.id} className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-800">Test case {index + 1}</h3>
                        <span className={isVisible(testCase.isVisible ?? testCase.is_visible) ? 'badge-green' : 'badge-gray'}>
                          {isVisible(testCase.isVisible ?? testCase.is_visible) ? 'Công khai' : 'Ẩn'}
                        </span>
                        <span className="badge-blue">{getTestCasePoints(testCase)} điểm</span>
                      </div>
                      {javaFileName && <span className="text-xs font-bold text-slate-400">{javaFileName}</span>}
                    </div>
                    <div className="grid gap-4 p-4 lg:grid-cols-2">
                      <CodeBlock title={javaFileName ? 'File test Java' : 'Input'} value={javaFileName ? expected : input} />
                      <CodeBlock title={javaFileName ? 'Marker' : 'Expected output'} value={javaFileName ? input : expected} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card">
          <div className="panel-header">
            <h2 className="panel-title">Danh sách các bài nộp</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input max-w-xs bg-white py-1.5 text-xs"
              placeholder="Tìm sinh viên, lớp, mã bài nộp..."
            />
          </div>
          <div className="overflow-x-auto p-5">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="table-th w-28">#</th>
                  <th className="table-th">Sinh viên</th>
                  <th className="table-th">Lớp</th>
                  <th className="table-th">Thời gian</th>
                  <th className="table-th text-right">Điểm</th>
                  <th className="table-th">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm font-semibold text-slate-400">
                      Chưa có bài nộp phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((submission) => {
                    const badge = resultBadge(submission.effectiveScore)
                    return (
                      <tr key={submission.id} className="hover:bg-slate-50">
                        <td className="table-td">
                          <Link to={`/instructor/submissions?exercise_id=${exercise.id}`} className="font-bold text-sky-600 hover:underline">
                            {submission.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="table-td">
                          <Link
                            to={`/instructor/classes/${submission.sectionId}/students/${submission.studentId}/profile`}
                            className="font-bold text-sky-600 hover:underline"
                          >
                            {submission.student?.fullName || submission.student?.username || submission.studentId}
                          </Link>
                        </td>
                        <td className="table-td">{submission.section?.name ?? submission.sectionId}</td>
                        <td className="table-td">{formatDateTime(submission.submittedAt)}</td>
                        <td className="table-td text-right font-bold">{formatScore(submission.effectiveScore)}</td>
                        <td className="table-td">
                          <span className={`rounded px-2 py-1 text-[11px] font-bold ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="card">
          <div className="panel-header">
            <h2 className="panel-title">Bảng thống kê theo lớp giảng viên dạy</h2>
          </div>
          <div className="overflow-x-auto p-5">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="table-th">Lớp</th>
                  <th className="table-th text-right">Sinh viên</th>
                  <th className="table-th text-right">Đã nộp</th>
                  <th className="table-th text-right">Lượt nộp</th>
                  <th className="table-th text-right">Accepted</th>
                  <th className="table-th text-right">TB lượt nộp</th>
                  <th className="table-th text-right">TB tốt nhất</th>
                  <th className="table-th text-right">Cao nhất</th>
                </tr>
              </thead>
              <tbody>
                {stats.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm font-semibold text-slate-400">
                      Bài tập chưa được gán vào lớp bạn phụ trách.
                    </td>
                  </tr>
                ) : (
                  stats.map((row) => (
                    <tr key={row.sectionId} className="hover:bg-slate-50">
                      <td className="table-td">
                        <Link to={`/instructor/classes/${row.sectionId}`} className="font-bold text-sky-600 hover:underline">
                          {row.sectionName}
                        </Link>
                        <span className="ml-2 text-xs text-slate-400">{row.semester}</span>
                      </td>
                      <td className="table-td text-right">{row.studentCount}</td>
                      <td className="table-td text-right">{row.submittedStudentCount}</td>
                      <td className="table-td text-right">{row.submissionCount}</td>
                      <td className="table-td text-right">{row.acceptedCount}</td>
                      <td className="table-td text-right">{formatScore(row.averageScore)}</td>
                      <td className="table-td text-right">{formatScore(row.averageBestScore)}</td>
                      <td className="table-td text-right font-bold text-primary">{formatScore(row.maxScore)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-t-lg border px-4 py-2 text-sm font-bold transition-colors ${
        active
          ? 'border-slate-200 border-b-white bg-white text-primary'
          : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

function CodeBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
        {value || 'Không có dữ liệu.'}
      </pre>
    </div>
  )
}
