import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, cachedGet } from '../../lib/api'
import { PageLoader, ExerciseIcon } from '../ui'
import { toast } from '../../stores/toast.store'

interface LibraryExercise {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  oop_tags: string[]
}

interface Section {
  id: string
  name: string
  semester: string
}

const DIFFICULTY_BADGE: Record<string, { className: string; label: string }> = {
  easy: { className: 'badge-green', label: 'Dễ' },
  medium: { className: 'badge-yellow', label: 'Trung bình' },
  hard: { className: 'badge-red', label: 'Khó' },
}

function parseOopTags(tags: unknown): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags as string[]
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function ExerciseLibrary() {
  const navigate = useNavigate()
  const [exercises, setExercises] = useState<LibraryExercise[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)

  // Assignment state
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState('')
  const [deadline, setDeadline] = useState('')
  const [assignError, setAssignError] = useState<string | null>(null)

  useEffect(() => {
    fetchLibrary()
  }, [])

  async function fetchLibrary() {
    setLoading(true)
    try {
      const [exercisesRes, sectionsRes] = await Promise.all([
        cachedGet('/api/exercises/library'),
        cachedGet('/api/instructor/sections').catch(() => ({ data: [] })),
      ])
      const rawExercises = Array.isArray(exercisesRes.data) ? exercisesRes.data : []
      setExercises(
        rawExercises.map((e: Record<string, unknown>) => ({
          id: e.id as string,
          title: e.title as string,
          description: e.description as string,
          difficulty: e.difficulty as LibraryExercise['difficulty'],
          oop_tags: parseOopTags(e.oopTags ?? e.oop_tags),
        }))
      )
      setSections(Array.isArray(sectionsRes.data) ? sectionsRes.data : [])
    } catch {
      toast.error('Không thể tải thư viện bài tập. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAssign(exerciseId: string) {
    if (!selectedSection) {
      setAssignError('Vui lòng chọn lớp học')
      return
    }

    setAssignError(null)
    try {
      await api.post(`/api/exercises/${exerciseId}/assign`, {
        section_id: selectedSection,
        deadline: deadline || null,
      })
      toast.success('Đã gán bài tập thành công!')
      setAssigningId(null)
      setSelectedSection('')
      setDeadline('')
    } catch {
      setAssignError('Không thể gán bài tập. Vui lòng thử lại.')
      toast.error('Không thể gán bài tập. Vui lòng thử lại.')
    }
  }

  function getDifficultyBadge(difficulty: string) {
    return DIFFICULTY_BADGE[difficulty] ?? { className: 'badge-gray', label: difficulty }
  }

  if (loading) {
    return <PageLoader label="Đang tải thư viện bài tập..." />
  }

  return (
    <div className="space-y-4">
      {exercises.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <ExerciseIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">Chưa có bài tập nào trong thư viện.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exercises.map((exercise) => {
            const badge = getDifficultyBadge(exercise.difficulty)
            return (
              <div key={exercise.id} className="card-hover flex flex-col p-4">
                <div className="mb-2 flex items-start justify-between">
                  <button
                    type="button"
                    onClick={() => navigate(`/instructor/exercises/${exercise.id}`)}
                    className="text-left text-sm font-bold text-sky-700 hover:underline"
                  >
                    {exercise.title}
                  </button>
                  <span className={`ml-2 shrink-0 ${badge.className}`}>{badge.label}</span>
                </div>

                <p className="mb-3 line-clamp-2 text-xs text-gray-500">{exercise.description}</p>

                <div className="mb-3 flex flex-wrap gap-1">
                  {exercise.oop_tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-auto">
                  {assigningId === exercise.id ? (
                    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="input text-xs"
                      >
                        <option value="">Chọn lớp học...</option>
                        {sections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.name} ({section.semester})
                          </option>
                        ))}
                      </select>

                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          Hạn nộp (tùy chọn)
                        </label>
                        <input
                          type="datetime-local"
                          value={deadline}
                          onChange={(e) => setDeadline(e.target.value)}
                          className="input text-xs"
                        />
                      </div>

                      {assignError && <p className="text-xs text-danger-600">{assignError}</p>}

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAssign(exercise.id)}
                          className="btn-primary btn-sm"
                        >
                          Gán
                        </button>
                        <button
                          onClick={() => {
                            setAssigningId(null)
                            setAssignError(null)
                            setSelectedSection('')
                            setDeadline('')
                          }}
                          className="btn-secondary btn-sm"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => navigate(`/instructor/exercises/${exercise.id}`)}
                        className="btn-secondary btn-sm"
                      >
                        Xem chi tiết
                      </button>
                      <button
                        onClick={() => setAssigningId(exercise.id)}
                        className="btn-primary btn-sm"
                      >
                        Gán vào lớp
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
