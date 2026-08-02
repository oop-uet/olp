import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { readApiError } from '../../lib/apiError'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface SubmissionRow {
  id: string
  status: string
  reviewStatus: string
  startedAt: string
  submittedAt: string | null
  autoScore: number
  predictedScore: number | null
  officialScore: number | null
  student: { id: string; username: string; fullName?: string | null; email: string }
}

interface PageData {
  assignment: { id: string; opensAt: string; closesAt: string }
  assessment: { id: string; title: string; totalPoints: number }
  submissions: SubmissionRow[]
}

function score(value: number | null, total: number) {
  return value === null ? '—' : `${value}/${total}`
}

function statusLabel(row: SubmissionRow) {
  if (row.reviewStatus === 'official') return { label: 'Điểm chính thức', className: 'badge-green' }
  if (row.reviewStatus === 'pending_review') return { label: 'Chờ GV duyệt', className: 'badge-yellow' }
  if (row.reviewStatus === 'ai_queued' || row.reviewStatus === 'ai_running') {
    return { label: 'AI đang chấm', className: 'badge-blue' }
  }
  return { label: row.status === 'in_progress' ? 'Đang làm bài' : 'Đã nộp', className: 'badge-gray' }
}

export function AssessmentSubmissionsPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)

  const load = useCallback(async (showLoader = true) => {
    if (!assignmentId) return
    if (showLoader) setLoading(true)
    try {
      const response = await api.get(`/api/instructor/assessments/assignments/${assignmentId}/submissions`)
      setData(response.data.data)
    } catch {
      if (showLoader) toast.error('Không thể tải danh sách bài nộp.')
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [assignmentId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(false), 5000)
    return () => window.clearInterval(timer)
  }, [load])

  async function approveAll() {
    if (!assignmentId || !window.confirm('Duyệt toàn bộ điểm dự kiến hiện đã có thành điểm chính thức?')) return
    setApproving(true)
    try {
      const response = await api.post(`/api/instructor/assessments/assignments/${assignmentId}/approve-all`)
      const result = response.data.data
      toast.success(`Đã duyệt ${result.answersApproved} câu trả lời; ${result.sessionsOfficial} bài đã có điểm chính thức.`)
      await load(false)
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể duyệt điểm dự kiến.')
    } finally {
      setApproving(false)
    }
  }

  if (loading) return <PageLoader label="Đang tải bài nộp kiểm tra..." />
  if (!data) return <div className="card p-8 text-center text-slate-500">Không tìm thấy ca thi.</div>

  const pendingAi = data.submissions.filter((row) => ['ai_queued', 'ai_running'].includes(row.reviewStatus)).length
  const ready = data.submissions.filter(
    (row) => row.reviewStatus === 'pending_review' && row.predictedScore !== null
  ).length
  const official = data.submissions.filter((row) => row.reviewStatus === 'official').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/instructor/exercises?tab=assessments" className="text-sm font-semibold text-primary hover:underline">
            ← Bài kiểm tra
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{data.assessment.title}</h1>
          <p className="mt-1 text-sm text-slate-500">Danh sách bài nộp và duyệt điểm dự kiến.</p>
        </div>
        <button onClick={() => void approveAll()} disabled={approving || ready === 0} className="btn-primary">
          {approving ? 'Đang duyệt...' : 'Approve toàn bộ điểm dự kiến'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="AI đang chấm" value={pendingAi} tone="blue" />
        <SummaryCard label="Chờ giảng viên duyệt" value={ready} tone="amber" />
        <SummaryCard label="Đã có điểm chính thức" value={official} tone="green" />
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Điểm dự kiến</strong> gồm điểm tự động và điểm LLM đề xuất. Chỉ sau khi GV
        Approve hoặc chấm lại, điểm mới chuyển thành <strong>điểm chính thức</strong>.
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-th">Sinh viên</th>
              <th className="table-th">Nộp lúc</th>
              <th className="table-th text-center">Điểm tự động</th>
              <th className="table-th text-center">Điểm dự kiến</th>
              <th className="table-th text-center">Điểm chính thức</th>
              <th className="table-th">Trạng thái</th>
              <th className="table-th text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.submissions.map((row) => {
              const status = statusLabel(row)
              return (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="table-td">
                    <p className="font-bold text-slate-800">{row.student.fullName || row.student.username}</p>
                    <p className="text-[11px] text-slate-500">{row.student.username}</p>
                  </td>
                  <td className="table-td text-slate-600">
                    {row.submittedAt ? new Date(row.submittedAt).toLocaleString('vi-VN') : 'Chưa nộp'}
                  </td>
                  <td className="table-td text-center font-semibold">{score(row.autoScore, data.assessment.totalPoints)}</td>
                  <td className="table-td text-center">
                    <span className="font-black text-blue-700">{score(row.predictedScore, data.assessment.totalPoints)}</span>
                  </td>
                  <td className="table-td text-center">
                    <span className="font-black text-emerald-700">{score(row.officialScore, data.assessment.totalPoints)}</span>
                  </td>
                  <td className="table-td"><span className={status.className}>{status.label}</span></td>
                  <td className="table-td text-right">
                    {row.status !== 'in_progress' && (
                      <Link to={`/instructor/assessment-sessions/${row.id}/review`} className="btn-secondary btn-sm">
                        Xem & chấm lại
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
            {data.submissions.length === 0 && (
              <tr><td colSpan={7} className="p-10 text-center text-sm text-slate-500">Chưa có sinh viên bắt đầu làm bài.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'amber' | 'green' }) {
  const colors = {
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[tone]}`}>
      <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  )
}
