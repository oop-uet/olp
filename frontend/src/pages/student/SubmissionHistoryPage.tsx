import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, SubmissionIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

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

function getScoreBadge(score: number): string {
  if (score >= 80) return 'badge-green'
  if (score >= 50) return 'badge-yellow'
  return 'badge-red'
}

export function SubmissionHistoryPage() {
  const [groups, setGroups] = useState<ExerciseSubmissionGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSubmissions()
  }, [])

  async function fetchSubmissions() {
    try {
      setLoading(true)
      const response = await api.get('/api/submissions')
      const data = response.data.groups ?? response.data ?? []
      setGroups(data)
    } catch {
      toast.error('Không thể tải danh sách bài nộp. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải bài nộp..." />
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lịch sử nộp bài</h1>
        </div>
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <SubmissionIcon className="h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">Chưa có bài nộp</p>
          <p className="text-sm text-gray-500">
            Hoàn thành một bài tập và nộp bài để xem ở đây.
          </p>
          <Link to="/student/exercises" className="btn-primary mt-2">
            Xem danh sách bài tập
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lịch sử nộp bài</h1>
        <p className="mt-1 text-sm text-gray-600">
          Các bài nộp được nhóm theo bài tập, sắp xếp theo thời gian gần nhất.
        </p>
      </div>

      {/* Grouped submissions */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.exerciseId} className="card">
            {/* Exercise header */}
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {group.exerciseTitle}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {group.submissions.length} lần nộp
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

                  <span className={getScoreBadge(submission.score)}>
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
