import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cachedGet } from '../../lib/api'
import { PageLoader, ExerciseIcon, LeaderboardIcon, CalendarIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { useAuthStore } from '../../stores/auth.store'

interface Exercise {
  id: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  oopTags: string[]
  sectionId: string
  sectionName: string
  deadline: string | null
  week: number | null
  isAssessment: boolean
  bestScore: number | null
  attemptCount: number
  maxSubmissions: number
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue'
}

interface SectionInfo {
  id: string
  name: string
  semester: string
}

interface LeaderboardEntry {
  rank: number
  studentName: string
  studentId: string
  totalScore: number
  completedExercises: number
}

const difficultyConfig: Record<Exercise['difficulty'], { label: string; className: string }> = {
  easy: { label: 'Dễ', className: 'badge-green' },
  medium: { label: 'Trung bình', className: 'badge-yellow' },
  hard: { label: 'Khó', className: 'badge-red' },
}

const statusConfig: Record<Exercise['status'], { label: string; className: string }> = {
  not_started: { label: 'Chưa làm', className: 'badge-gray' },
  in_progress: { label: 'Đang làm', className: 'badge-yellow' },
  completed: { label: 'Đạt', className: 'badge-green' },
  overdue: { label: 'Quá hạn', className: 'badge-red' },
}

const DEFAULT_TOTAL_WEEKS = 10

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Không giới hạn'
  return new Date(deadline).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getWeekDeadline(exercises: Exercise[]): string | null {
  return exercises
    .map((exercise) => exercise.deadline)
    .filter((deadline): deadline is string => Boolean(deadline))
    .sort()[0] ?? null
}

function scoreLabel(score: number | null): string {
  return `${Math.round(score ?? 0)}/100`
}

export function StudentCourseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((state) => state.user)
  const [section, setSection] = useState<SectionInfo | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSectionAndExercises()
  }, [id])

  async function fetchSectionAndExercises() {
    setLoading(true)
    try {
      const [sectionsRes, exercisesRes] = await Promise.all([
        cachedGet('/api/students/sections'),
        cachedGet('/api/students/exercises'),
      ])

      const sections: SectionInfo[] = sectionsRes.data ?? []
      const foundSection = id ? sections.find((s) => s.id === id) : sections[0]
      setSection(foundSection ?? null)

      const allExercises = exercisesRes.data.exercises ?? []
      const sectionExercises = foundSection
        ? allExercises.filter((ex: Exercise) => ex.sectionId === foundSection.id)
        : []
      setExercises(sectionExercises)

      if (foundSection) {
        fetchLeaderboard(foundSection.id)
      }
    } catch {
      toast.error('Không thể tải bài học phần. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchLeaderboard(sectionId: string) {
    setLeaderboardLoading(true)
    try {
      const response = await cachedGet(`/api/sections/${sectionId}/leaderboard`, undefined, {
        ttlMs: 30_000,
      })
      setLeaderboard(response.data.leaderboard ?? response.data ?? [])
    } catch {
      setLeaderboard([])
    } finally {
      setLeaderboardLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải bài thực hành..." />
  }

  if (!section) {
    return (
      <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100">
        <p className="font-medium text-slate-500">
          Không tìm thấy lớp học phần hoặc bạn chưa được ghi danh.
        </p>
        <button onClick={fetchSectionAndExercises} className="btn-primary btn-sm mt-4">
          Tải lại danh sách bài tập
        </button>
      </div>
    )
  }

  const weeks = Array.from({ length: DEFAULT_TOTAL_WEEKS }, (_, i) => i + 1)
  const exercisesByWeek = new Map<number, Exercise[]>()
  const unscheduledExercises: Exercise[] = []
  weeks.forEach((week) => exercisesByWeek.set(week, []))

  exercises.forEach((exercise) => {
    if (!exercise.week || exercise.week < 1 || exercise.week > DEFAULT_TOTAL_WEEKS) {
      unscheduledExercises.push(exercise)
      return
    }
    exercisesByWeek.get(exercise.week)?.push(exercise)
  })

  const hasExercises = exercises.length > 0

  return (
    <div className="space-y-5">
      {/* Page header banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 p-6 text-white shadow-md border-b-4 border-secondary">
        {/* Subtle decorative background circle */}
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/5 translate-x-12 -translate-y-12 blur-lg"></div>
        <div className="relative z-10 space-y-2">
          <span className="inline-block rounded-full bg-secondary-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-secondary-300 ring-1 ring-secondary-500/30">
            {section.semester}
          </span>
          <h1 className="text-2xl font-black tracking-tight">{section.name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-primary-200">
            <span className="font-semibold">Giảng viên: Nguyễn Văn Tuyên</span>
            <span>•</span>
            <span>{exercises.length} bài thực hành</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {!hasExercises ? (
            <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
              <ExerciseIcon className="mb-3 h-10 w-10 text-slate-300" />
              <p className="font-semibold text-slate-600">
                Chưa có bài tập nào được giao cho lớp này.
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Vui lòng quay lại sau khi giảng viên gán bài tập thực hành.
              </p>
            </div>
          ) : (
            <>
              {unscheduledExercises.length > 0 && (
                <ExerciseWeekCard title="CHƯA XẾP TUẦN" exercises={unscheduledExercises} />
              )}

              {weeks.map((weekNum) => {
                const weekExercises = exercisesByWeek.get(weekNum) ?? []
                if (weekExercises.length === 0) return null

                return (
                  <ExerciseWeekCard
                    key={weekNum}
                    title={`TUẦN ${weekNum}`}
                    exercises={weekExercises}
                  />
                )
              })}
            </>
          )}
        </div>

        <LeaderboardPanel
          section={section}
          entries={leaderboard}
          loading={leaderboardLoading}
          currentUserUsername={user?.username ?? undefined}
          currentUserFullName={user?.fullName ?? undefined}
        />
      </div>
    </div>
  )
}

function ExerciseWeekCard({ title, exercises }: { title: string; exercises: Exercise[] }) {
  const deadline = getWeekDeadline(exercises)

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between bg-slate-50/50 border-b border-slate-100 px-5 py-4 border-l-4 border-primary">
        <span className="text-sm font-bold uppercase tracking-wider text-slate-800">{title}</span>
        {deadline && (
          <span className="text-xs font-semibold text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-full flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            Hạn nộp: {formatDeadline(deadline)}
          </span>
        )}
      </div>

      <div className="divide-y divide-slate-100 bg-white">
        {exercises.map((exercise) => (
          <Link
            key={exercise.id}
            to={`/student/exercises/${exercise.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50/50 group"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {exercise.status === 'completed' ? (
                  <span className="text-emerald-500 text-sm font-bold" title="Đã hoàn thành">✓</span>
                ) : (
                  <span className="text-slate-300 text-sm font-bold">•</span>
                )}
                <span className="truncate text-sm font-bold text-slate-700 group-hover:text-primary transition-colors">
                  {exercise.title}
                </span>
                {exercise.isAssessment && (
                  <span className="badge-yellow text-[10px] font-extrabold normal-case">
                    Kiểm tra
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-4 text-xs text-slate-400">
                <span className={difficultyConfig[exercise.difficulty].className}>
                  {difficultyConfig[exercise.difficulty].label}
                </span>
                {exercise.oopTags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {exercise.oopTags.slice(0, 3).map((tag) => (
                      <span key={tag} className="bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded text-[9px] font-bold">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-black text-slate-800">
                  {scoreLabel(exercise.bestScore)}
                </p>
                <p className="text-[10px] font-semibold text-slate-400">
                  {exercise.attemptCount}/{exercise.maxSubmissions} lượt
                </p>
              </div>
              <span className={statusConfig[exercise.status].className}>
                {statusConfig[exercise.status].label}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function LeaderboardPanel({
  section,
  entries,
  loading,
  currentUserUsername,
  currentUserFullName,
}: {
  section: SectionInfo
  entries: LeaderboardEntry[]
  loading: boolean
  currentUserUsername?: string
  currentUserFullName?: string
}) {
  const visibleEntries = entries.slice(0, 10)

  function isCurrentUser(entry: LeaderboardEntry) {
    return entry.studentId === currentUserUsername || entry.studentName === currentUserFullName
  }

  return (
    <aside className="sticky top-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="bg-gradient-to-r from-teal-600 to-cyan-500 px-5 py-4 text-white">
        <div className="flex items-center gap-2">
          <LeaderboardIcon className="h-5 w-5 text-secondary-300 animate-pulse" />
          <h2 className="text-sm font-bold uppercase tracking-wider">Bảng Xếp Hạng</h2>
        </div>
      </div>

      <div className="p-5">
        <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {section.name}
        </div>

        <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-500">Đang tải bảng xếp hạng...</p>
          ) : visibleEntries.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Chưa có dữ liệu xếp hạng.</p>
          ) : (
            visibleEntries.map((entry) => {
              const mine = isCurrentUser(entry)
              return (
                <div
                  key={`${entry.rank}-${entry.studentId}`}
                  className={`grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 py-2 px-3 my-1 text-sm rounded-lg ${
                    mine ? 'bg-primary-50 ring-1 ring-primary/10' : ''
                  }`}
                >
                  <span className="text-center text-base font-extrabold text-slate-700">
                    {entry.rank}
                  </span>
                  <span className="min-w-0 truncate font-semibold text-primary">
                    {entry.studentName}
                  </span>
                  <span className="font-extrabold text-primary">
                    {Math.round(entry.totalScore)}
                  </span>
                </div>
              )
            })
          )}
        </div>

        <Link
          to={`/student/leaderboard?section_id=${section.id}`}
          className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md border border-primary-200 text-sm font-bold text-primary transition hover:bg-primary-50"
        >
          Xem đầy đủ
        </Link>
      </div>
    </aside>
  )
}
