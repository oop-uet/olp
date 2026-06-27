import { useEffect, useState, useRef, useCallback } from 'react'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui'

// --- Types ---

interface LeaderboardEntry {
  rank: number
  studentName: string
  studentId: string
  totalScore: number
  completedExercises: number
}

interface SectionOption {
  id: string
  name: string
  semester: string
}

// --- Constants ---

const AUTO_REFRESH_INTERVAL_MS = 5000

// --- Component ---

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch available sections
  useEffect(() => {
    fetchSections()
  }, [])

  // Start auto-refresh when a section is selected
  useEffect(() => {
    if (selectedSectionId) {
      fetchLeaderboard(selectedSectionId)
      startAutoRefresh(selectedSectionId)
    } else {
      setEntries([])
      stopAutoRefresh()
    }

    return () => stopAutoRefresh()
  }, [selectedSectionId])

  async function fetchSections() {
    try {
      // Try to get sections from the admin endpoint
      const sectionsRes = await api.get('/api/admin/sections')
      setSections(
        sectionsRes.data.map((s: { id: string; name: string; semester: string }) => ({
          id: s.id,
          name: s.name,
          semester: s.semester,
        }))
      )
      // Auto-select first section
      if (sectionsRes.data.length > 0) {
        setSelectedSectionId(sectionsRes.data[0].id)
      }
    } catch {
      // If admin sections endpoint is not accessible, sections dropdown remains empty
    }
  }

  const fetchLeaderboard = useCallback(async (sectionId: string) => {
    if (!sectionId) return

    try {
      setError(null)
      const response = await api.get(`/api/sections/${sectionId}/leaderboard`)
      setEntries(response.data)
      setLastRefreshed(new Date())
    } catch {
      setError('Failed to load leaderboard. Please try again.')
    }
  }, [])

  function startAutoRefresh(sectionId: string) {
    stopAutoRefresh()
    intervalRef.current = setInterval(() => {
      fetchLeaderboard(sectionId)
    }, AUTO_REFRESH_INTERVAL_MS)
  }

  function stopAutoRefresh() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function handleSectionChange(sectionId: string) {
    setSelectedSectionId(sectionId)
    setLoading(true)
    // Loading will be cleared when fetchLeaderboard resolves
    fetchLeaderboard(sectionId).finally(() => setLoading(false))
  }

  function getScoreColor(score: number): string {
    if (score >= 80) return 'text-green-700'
    if (score >= 50) return 'text-yellow-700'
    return 'text-red-700'
  }

  function getRankBadge(rank: number): React.ReactNode {
    if (rank === 1) {
      return <span className="text-lg">🥇</span>
    }
    if (rank === 2) {
      return <span className="text-lg">🥈</span>
    }
    if (rank === 3) {
      return <span className="text-lg">🥉</span>
    }
    return <span className="text-sm font-medium text-gray-500">#{rank}</span>
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Leaderboard</h1>
        {lastRefreshed && (
          <p className="text-xs text-gray-400">
            Auto-refreshing every 5s · Last updated:{' '}
            {lastRefreshed.toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        )}
      </div>

      {/* Section filter */}
      <div className="flex items-center gap-3">
        <label htmlFor="section-filter" className="text-sm font-medium text-gray-700">
          Class section:
        </label>
        <select
          id="section-filter"
          value={selectedSectionId}
          onChange={(e) => handleSectionChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Select a section</option>
          {sections.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.name} ({sec.semester})
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
          <button
            onClick={() => selectedSectionId && fetchLeaderboard(selectedSectionId)}
            className="ml-2 font-medium underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* No section selected */}
      {!selectedSectionId && !loading && (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">Select a class section to view the leaderboard.</p>
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingIndicator label="Loading leaderboard..." />}

      {/* Leaderboard table */}
      {selectedSectionId && !loading && entries.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No leaderboard data available for this section.</p>
        </div>
      )}

      {selectedSectionId && !loading && entries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Student ID
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Total Score
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Completed Exercises
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry) => (
                <tr key={entry.studentId} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-center">
                    {getRankBadge(entry.rank)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {entry.studentName}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {entry.studentId}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <span className={`text-sm font-bold ${getScoreColor(entry.totalScore)}`}>
                      {entry.totalScore.toFixed(1)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-700">
                    {entry.completedExercises}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
