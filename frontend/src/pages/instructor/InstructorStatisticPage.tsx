import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface SectionOption {
  id: string
  name: string
  semester: string
}

interface ExerciseStat {
  exerciseId: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  attemptedCount: number
  completedCount: number
  averageScore: number
}

interface StudentStat {
  userId: string
  studentId: string
  username: string
  fullName: string
  email: string
  attemptedExercises: number
  completedExercises: number
  attemptCount: number
  totalScore: number
  totalPossible: number
  completionPercent: number
  rank: number
}

interface StatsReport {
  totalStudents: number
  exercises: ExerciseStat[]
  students: StudentStat[]
}

const DIFFICULTY_BADGE: Record<string, { className: string; label: string }> = {
  easy: { className: 'badge-green', label: 'Dễ' },
  medium: { className: 'badge-yellow', label: 'Trung bình' },
  hard: { className: 'badge-red', label: 'Khó' },
}

function getDifficultyBadge(difficulty: string) {
  return DIFFICULTY_BADGE[difficulty] ?? { className: 'badge-gray', label: difficulty }
}

function downloadCsv(fileName: string, rows: StudentStat[]) {
  const header = ['STT', 'MSSV', 'Sinh viên', 'Email', 'Tỉ lệ hoàn thành', 'Điểm', 'Tổng điểm', 'Lượt nộp']
  const body = rows.map((student, index) => [
    index + 1,
    student.studentId,
    student.fullName,
    student.email,
    student.completionPercent,
    student.totalScore,
    student.totalPossible,
    student.attemptCount,
  ])
  const csv = [header, ...body]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function InstructorStatisticPage() {
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [loadingSections, setLoadingSections] = useState(true)
  const [stats, setStats] = useState<StatsReport | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetchSections()
  }, [])

  useEffect(() => {
    if (selectedSectionId) {
      fetchStats(selectedSectionId)
    } else {
      setStats(null)
    }
  }, [selectedSectionId])

  async function fetchSections() {
    try {
      setLoadingSections(true)
      const response = await api.get('/api/instructor/sections')
      const list: SectionOption[] = response.data ?? []
      setSections(list)
      if (list.length > 0) setSelectedSectionId(list[0].id)
    } catch {
      toast.error('Không thể tải danh sách lớp học.')
    } finally {
      setLoadingSections(false)
    }
  }

  async function fetchStats(sectionId: string) {
    setLoadingStats(true)
    try {
      const response = await api.get(`/api/instructor/sections/${sectionId}/stats`)
      setStats({
        totalStudents: response.data.totalStudents ?? 0,
        exercises: response.data.exercises ?? [],
        students: response.data.students ?? [],
      })
    } catch {
      toast.error('Không thể tải báo cáo thống kê.')
    } finally {
      setLoadingStats(false)
    }
  }

  const selectedSection = sections.find((section) => section.id === selectedSectionId)
  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const list = stats?.students ?? []
    if (!normalized) return list
    return list.filter((student) =>
      [student.studentId, student.username, student.fullName, student.email]
        .some((value) => value.toLowerCase().includes(normalized))
    )
  }, [query, stats])

  const averageCompletion = stats?.students.length
    ? stats.students.reduce((sum, student) => sum + student.completionPercent, 0) / stats.students.length
    : 0
  const submittedStudents = stats?.students.filter((student) => student.attemptCount > 0).length ?? 0

  if (loadingSections) {
    return <PageLoader label="Đang tải danh sách lớp học..." />
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5 rounded border-b border-slate-100 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
        <Link to="/instructor/classes" className="text-primary hover:underline">Trang chủ</Link>
        <span>/</span>
        <span className="text-slate-400">Thống kê</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-primary-800 to-primary p-5 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary-100">Bảng thống kê</p>
            <h1 className="mt-1 text-2xl font-black">Theo dõi tiến độ lớp học</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSectionId}
              onChange={(event) => setSelectedSectionId(event.target.value)}
              className="h-10 rounded-md border border-white/20 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm"
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name} ({section.semester})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => stats && downloadCsv(`thong-ke-${selectedSection?.name ?? 'lop'}.csv`, filteredStudents)}
              disabled={!stats || filteredStudents.length === 0}
              className="h-10 rounded-md bg-rose-500 px-4 text-sm font-bold text-white transition hover:bg-rose-600 disabled:opacity-50"
            >
              Xuất CSV
            </button>
          </div>
        </div>

        {loadingStats ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm font-semibold text-slate-400">
            <Spinner /> Đang tổng hợp số liệu...
          </div>
        ) : !stats ? (
          <div className="p-12 text-center text-sm font-medium text-slate-400">
            Không tìm thấy dữ liệu thống kê cho lớp này.
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard label="Sinh viên" value={stats.totalStudents.toString()} />
              <MetricCard label="Bài tập đã gán" value={stats.exercises.length.toString()} />
              <MetricCard label="Đã có bài nộp" value={`${submittedStudents}/${stats.totalStudents}`} />
              <MetricCard label="TB hoàn thành" value={`${averageCompletion.toFixed(1)}%`} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">
                    Danh sách sinh viên
                  </h2>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                    Tìm kiếm:
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="h-8 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-primary"
                    />
                  </label>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-300 text-xs font-black uppercase text-slate-700">
                        <th className="px-4 py-3 w-14">#</th>
                        <th className="px-4 py-3 w-36">MSSV</th>
                        <th className="px-4 py-3">Sinh viên</th>
                        <th className="px-4 py-3 text-center w-40">Tỉ lệ hoàn thành</th>
                        <th className="px-4 py-3 text-center w-36">Điểm SV/Tổng</th>
                        <th className="px-4 py-3 text-center w-28">Lượt nộp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStudents.map((student, index) => (
                        <tr key={student.userId} className="transition hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-500">{index + 1}</td>
                          <td className="px-4 py-3 font-bold text-slate-700">{student.studentId}</td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/instructor/classes/${selectedSectionId}/students/${student.userId}/profile`}
                              className="font-bold text-primary hover:underline"
                            >
                              {student.fullName}
                            </Link>
                            <p className="mt-0.5 text-xs text-slate-400">{student.email}</p>
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-700">
                            {student.completionPercent.toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-primary">
                            {student.totalScore.toFixed(0)}/{student.totalPossible}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-600">
                            {student.attemptCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <ExerciseSummary exercises={stats.exercises} totalStudents={stats.totalStudents} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
    </div>
  )
}

function ExerciseSummary({ exercises, totalStudents }: { exercises: ExerciseStat[]; totalStudents: number }) {
  return (
    <aside className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-gradient-to-r from-primary-800 to-primary px-4 py-3 text-white">
        <h2 className="text-sm font-black uppercase tracking-wide">Theo bài tập</h2>
      </div>
      <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
        {exercises.length === 0 ? (
          <p className="p-5 text-center text-sm text-slate-400">Chưa có bài tập.</p>
        ) : (
          exercises.map((exercise) => {
            const badge = getDifficultyBadge(exercise.difficulty)
            const rate = totalStudents > 0 ? (exercise.completedCount / totalStudents) * 100 : 0
            return (
              <div key={exercise.exerciseId} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800">{exercise.title}</p>
                    <span className={badge.className}>{badge.label}</span>
                  </div>
                  <p className="text-right text-sm font-black text-primary">{exercise.averageScore.toFixed(1)}</p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, rate)}%` }} />
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {exercise.completedCount}/{totalStudents} hoàn thành, {exercise.attemptedCount} đã nộp
                </p>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
