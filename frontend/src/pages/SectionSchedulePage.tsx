import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { PageLoader, ExerciseIcon } from '../components/ui'
import { toast } from '../stores/toast.store'
import { useAuthStore } from '../stores/auth.store'

// ─── Types ───────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'

interface ScheduleSection {
  id: string
  name: string
  semester: string
}

interface ScheduleExercise {
  assignmentId: string
  exerciseId: string
  title: string
  difficulty: Difficulty
  oopTags: string[]
  isAssessment: boolean
  week: number | null
  deadline: string | null
}

interface ScheduleWeek {
  week: number
  deadline: string | null
  exercises: ScheduleExercise[]
}

interface PoolExercise {
  id: string
  title: string
  difficulty: Difficulty
  oopTags: string[]
}

interface ScheduleData {
  section: ScheduleSection
  weeks: ScheduleWeek[]
  unscheduled: ScheduleExercise[]
  pool: PoolExercise[]
}

const DEFAULT_TOTAL_WEEKS = 15

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DIFFICULTY_BADGE: Record<Difficulty, { className: string; label: string }> = {
  easy: { className: 'badge-green', label: 'Dễ' },
  medium: { className: 'badge-yellow', label: 'Trung bình' },
  hard: { className: 'badge-red', label: 'Khó' },
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const badge =
    DIFFICULTY_BADGE[difficulty as Difficulty] ?? { className: 'badge-gray', label: difficulty }
  return <span className={badge.className}>{badge.label}</span>
}

/** Convert a stored ISO date into a `YYYY-MM-DDTHH:mm` value for datetime-local. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Convert a datetime-local input value back into an ISO string (or null when empty). */
function localInputToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function addDaysLocalInput(value: string, days: number): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return isoToLocalInput(date.toISOString())
}

function fillCascadingDeadlineInputs(inputs: Record<number, string>, weekCount: number) {
  const next = { ...inputs }
  for (let week = 2; week <= weekCount; week += 1) {
    if (!next[week] && next[week - 1]) {
      next[week] = addDaysLocalInput(next[week - 1], 7)
    }
  }
  return next
}

const DRAG_MIME = 'text/plain'

// ─── Component ───────────────────────────────────────────────────────────────

export function SectionSchedulePage() {
  const { id } = useParams<{ id: string }>()
  const role = useAuthStore((s) => s.user?.role)
  const base = role === 'admin' ? '/api/admin' : '/api/instructor'
  const backLink = role === 'admin' ? `/admin/sections/${id}` : `/instructor/classes/${id}`

  const [data, setData] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  // Local copy of deadline inputs keyed by week so users can edit before saving.
  const [deadlineInputs, setDeadlineInputs] = useState<Record<number, string>>({})
  const [savingWeek, setSavingWeek] = useState<number | null>(null)
  const [dropWeek, setDropWeek] = useState<number | 'pool' | null>(null)
  const [visibleWeekCount, setVisibleWeekCount] = useState(DEFAULT_TOTAL_WEEKS)
  const [selectedWeek, setSelectedWeek] = useState(1)

  const fetchSchedule = useCallback(async () => {
    if (!id) return
    try {
      const response = await api.get<ScheduleData>(`${base}/sections/${id}/schedule`)
      setData(response.data)
      const inputs: Record<number, string> = {}
      for (const w of response.data.weeks) {
        inputs[w.week] = isoToLocalInput(w.deadline)
      }
      const highestBackendWeek = Math.max(0, ...response.data.weeks.map((w) => w.week))
      const savedWeekCount = Number(localStorage.getItem(getWeekCountKey(response.data.section.id)))
      const weekCount = Math.max(DEFAULT_TOTAL_WEEKS, highestBackendWeek, Number.isFinite(savedWeekCount) ? savedWeekCount : 0)
      setDeadlineInputs(fillCascadingDeadlineInputs(inputs, weekCount))
      setVisibleWeekCount(weekCount)
      setSelectedWeek((current) => Math.min(Math.max(current, 1), weekCount))
    } catch {
      toast.error('Không thể tải lịch phân bài. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [id, base])

  useEffect(() => {
    fetchSchedule()
  }, [fetchSchedule])

  // ─── Actions ─────────────────────────────────────────────────────────────

  async function assignExercise(exerciseId: string, week: number) {
    if (!id) return
    try {
      await api.post(`${base}/sections/${id}/schedule/assign`, {
        exercise_id: exerciseId,
        week,
      })
      toast.success(`Đã xếp bài tập vào tuần ${week}.`)
      await fetchSchedule()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể xếp bài tập.')
    }
  }

  async function unassignExercise(exerciseId: string) {
    if (!id) return
    try {
      await api.post(`${base}/sections/${id}/schedule/unassign`, {
        exercise_id: exerciseId,
      })
      toast.success('Đã gỡ bài tập khỏi lịch.')
      await fetchSchedule()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể gỡ bài tập.')
    }
  }

  async function saveDeadline(week: number) {
    if (!id) return
    setSavingWeek(week)
    try {
      const iso = localInputToIso(deadlineInputs[week] ?? '')
      await api.put(`${base}/sections/${id}/schedule/deadline`, {
        week,
        deadline: iso,
      })
      toast.success(`Đã lưu hạn nộp tuần ${week}.`)
      await fetchSchedule()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể lưu hạn nộp.')
    } finally {
      setSavingWeek(null)
    }
  }

  function addWeek() {
    if (!data) return
    const nextCount = visibleWeekCount + 1
    setVisibleWeekCount(nextCount)
    setSelectedWeek(nextCount)
    setDeadlineInputs((prev) => ({
      ...prev,
      [nextCount]: prev[nextCount] || addDaysLocalInput(prev[nextCount - 1] ?? '', 7),
    }))
    localStorage.setItem(getWeekCountKey(data.section.id), String(nextCount))
    toast.success(`Đã thêm tuần ${nextCount}.`)
  }

  function removeWeek(week: number) {
    if (!data || week <= DEFAULT_TOTAL_WEEKS) return
    const weekHasExercises = data.weeks.some((w) => w.week === week && w.exercises.length > 0)
    if (weekHasExercises) {
      toast.error('Không thể xóa tuần đang có bài tập. Hãy kéo bài về kho hoặc sang tuần khác trước.')
      return
    }
    const nextCount = Math.max(DEFAULT_TOTAL_WEEKS, visibleWeekCount - 1)
    setVisibleWeekCount(nextCount)
    setSelectedWeek((current) => Math.min(current, nextCount))
    localStorage.setItem(getWeekCountKey(data.section.id), String(nextCount))
    toast.success(`Đã xóa tuần ${week}.`)
  }

  // ─── Drag & drop handlers ──────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, exerciseId: string) {
    e.dataTransfer.setData(DRAG_MIME, exerciseId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDropOnWeek(e: React.DragEvent, week: number) {
    e.preventDefault()
    setDropWeek(null)
    const exerciseId = e.dataTransfer.getData(DRAG_MIME)
    if (exerciseId) {
      void assignExercise(exerciseId, week)
    }
  }

  function handleDropOnPool(e: React.DragEvent) {
    e.preventDefault()
    setDropWeek(null)
    const exerciseId = e.dataTransfer.getData(DRAG_MIME)
    if (exerciseId) {
      void unassignExercise(exerciseId)
    }
  }

  function allowDrop(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  // ─── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return <PageLoader label="Đang tải lịch phân bài..." />
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Link to={backLink} className="inline-flex text-sm font-medium text-primary hover:text-primary-700">
          ← Quay lại lớp
        </Link>
        <div className="card flex flex-col items-center justify-center border-dashed p-12 text-center">
          <p className="text-gray-500">Không tìm thấy lịch phân bài.</p>
        </div>
      </div>
    )
  }

  const { section, weeks, unscheduled, pool } = data

  // Ensure configured weeks are present even if backend omits empty ones.
  const weekMap = new Map<number, ScheduleWeek>()
  for (const w of weeks) weekMap.set(w.week, w)
  const allWeeks: ScheduleWeek[] = Array.from({ length: visibleWeekCount }, (_, i) => {
    const n = i + 1
    return weekMap.get(n) ?? { week: n, deadline: null, exercises: [] }
  })

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to={backLink}
        className="inline-flex text-sm font-medium text-primary hover:text-primary-700"
      >
        ← Quay lại lớp
      </Link>

      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
          <ExerciseIcon className="h-6 w-6" />
        </span>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-800">Phân bài theo tuần</h1>
            <span className="badge-blue">{section.semester}</span>
          </div>
          <p className="text-sm text-gray-500">
            Lớp: <span className="font-medium text-gray-700">{section.name}</span>
          </p>
        </div>
      </div>

      {/* Split layout */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* LEFT: weeks */}
        <div className="space-y-4 lg:w-3/5 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-2">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Các tuần học</h2>
              <p className="mt-1 text-xs text-slate-500">
                Chọn tuần rồi bấm dấu + ở kho bài tập, hoặc kéo thả bài tập giữa kho và các tuần.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-blue">Tuần đang chọn: {selectedWeek}</span>
              <button onClick={addWeek} className="btn-primary btn-sm">
                Thêm tuần
              </button>
            </div>
          </div>

          {/* Unscheduled panel */}
          {unscheduled.length > 0 && (
            <div className="card border-amber-200 bg-amber-50/40 p-0">
              <div className="border-b border-amber-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-amber-800">
                  Chưa xếp tuần ({unscheduled.length})
                </h2>
              </div>
              <div className="space-y-2 p-4">
                {unscheduled.map((ex) => (
                  <div
                    key={ex.assignmentId}
                    draggable
                    onDragStart={(e) => handleDragStart(e, ex.exerciseId)}
                    className="flex cursor-grab items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 active:cursor-grabbing"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-gray-800">{ex.title}</span>
                      <DifficultyBadge difficulty={ex.difficulty} />
                      {ex.isAssessment && <span className="badge-blue">Đánh giá</span>}
                    </div>
                    <button
                      onClick={() => unassignExercise(ex.exerciseId)}
                      className="flex-shrink-0 text-sm font-medium text-danger-600 hover:text-danger-700"
                    >
                      Gỡ
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Week panels */}
          {allWeeks.map((w) => {
            const isOver = dropWeek === w.week
            return (
              <div
                key={w.week}
                onDragOver={allowDrop}
                onDragEnter={() => setDropWeek(w.week)}
                onDragLeave={(e) => {
                  // Only clear if leaving the panel (not entering a child).
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropWeek((cur) => (cur === w.week ? null : cur))
                  }
                }}
                onDrop={(e) => handleDropOnWeek(e, w.week)}
                className={`card p-0 transition-colors ${
                  isOver ? 'ring-2 ring-primary ring-offset-1' : ''
                } ${selectedWeek === w.week ? 'border-primary ring-2 ring-primary/30' : ''}`}
              >
                {/* Week header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedWeek(w.week)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                      selectedWeek === w.week
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-700'
                    }`}
                    aria-pressed={selectedWeek === w.week}
                  >
                    TUẦN {w.week}
                  </button>
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      value={deadlineInputs[w.week] ?? ''}
                      onChange={(e) =>
                        setDeadlineInputs((prev) => ({ ...prev, [w.week]: e.target.value }))
                      }
                      className="input h-9 w-auto py-1 text-sm"
                      aria-label={`Hạn nộp tuần ${w.week}`}
                    />
                    <button
                      onClick={() => saveDeadline(w.week)}
                      disabled={savingWeek === w.week}
                      className="btn-secondary btn-sm"
                    >
                      {savingWeek === w.week ? 'Đang lưu...' : 'Lưu'}
                    </button>
                    {w.week > DEFAULT_TOTAL_WEEKS && (
                      <button
                        onClick={() => removeWeek(w.week)}
                        className="btn-danger btn-sm"
                      >
                        Xóa tuần
                      </button>
                    )}
                  </div>
                </div>

                {/* Week body */}
                <div className="space-y-2 p-4">
                  {w.exercises.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
                      Thả bài tập vào đây
                    </p>
                  ) : (
                    w.exercises.map((ex) => (
                      <div
                        key={ex.assignmentId}
                        draggable
                        onDragStart={(e) => handleDragStart(e, ex.exerciseId)}
                        className="flex cursor-grab items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 active:cursor-grabbing"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-gray-800">{ex.title}</span>
                          <DifficultyBadge difficulty={ex.difficulty} />
                          {ex.isAssessment && <span className="badge-blue">Đánh giá</span>}
                        </div>
                        <button
                          onClick={() => unassignExercise(ex.exerciseId)}
                          className="flex-shrink-0 text-sm font-medium text-danger-600 hover:text-danger-700"
                        >
                          Gỡ
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* RIGHT: pool */}
        <div className="lg:sticky lg:top-4 lg:w-2/5">
          <div
            onDragOver={allowDrop}
            onDragEnter={() => setDropWeek('pool')}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropWeek((cur) => (cur === 'pool' ? null : cur))
              }
            }}
            onDrop={handleDropOnPool}
            className={`card p-0 transition-colors ${
              dropWeek === 'pool' ? 'ring-2 ring-primary ring-offset-1' : ''
            }`}
          >
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
              <ExerciseIcon className="h-5 w-5 text-gray-500" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-700">
                  Kho bài tập hệ thống ({pool.length})
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">Bấm + để thêm vào tuần {selectedWeek}</p>
              </div>
            </div>
            <div className="space-y-2 p-4 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
              {pool.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  Không còn bài tập nào trong kho.
                </p>
              ) : (
                pool.map((ex) => (
                  <div
                    key={ex.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, ex.id)}
                    className="card-hover cursor-grab space-y-2 rounded-lg border border-gray-200 bg-white p-3 active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <button
                          type="button"
                          onClick={() => assignExercise(ex.id, selectedWeek)}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal-600 text-base font-bold leading-none text-white shadow-sm transition-colors hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                          aria-label={`Thêm ${ex.title} vào tuần ${selectedWeek}`}
                        >
                          +
                        </button>
                        <span className="min-w-0 font-medium text-gray-800">{ex.title}</span>
                      </div>
                      <DifficultyBadge difficulty={ex.difficulty} />
                    </div>
                    {ex.oopTags && ex.oopTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ex.oopTags.map((tag) => (
                          <span key={tag} className="badge-gray">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getWeekCountKey(sectionId: string) {
  return `oop-section-week-count:${sectionId}`
}
