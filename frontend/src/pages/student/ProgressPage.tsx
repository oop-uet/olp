import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui'

interface ProgressData {
  completedExercises: number
  totalExercises: number
  averageScore: number
  rank: number
  totalStudents: number
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-700'
  if (score >= 50) return 'text-yellow-700'
  return 'text-red-700'
}

function getRankBadge(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

export function ProgressPage() {
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(false)

  useEffect(() => {
    fetchProgress()
  }, [])

  async function fetchProgress() {
    try {
      setLoading(true)
      setError(null)
      setIsEmpty(false)
      const response = await api.get('/api/students/progress')
      const data = response.data

      // Check if student has no submissions
      if (
        data.completedExercises === 0 &&
        data.averageScore === 0 &&
        data.rank === 0
      ) {
        setIsEmpty(true)
      }

      setProgress(data)
    } catch {
      setError('Failed to load progress. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingIndicator label="Loading progress..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchProgress}
          className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-600 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  if (isEmpty || !progress) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Progress Summary</h1>
          <p className="mt-1 text-sm text-gray-600">
            Track your performance across exercises.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white p-12 shadow-sm">
          <span className="text-4xl">📊</span>
          <p className="text-lg font-medium text-gray-700">No progress data yet</p>
          <p className="text-sm text-gray-500">
            Submit your first exercise to start tracking your progress.
          </p>
          <Link
            to="/student/exercises"
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-600 transition-colors"
          >
            Browse Exercises
          </Link>
        </div>
      </div>
    )
  }

  const completionPercentage =
    progress.totalExercises > 0
      ? ((progress.completedExercises / progress.totalExercises) * 100).toFixed(0)
      : '0'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Progress Summary</h1>
        <p className="mt-1 text-sm text-gray-600">
          Your overall performance in this class section.
        </p>
      </div>

      {/* Progress cards grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Completed exercises card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
              <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Completed
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {progress.completedExercises}
                <span className="text-sm font-normal text-gray-500">
                  /{progress.totalExercises}
                </span>
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">{completionPercentage}% complete</p>
          </div>
        </div>

        {/* Average score card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
              <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Average Score
              </p>
              <p className={`text-2xl font-bold ${getScoreColor(progress.averageScore)}`}>
                {progress.averageScore.toFixed(1)}%
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Across all assigned exercises (0% for unsubmitted)
          </p>
        </div>

        {/* Rank card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-50">
              <svg className="h-5 w-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Section Rank
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {getRankBadge(progress.rank)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Out of {progress.totalStudents} student{progress.totalStudents !== 1 ? 's' : ''} in your section
          </p>
        </div>
      </div>

      {/* Quick links */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700">Quick Links</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            to="/student/exercises"
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            View Exercises
          </Link>
          <Link
            to="/student/submissions"
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Submission History
          </Link>
        </div>
      </div>
    </div>
  )
}
