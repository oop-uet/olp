import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, ExerciseIcon, LeaderboardIcon, CalendarIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

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

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Không giới hạn thời gian'
  return new Date(deadline).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function StudentCourseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [section, setSection] = useState<SectionInfo | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSectionAndExercises()
  }, [id])

  async function fetchSectionAndExercises() {
    setLoading(true)
    try {
      // Fetch sections list to find current section name
      const [sectionsRes, exercisesRes] = await Promise.all([
        api.get('/api/students/sections'),
        api.get('/api/students/exercises'),
      ])

      const sections: SectionInfo[] = sectionsRes.data ?? []
      const foundSection = id ? sections.find((s) => s.id === id) : sections[0]
      if (foundSection) {
        setSection(foundSection)
      }

      // Filter exercises belonging to this section
      const allExercises = exercisesRes.data.exercises ?? []
      const sectionExercises = foundSection
        ? allExercises.filter((ex: Exercise) => ex.sectionId === foundSection.id)
        : []
      setExercises(sectionExercises)
    } catch {
      toast.error('Không thể tải bài học phần. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải bài thực hành..." />
  }

  if (!section) {
    return (
      <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100">
        <p className="text-slate-500 font-medium">Không tìm thấy lớp học phần hoặc bạn chưa được ghi danh.</p>
        <Link to="/student/exercises" className="btn-primary mt-4 btn-sm">
          Tải lại danh sách bài tập
        </Link>
      </div>
    )
  }

  // Group exercises by week lanes (1 to 15)
  const weeks = Array.from({ length: 15 }, (_, i) => i + 1)
  const exercisesByWeek = new Map<number, Exercise[]>()
  const unscheduledExercises: Exercise[] = []
  weeks.forEach((w) => exercisesByWeek.set(w, []))

  exercises.forEach((ex) => {
    if (!ex.week || ex.week < 1 || ex.week > 15) {
      unscheduledExercises.push(ex)
      return
    }
    const list = exercisesByWeek.get(ex.week) || []
    list.push(ex)
    exercisesByWeek.set(ex.week, list)
  })

  // Check if there are any assigned exercises at all
  const hasExercises = exercises.length > 0

  return (
    <div className="space-y-6">
      {/* Course Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="badge-blue font-semibold">{section.semester}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800">{section.name}</h1>
        </div>
        <div>
          <Link
            to={`/student/leaderboard?section_id=${section.id}`}
            className="btn-primary btn-sm inline-flex items-center gap-2"
          >
            <LeaderboardIcon className="h-4 w-4" />
            Xếp hạng lớp học
          </Link>
        </div>
      </div>

      {/* Main Grid: Weekly lanes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 columns: Lanes */}
        <div className="lg:col-span-2 space-y-6">
          {!hasExercises ? (
            <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
              <ExerciseIcon className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-slate-600 font-semibold">Chưa có bài tập nào được giao cho lớp này.</p>
              <p className="text-sm text-slate-400 mt-1">Vui lòng quay lại sau khi giảng viên gán bài tập thực hành.</p>
            </div>
          ) : (
            <>
              {unscheduledExercises.length > 0 && (
                <ExerciseWeekCard
                  title="CHƯA XẾP TUẦN"
                  exercises={unscheduledExercises}
                />
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

        {/* Right 1 column: Statistics & Leaderboard widget */}
        <div className="space-y-6">
          {/* Summary stats card */}
          <div className="card border border-slate-100 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider pb-3 border-b border-slate-100">
              Tổng quan
            </h2>
            <div className="py-4 space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Bài tập thực hành:</span>
                <span className="font-semibold text-slate-800">{exercises.length}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Bài đã làm:</span>
                <span className="font-semibold text-emerald-600">
                  {exercises.filter((ex) => ex.bestScore !== null).length}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Hoàn thành đạt (100%):</span>
                <span className="font-semibold text-primary">
                  {exercises.filter((ex) => ex.bestScore === 100).length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExerciseWeekCard({
  title,
  exercises,
}: {
  title: string
  exercises: Exercise[]
}) {
  return (
    <div className="card p-0 border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="bg-slate-50/80 border-b border-slate-100 px-5 py-3.5 flex items-center justify-between border-l-4 border-teal-600">
        <span className="text-sm font-bold text-slate-700 tracking-wide uppercase">
          {title}
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {exercises.map((ex) => (
          <div
            key={ex.id}
            className="p-5 hover:bg-slate-50/40 transition-colors duration-150 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          >
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/student/exercises/${ex.id}`}
                  className="text-base font-semibold text-slate-800 hover:text-primary hover:underline truncate"
                >
                  {ex.title}
                </Link>
                {ex.isAssessment && (
                  <span className="badge-yellow text-xs font-semibold">Kiểm tra</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {formatDeadline(ex.deadline)}
                </span>
                <span className="flex items-center gap-1 font-medium">
                  Độ khó:
                  <span className={difficultyConfig[ex.difficulty].className}>
                    {difficultyConfig[ex.difficulty].label}
                  </span>
                </span>
              </div>

              {ex.oopTags && ex.oopTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {ex.oopTags.map((tag) => (
                    <span key={tag} className="badge-gray text-[10px]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                {ex.bestScore !== null && (
                  <span className="text-sm font-bold text-slate-700">
                    {ex.bestScore.toFixed(1)}%
                  </span>
                )}
                <span className={statusConfig[ex.status].className}>
                  {statusConfig[ex.status].label}
                </span>
              </div>

              <div className="text-xs text-slate-400">
                Lần nộp: <span className="font-semibold text-slate-600">{ex.attemptCount}</span>/
                {ex.maxSubmissions}
              </div>

              <Link
                to={`/student/exercises/${ex.id}`}
                className="btn-secondary btn-xs inline-flex items-center"
              >
                Vào làm bài →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
