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
  integrityEventCount?: number
  attemptNumber: number
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
  const [regrading, setRegrading] = useState(false)
  const [regradeArmed, setRegradeArmed] = useState(false)
  const [exporting, setExporting] = useState(false)


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

  useEffect(() => {
    if (!regradeArmed) return
    const timer = window.setTimeout(() => setRegradeArmed(false), 6000)
    return () => window.clearTimeout(timer)
  }, [regradeArmed])

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

  async function regradeAll() {
    if (!assignmentId) return
    if (!regradeArmed) {
      setRegradeArmed(true)
      return
    }
    setRegrading(true)
    setRegradeArmed(false)
    try {
      const response = await api.post(
        `/api/instructor/assessments/assignments/${assignmentId}/regrade-all`
      )
      const result = response.data.data
      toast.success(
        `Đã chấm lại ${result.sessionsRegraded} bài: ${result.objectiveAnswersRescored} câu tự động, ${result.aiAnswersQueued} câu đã xếp hàng AI.`
      )
      await load(false)
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể chấm lại toàn bộ bài nộp.')
    } finally {
      setRegrading(false)
    }
  }

  async function exportXlsx() {
    if (!assignmentId) return
    setExporting(true)
    try {
      const response = await api.get(
        `/api/instructor/assessments/assignments/${assignmentId}/export-xlsx`,
        { responseType: 'blob' }
      )
      const contentDisposition = response.headers['content-disposition'] as string | undefined
      let fileName = `ket-qua-kiem-tra.xlsx`
      if (contentDisposition) {
        // Try filename*=UTF-8'' first, then plain filename="..."
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
        const plainMatch = contentDisposition.match(/filename="([^"]+)"/i)
        if (utf8Match?.[1]) fileName = decodeURIComponent(utf8Match[1])
        else if (plainMatch?.[1]) fileName = plainMatch[1]
      }
      const url = URL.createObjectURL(new Blob([response.data as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }))
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Đã xuất file Excel kết quả bài kiểm tra.')
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể xuất file Excel.')
    } finally {
      setExporting(false)
    }
  }


  if (loading) return <PageLoader label="Đang tải bài nộp kiểm tra..." />
  if (!data) return <div className="card p-8 text-center text-slate-500 font-semibold">Không tìm thấy ca thi.</div>

  const pendingAi = data.submissions.filter((row) => ['ai_queued', 'ai_running'].includes(row.reviewStatus)).length
  const ready = data.submissions.filter(
    (row) => row.reviewStatus === 'pending_review' && row.predictedScore !== null
  ).length
  const official = data.submissions.filter((row) => row.reviewStatus === 'official').length
  const regradable = data.submissions.filter(
    (row) => row.status !== 'in_progress' && row.status !== 'voided'
  ).length

  return (
    <div className="space-y-6">
      <Link
        to="/instructor/assessments"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-700 hover:text-teal-800 transition-colors"
      >
        <span>←</span> Quay lại danh sách bài kiểm tra
      </Link>

      {/* Signature Gradient Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-cyan-700 to-blue-800 p-6 sm:p-8 text-white shadow-md border-b-4 border-secondary flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="absolute right-0 top-0 h-44 w-44 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 space-y-1.5">
          <span className="inline-block rounded-full bg-white/15 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-cyan-100 backdrop-blur-xs">
            Danh sách bài nộp
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
            {data.assessment.title}
          </h1>
          <p className="text-xs font-bold text-cyan-100/90 mt-1">
            Tổng điểm: {data.assessment.totalPoints} điểm · Khung thời gian: {new Date(data.assignment.opensAt).toLocaleString('vi-VN')} – {new Date(data.assignment.closesAt).toLocaleString('vi-VN')}
          </p>
        </div>

        <div className="relative z-10 flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void exportXlsx()}
              disabled={exporting || data.submissions.length === 0}
              aria-label="Xuất kết quả bài kiểm tra ra Excel"
              title="Tải về file .xlsx chứa danh sách sinh viên và điểm"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-emerald-300/60 bg-emerald-500/20 px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? (
                <>
                  <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                  </svg>
                  Đang xuất...
                </>
              ) : (
                <>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 8-3-3m3 3 3-3M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
                  </svg>
                  Xuất Excel
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => void regradeAll()}
              disabled={regrading || approving || regradable === 0}
              aria-label="Chấm lại toàn bộ bài nộp"
              title="Tính lại điểm tự động và xếp hàng chấm AI; điểm chính thức cũ sẽ trở về điểm dự kiến"
              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-4 text-xs font-bold shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                regradeArmed
                  ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-white/40 bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" />
              </svg>
              {regrading
                ? 'Đang xếp hàng...'
                : regradeArmed
                  ? 'Bấm lần nữa để xác nhận'
                  : 'Chấm lại toàn bộ'}
            </button>
            <button
              onClick={() => void approveAll()}
              disabled={approving || regrading || ready === 0}
              className="btn-primary h-10 px-4 text-xs font-bold shadow-md hover:shadow-lg transition-all"
            >
              {approving ? 'Đang duyệt...' : 'Duyệt toàn bộ điểm dự kiến'}
            </button>
          </div>

          {regradeArmed && (
            <p className="max-w-md text-right text-[11px] font-semibold text-amber-100">
              Điểm chính thức cũ sẽ chuyển về dự kiến để GV duyệt lại.
            </p>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:bg-slate-50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">AI đang chấm</p>
          <p className="mt-1 text-2xl font-black text-blue-600">{pendingAi}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:bg-slate-50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Chờ giảng viên duyệt</p>
          <p className="mt-1 text-2xl font-black text-amber-600">{ready}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:bg-slate-50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Đã có điểm chính thức</p>
          <p className="mt-1 text-2xl font-black text-emerald-600">{official}</p>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="card overflow-hidden border border-slate-200/90 shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-th">Sinh viên</th>
              <th className="table-th text-center">Lượt làm</th>
              <th className="table-th">Thời gian nộp</th>
              <th className="table-th text-center">Điểm tự động</th>
              <th className="table-th text-center">Điểm dự kiến</th>
              <th className="table-th text-center">Điểm chính thức</th>
              <th className="table-th">Trạng thái</th>
              <th className="table-th text-center">Giám sát</th>
              <th className="table-th text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.submissions.map((row) => {
              const status = statusLabel(row)
              const integrityCount = row.integrityEventCount ?? 0
              return (
                <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="table-td">
                    <p className="font-bold text-slate-900">{row.student.fullName || row.student.username}</p>
                    <p className="text-[11px] font-semibold text-slate-500">MSSV: {row.student.username}</p>
                  </td>
                  <td className="table-td text-center font-black text-slate-700">
                    {row.attemptNumber}
                  </td>
                  <td className="table-td text-xs font-semibold text-slate-600">
                    {row.submittedAt ? new Date(row.submittedAt).toLocaleString('vi-VN') : 'Chưa nộp'}
                  </td>
                  <td className="table-td text-center font-bold text-slate-700">
                    {score(row.autoScore, data.assessment.totalPoints)}
                  </td>
                  <td className="table-td text-center">
                    <span className="font-black text-teal-700">{score(row.predictedScore, data.assessment.totalPoints)}</span>
                  </td>
                  <td className="table-td text-center">
                    <span className="font-black text-emerald-700">{score(row.officialScore, data.assessment.totalPoints)}</span>
                  </td>
                  <td className="table-td">
                    <span className={status.className}>{status.label}</span>
                  </td>
                  <td className="table-td text-center">
                    <span className={integrityCount > 0 ? 'badge-yellow font-bold' : 'badge-green font-bold'}>
                      {integrityCount > 0 ? `${integrityCount} cảnh báo` : 'Không cảnh báo'}
                    </span>
                  </td>
                  <td className="table-td text-right">
                    {row.status !== 'in_progress' && (
                      <Link
                        to={`/instructor/assessment-sessions/${row.id}/review`}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-primary/40 hover:bg-primary-50 hover:text-primary transition-colors shadow-2xs"
                      >
                        Xem & chấm lại
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
            {data.submissions.length === 0 && (
              <tr>
                <td colSpan={9} className="p-12 text-center text-sm font-semibold text-slate-500">
                  Chưa có sinh viên nào bắt đầu làm bài kiểm tra này.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
