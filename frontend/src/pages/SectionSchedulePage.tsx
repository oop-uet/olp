import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { PageLoader, ExerciseIcon } from '../components/ui'
import { toast } from '../stores/toast.store'
import { useAuthStore } from '../stores/auth.store'
import { formatSectionDisplayName, formatSemesterDisplayName } from '../utils/semester'

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
  creatorUsername: string | null
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
  creatorUsername: string | null
  isLibrary: boolean
}

interface ScheduleData {
  section: ScheduleSection
  weeks: ScheduleWeek[]
  unscheduled: ScheduleExercise[]
  pool: PoolExercise[]
  otherPool: PoolExercise[]
}

const DEFAULT_TOTAL_WEEKS = 10

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

function CreatorBadge({ username }: { username?: string | null }) {
  if (!username) return null
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
      @{username}
    </span>
  )
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

function extractWeekFromTitle(title: string): number | null {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const match = normalized.match(/\btuan\s*(\d{1,2})\b/)
  if (!match) return null
  const week = Number(match[1])
  return Number.isInteger(week) && week > 0 ? week : null
}

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
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [poolTab, setPoolTab] = useState<'system' | 'other'>('system')

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

  async function autoAssignExercisesByTitle() {
    if (!id || !data || autoAssigning) return

    const candidates = [
      ...data.pool.map((exercise) => ({
        exerciseId: exercise.id,
        title: exercise.title,
      })),
      ...(data.otherPool ?? []).map((exercise) => ({
        exerciseId: exercise.id,
        title: exercise.title,
      })),
      ...data.unscheduled.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        title: exercise.title,
      })),
    ]
    const assignments = candidates
      .map((exercise) => ({
        ...exercise,
        week: extractWeekFromTitle(exercise.title),
      }))
      .filter((exercise): exercise is { exerciseId: string; title: string; week: number } => exercise.week !== null)

    if (assignments.length === 0) {
      toast.error('Không tìm thấy bài tập nào có tên chứa "Tuần N" để gán tự động.')
      return
    }

    const maxMatchedWeek = Math.max(...assignments.map((exercise) => exercise.week))
    if (maxMatchedWeek > visibleWeekCount && data) {
      setVisibleWeekCount(maxMatchedWeek)
      localStorage.setItem(getWeekCountKey(data.section.id), String(maxMatchedWeek))
      setDeadlineInputs((prev) => fillCascadingDeadlineInputs(prev, maxMatchedWeek))
    }

    setAutoAssigning(true)
    let successCount = 0
    let failedCount = 0
    for (const assignment of assignments) {
      try {
        await api.post(`${base}/sections/${id}/schedule/assign`, {
          exercise_id: assignment.exerciseId,
          week: assignment.week,
        })
        successCount += 1
      } catch {
        failedCount += 1
      }
    }

    if (successCount > 0) {
      toast.success(`Đã tự động gán ${successCount} bài tập theo tên tuần.`)
    }
    if (failedCount > 0) {
      toast.error(`${failedCount} bài tập chưa gán được. Vui lòng thử lại hoặc gán thủ công.`)
    }
    setAutoAssigning(false)
    await fetchSchedule()
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

  const { section, weeks, unscheduled, pool, otherPool = [] } = data
  const activePool = poolTab === 'system' ? pool : otherPool
  const activePoolTitle = poolTab === 'system' ? 'Kho bài tập hệ thống' : 'Bài tập khác'
  const activePoolEmpty = poolTab === 'system'
    ? 'Không còn bài tập nào trong kho.'
    : 'Không còn bài tập riêng nào để chọn.'

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
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-800 text-lg shadow-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <ExerciseIcon className="h-5 w-5" />
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="uppercase text-slate-800 text-[17px] font-bold">Phân bài theo tuần</span>
            <span className="badge-blue text-xs font-bold py-0.5 px-2.5 rounded-full">
              {formatSemesterDisplayName(section.semester, true)}
            </span>
          </div>
        </div>
        <p className="text-xs font-semibold text-slate-500">
          Lớp: <span className="text-primary font-bold">{formatSectionDisplayName(section.name)}</span>
        </p>
      </div>

      {/* Split layout */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* LEFT: weeks */}
        <div className="space-y-4 lg:w-3/5 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-2">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Các tuần học</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-blue">Tuần đang chọn: {selectedWeek}</span>
              <button
                type="button"
                onClick={autoAssignExercisesByTitle}
                disabled={autoAssigning}
                className="btn-secondary btn-sm"
              >
                {autoAssigning ? 'Đang gán...' : 'Gán tự động'}
              </button>
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
                      <CreatorBadge username={ex.creatorUsername} />
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
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-primary-50 hover:text-primary'
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
                    <p className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/30 py-5 text-center text-[11px] font-bold text-slate-400 hover:bg-slate-50 hover:border-primary/30 transition-all cursor-pointer">
                      📥 Thả bài tập vào đây
                    </p>
                  ) : (
                    w.exercises.map((ex) => (
                      <div
                        key={ex.assignmentId}
                        draggable
                        onDragStart={(e) => handleDragStart(e, ex.exerciseId)}
                        className="flex cursor-grab items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 shadow-sm hover:shadow hover:border-slate-300 transition-all active:cursor-grabbing group relative"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="text-slate-300 font-mono text-[10px] select-none">☰</span>
                          <span className="truncate font-bold text-slate-700 text-xs">{ex.title}</span>
                          <DifficultyBadge difficulty={ex.difficulty} />
                          <CreatorBadge username={ex.creatorUsername} />
                          {ex.isAssessment && <span className="badge-blue text-[9px] font-extrabold normal-case">Đánh giá</span>}
                        </div>
                        <button
                          onClick={() => unassignExercise(ex.exerciseId)}
                          className="text-[10px] font-bold text-rose-500 bg-rose-50 hover:bg-rose-100/60 px-2.5 py-1 rounded-md transition-all flex-shrink-0"
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
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-gray-700">
                  {activePoolTitle} ({activePool.length})
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">Bấm + để thêm vào tuần {selectedWeek}</p>
              </div>
            </div>
            <div className="flex gap-2 border-b border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setPoolTab('system')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  poolTab === 'system'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary'
                }`}
              >
                Hệ thống ({pool.length})
              </button>
              <button
                type="button"
                onClick={() => setPoolTab('other')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  poolTab === 'other'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary'
                }`}
              >
                Bài tập khác ({otherPool.length})
              </button>
            </div>
            <div className="space-y-2 p-4 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
              {activePool.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  {activePoolEmpty}
                </p>
              ) : (
                activePool.map((ex) => (
                  <div
                    key={ex.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, ex.id)}
                    className="card-hover cursor-grab space-y-2.5 rounded-xl border border-slate-200/80 bg-white p-4 active:cursor-grabbing hover:border-primary/30 relative group transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <button
                          type="button"
                          onClick={() => assignExercise(ex.id, selectedWeek)}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-black leading-none text-white shadow-sm transition-all hover:bg-primary-700 active:scale-95 focus:outline-none"
                          aria-label={`Thêm ${ex.title} vào tuần ${selectedWeek}`}
                        >
                          +
                        </button>
                        <div>
                          <span className="block font-bold text-slate-700 text-xs leading-snug group-hover:text-primary transition-colors">
                            {ex.title}
                          </span>
                          <CreatorBadge username={ex.creatorUsername} />
                        </div>
                      </div>
                      <DifficultyBadge difficulty={ex.difficulty} />
                    </div>
                    {ex.oopTags && ex.oopTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-8">
                        {ex.oopTags.map((tag) => (
                          <span key={tag} className="tag">
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
