import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui'

interface Submission {
  id: string
  submittedAt: string
  score: number
  attemptNumber: number
}

interface ExerciseSubmissionGroup {
  exerciseId: string
  exerciseTitle: string
  submissions: Submission[]
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts)
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-700 bg-green-50 border-green-200'
  if (score >= 50) return 'text-yellow-700 bg-yellow-50 border-yellow-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

export function SubmissionHistoryPage() {
  const [groups, setGroups] = useState<ExerciseSubmissionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSubmissions()
  }, [])

  async function fetchSubmissions() {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/api/submissions')
      const data = response.data.groups ?? response.data ?? []
      setGroups(data)
    } catch {
      setError('Failed to load submissions. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingIndicator label="Loading submissions..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchSubmissions}
          className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-600 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-12">
        <span className="text-4xl">📭</span>
        <p className="text-lg font-medium text-gray-700">No submissions yet</p>
        <p className="text-sm text-gray-500">
          Complete an exercise and submit your solution to see it here.
        </p>
        <Link
          to="/student/exercises"
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-600 transition-colors"
        >
          Browse Exercises
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Submission History</h1>
        <p className="mt-1 text-sm text-gray-600">
          Your submissions grouped by exercise, sorted by most recent.
        </p>
      </div>

      {/* Grouped submissions */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div
            key={group.exerciseId}
            className="rounded-lg border border-gray-200 bg-white shadow-sm"
          >
            {/* Exercise header */}
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {group.exerciseTitle}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {group.submissions.length} submission{group.submissions.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Submission list */}
            <div className="divide-y divide-gray-100">
              {group.submissions.map((submission) => (
                <Link
                  key={submission.id}
                  to={`/student/submissions/${submission.id}`}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                      #{submission.attemptNumber}
                    </span>
                    <span className="text-sm text-gray-700">
                      {formatTimestamp(submission.submittedAt)}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getScoreColor(submission.score)}`}
                  >
                    {submission.score.toFixed(1)}%
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
