import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui/LoadingIndicator'
import { ExerciseLibrary } from '../../components/instructor/ExerciseLibrary'

export interface Exercise {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  oop_tags: string[]
  starter_code: string
  created_at: string
  updated_at: string
}

type Tab = 'my-exercises' | 'library'

export function ExerciseManagerPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('my-exercises')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const navigate = useNavigate()

  useEffect(() => {
    if (activeTab === 'my-exercises') {
      fetchExercises()
    }
  }, [activeTab])

  async function fetchExercises() {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/api/exercises')
      setExercises(response.data)
    } catch {
      setError('Failed to load exercises. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to delete this exercise?')) return

    setDeletingId(id)
    try {
      await api.delete(`/api/exercises/${id}`)
      setExercises((prev) => prev.filter((ex) => ex.id !== id))
    } catch {
      setError('Failed to delete exercise. Please try again.')
    } finally {
      setDeletingId(null)
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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Exercise Management</h1>
        {activeTab === 'my-exercises' && (
          <button
            onClick={() => navigate('/instructor/exercises/new')}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            Create Exercise
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('my-exercises')}
            className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'my-exercises'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            My Exercises
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'library'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Exercise Library
          </button>
        </nav>
      </div>

      {/* Error message */}
      {error && (
        <div
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
          <button
            onClick={fetchExercises}
            className="ml-2 font-medium underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'my-exercises' && (
        <>
          {loading ? (
            <LoadingIndicator label="Loading exercises..." />
          ) : exercises.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
              <p className="text-gray-500">No exercises created yet.</p>
              <button
                onClick={() => navigate('/instructor/exercises/new')}
                className="mt-3 text-sm font-medium text-primary hover:text-primary-600"
              >
                Create your first exercise
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Difficulty
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Tags
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {exercises.map((exercise) => (
                    <tr key={exercise.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="text-sm font-medium text-gray-900">
                          {exercise.title}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getDifficultyBadge(exercise.difficulty)}`}
                        >
                          {exercise.difficulty}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {exercise.oop_tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex rounded bg-primary-50 px-2 py-0.5 text-xs text-primary"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <button
                          onClick={() => navigate(`/instructor/exercises/${exercise.id}/testcases`)}
                          className="mr-3 text-sm font-medium text-gray-600 hover:text-gray-800"
                        >
                          Test Cases
                        </button>
                        <button
                          onClick={() => navigate(`/instructor/exercises/${exercise.id}/edit`)}
                          className="mr-3 text-sm font-medium text-primary hover:text-primary-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(exercise.id)}
                          disabled={deletingId === exercise.id}
                          className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {deletingId === exercise.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'library' && <ExerciseLibrary />}
    </div>
  )
}
