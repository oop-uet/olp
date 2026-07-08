import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName, formatSemesterDisplayName } from '../../utils/semester'
import { ExerciseMarkdownContent } from '../../components/exercise/ExerciseDescriptionEditor'

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
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <button onClick={() => navigate(-1)} className="btn-ghost btn-sm">
              ← Quay lại
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary">
                <ExerciseIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{exercise.title}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={difficulty.className}>{difficulty.label}</span>
                  <span className="text-xs font-semibold text-slate-400">{testCases.length} test case</span>
                  <span className="text-xs font-semibold text-slate-400">{data.submissions.length} lượt nộp</span>
                </div>
              </div>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
            <StatTile label="Bài làm đúng" value={correctCount} />
            <StatTile label="Tổng lượt nộp" value={data.submissions.length} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
        <nav className="flex flex-wrap gap-1" aria-label="Exercise tabs">
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
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader title="Đề bài" />
          <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <ExerciseMarkdownContent value={exercise.description} />
            <aside className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Mã nguồn mẫu</p>
                <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
                  {exercise.starterCode || 'Bài tập này chưa có mã nguồn mẫu.'}
                </pre>
              </div>
              <Link to={`/instructor/exercises/${exercise.id}/edit`} className="btn-secondary w-full">
                Sửa đề bài
              </Link>
              <Link to={`/instructor/exercises/${exercise.id}/testcases`} className="btn-primary w-full">
                Soạn bộ test
              </Link>
            </aside>
          </div>
        </div>
      )}

      {activeTab === 'testcases' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Chi tiết test cases"
            action={
              <Link to={`/instructor/exercises/${exercise.id}/testcases`} className="btn-secondary btn-sm">
                Chỉnh sửa test
              </Link>
            }
          />
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
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Danh sách các bài nộp"
            action={
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input max-w-xs py-1.5 text-xs"
              placeholder="Tìm sinh viên, lớp, mã bài nộp..."
            />
            }
          />
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
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader title="Bảng thống kê theo lớp giảng viên dạy" />
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
                          {formatSectionDisplayName(row.sectionName)}
                        </Link>
                        <span className="ml-2 text-xs text-slate-400">{formatSemesterDisplayName(row.semester)}</span>
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

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
    </div>
  )
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h2>
      {action}
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
      className={`border-b-2 px-4 py-3 text-sm font-bold transition-colors active:scale-[0.98] ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800'
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
