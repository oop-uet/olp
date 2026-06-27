import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../ui/LoadingIndicator'

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

export function ExerciseLibrary() {
  const [exercises, setExercises] = useState<LibraryExercise[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Assignment state
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState('')
  const [deadline, setDeadline] = useState('')
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchLibrary()
  }, [])

  async function fetchLibrary() {
    setLoading(true)
    setError(null)
    try {
      const [exercisesRes, sectionsRes] = await Promise.all([
        api.get('/api/exercises/library'),
        api.get('/api/admin/sections').catch(() => ({ data: [] })),
      ])
      setExercises(exercisesRes.data)
      setSections(sectionsRes.data)
    } catch {
      setError('Failed to load exercise library. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAssign(exerciseId: string) {
    if (!selectedSection) {
      setAssignError('Please select a section')
      return
    }

    setAssignError(null)
    try {
      await api.post(`/api/exercises/${exerciseId}/assign`, {
        section_id: selectedSection,
        deadline: deadline || null,
      })
      setAssignSuccess('Exercise assigned successfully!')
      setAssigningId(null)
      setSelectedSection('')
      setDeadline('')
      setTimeout(() => setAssignSuccess(null), 3000)
    } catch {
      setAssignError('Failed to assign exercise. Please try again.')
    }
  }

  function getDifficultyBadge(difficulty: string) {
    const colors: Record<string, string> = {
      easy: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      hard: 'bg-red-100 text-red-700',
    }
    return colors[difficulty] || 'bg-gray-100 text-gray-700'
  }

  if (loading) {
    return <LoadingIndicator label="Loading exercise library..." />
  }

  if (error) {
    return (
      <div
        className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        role="alert"
      >
        {error}
        <button
          onClick={fetchLibrary}
          className="ml-2 font-medium underline hover:text-red-800"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {assignSuccess && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {assignSuccess}
        </div>
      )}

      {exercises.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No exercises available in the library.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exercises.map((exercise) => (
            <div
              key={exercise.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between">
                <h3 className="text-sm font-medium text-gray-900">{exercise.title}</h3>
                <span
                  className={`ml-2 inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${getDifficultyBadge(exercise.difficulty)}`}
                >
                  {exercise.difficulty}
                </span>
              </div>

              <p className="mb-3 line-clamp-2 text-xs text-gray-500">
                {exercise.description}
              </p>

              <div className="mb-3 flex flex-wrap gap-1">
                {exercise.oop_tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex rounded bg-primary-50 px-2 py-0.5 text-xs text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {assigningId === exercise.id ? (
                <div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
                  <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select section...</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name} ({section.semester})
                      </option>
                    ))}
                  </select>

                  <div>
                    <label className="mb-1 block text-xs text-gray-500">
                      Deadline (optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {assignError && (
                    <p className="text-xs text-red-600">{assignError}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAssign(exercise.id)}
                      className="rounded bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-600"
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => {
                        setAssigningId(null)
                        setAssignError(null)
                        setSelectedSection('')
                        setDeadline('')
                      }}
                      className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAssigningId(exercise.id)}
                  className="w-full rounded border border-primary px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-50"
                >
                  Assign to Section
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
