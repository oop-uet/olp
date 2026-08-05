import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
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

type SortField =
  | 'index'
  | 'student'
  | 'attempt'
  | 'submittedAt'
  | 'autoScore'
  | 'predictedScore'
  | 'officialScore'
  | 'status'
  | 'integrity'

function score(value: number | null, total: number) {
  return value === null ? '—' : `${value}/${total}`
}

function statusLabel(row: SubmissionRow) {
  if (row.reviewStatus === 'official') return { label: 'Điểm chính thức', className: 'badge-green' }
  if (row.reviewStatus === 'pending_review') return { label: 'Chờ GV duyệt', className: 'badge-yellow' }
  if (row.reviewStatus === 'ai_running') {
    return { label: 'AI đang chấm...', className: 'badge-blue animate-pulse' }
  }
  if (row.reviewStatus === 'ai_queued') {
    return { label: 'AI trong hàng đợi', className: 'badge-blue' }
  }
  return { label: row.status === 'in_progress' ? 'Đang làm bài' : 'Đã nộp', className: 'badge-gray' }
}

function statusPriority(row: SubmissionRow): number {
  if (row.reviewStatus === 'ai_running') return 1
  if (row.reviewStatus === 'ai_queued') return 2
  if (row.reviewStatus === 'pending_review') return 3
  if (row.reviewStatus === 'official') return 4
  if (row.status === 'in_progress') return 5
  return 6
}

export function AssessmentSubmissionsPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [regrading, setRegrading] = useState(false)
  const [regradeArmed, setRegradeArmed] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Sort States
  const [sortField, setSortField] = useState<SortField>('index')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const load = useCallback(
    async (showLoader = true) => {
      if (!assignmentId) return
      if (showLoader) setLoading(true)
      try {
        const response = await api.get(
          `/api/instructor/assessments/assignments/${assignmentId}/submissions`
        )
        setData(response.data.data)
      } catch {
        if (showLoader) toast.error('Không thể tải danh sách bài nộp.')
      } finally {
        if (showLoader) setLoading(false)
      }
    },
    [assignmentId]
  )

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

  // Sort logic
  const sortedSubmissions = useMemo(() => {
    if (!data?.submissions) return []
    const list = [...data.submissions]

    if (sortField === 'index') return list

    return list.sort((a, b) => {
      let result = 0

      if (sortField === 'student') {
        const nameA = (a.student.fullName || a.student.username).toLowerCase()
        const nameB = (b.student.fullName || b.student.username).toLowerCase()
        result = nameA.localeCompare(nameB, 'vi')
      } else if (sortField === 'attempt') {
        result = a.attemptNumber - b.attemptNumber
      } else if (sortField === 'submittedAt') {
        const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0
        const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0
        result = timeA - timeB
      } else if (sortField === 'autoScore') {
        result = (a.autoScore ?? 0) - (b.autoScore ?? 0)
      } else if (sortField === 'predictedScore') {
        result = (a.predictedScore ?? -1) - (b.predictedScore ?? -1)
      } else if (sortField === 'officialScore') {
        result = (a.officialScore ?? -1) - (b.officialScore ?? -1)
      } else if (sortField === 'status') {
        result = statusPriority(a) - statusPriority(b)
      } else if (sortField === 'integrity') {
        result = (a.integrityEventCount ?? 0) - (b.integrityEventCount ?? 0)
      }

      return sortOrder === 'asc' ? result : -result
    })
  }, [data?.submissions, sortField, sortOrder])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  function renderSortIndicator(field: SortField) {
    if (sortField !== field) return null
    return <span className="ml-1 text-primary">{sortOrder === 'asc' ? '▲' : '▼'}</span>
  }

  async function approveAll() {
    if (
      !assignmentId ||
      !window.confirm('Duyệt toàn bộ điểm dự kiến hiện đã có thành điểm chính thức?')
    )
      return
    setApproving(true)
    try {
      const response = await api.post(
        `/api/instructor/assessments/assignments/${assignmentId}/approve-all`
      )
      const result = response.data.data
      toast.success(
        `Đã duyệt ${result.answersApproved} câu trả lời; ${result.sessionsOfficial} bài đã có điểm chính thức.`
      )
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
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
        const plainMatch = contentDisposition.match(/filename="([^"]+)"/i)
        if (utf8Match?.[1]) fileName = decodeURIComponent(utf8Match[1])
        else if (plainMatch?.[1]) fileName = plainMatch[1]
      }
      const url = URL.createObjectURL(
        new Blob([response.data as BlobPart], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      )
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

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importingEssay, setImportingEssay] = useState(false)

  async function exportEssayPack() {
    if (!assignmentId || !data) return
    try {
      const response = await api.get(
        `/api/instructor/assessments/assignments/${assignmentId}/export-essay-pack`
      )
      const packData = response.data.data
      const jsonStr = JSON.stringify(packData, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.assessment.title.replace(/[^a-zA-Z0-9_\-]/g, '_')}_bai_tu_luan.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Đã tải xuống toàn bộ bài làm tự luận của sinh viên (file JSON).')
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể tải gói bài tự luận.')
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !assignmentId) return
    setImportingEssay(true)
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const scores = Array.isArray(json) ? json : json.scores
      if (!Array.isArray(scores) || scores.length === 0) {
        toast.error('File JSON không hợp lệ. Cần chứa mảng "scores" hoặc danh sách điểm.')
        return
      }
      const response = await api.post(
        `/api/instructor/assessments/assignments/${assignmentId}/import-essay-scores`,
        { scores }
      )
      const result = response.data.data
      toast.success(
        `Đã import điểm cho ${result.answersUpdated} câu trả lời và ra ĐIỂM CHÍNH THỨC cho ${result.sessionsOfficial} bài thi!`
      )
      await load(false)
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể import file điểm chấm tự luận.')
    } finally {
      setImportingEssay(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const [stoppingAi, setStoppingAi] = useState(false)

  async function stopAiGrading() {
    if (!assignmentId) return
    if (!window.confirm('Bạn có chắc chắn muốn dừng toàn bộ tiến trình chấm bằng AI của ca thi này?')) return
    setStoppingAi(true)
    try {
      const response = await api.post(
        `/api/instructor/assessments/assignments/${assignmentId}/stop-ai-grading`
      )
      const result = response.data.data
      toast.success(`Đã dừng chấm bằng AI cho ${result.answersReset} câu trả lời.`)
      await load(false)
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể dừng chấm AI.')
    } finally {
      setStoppingAi(false)
    }
  }

  if (loading) return <PageLoader label="Đang tải bài nộp kiểm tra..." />
  if (!data)
    return (
      <div className="card p-8 text-center font-semibold text-slate-500">
        Không tìm thấy ca thi.
      </div>
    )

  const pendingAi = data.submissions.filter((row) =>
    ['ai_queued', 'ai_running'].includes(row.reviewStatus)
  ).length
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

      {/* Header Banner - Clean & Focused */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-800 via-cyan-800 to-slate-900 p-6 sm:p-8 text-white shadow-md border-b-4 border-teal-500 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="absolute right-0 top-0 h-48 w-48 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 space-y-2 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-block rounded-full bg-white/15 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-cyan-100 backdrop-blur-xs">
              Danh sách bài nộp
            </span>
            <span className="inline-block rounded-full bg-teal-500/30 border border-teal-300/40 px-3 py-0.5 text-[11px] font-bold text-teal-100">
              {data.submissions.length} Bài thi
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
            {data.assessment.title}
          </h1>
          <p className="text-xs font-medium text-cyan-100/90 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Tổng điểm: <strong>{data.assessment.totalPoints} điểm</strong></span>
            <span>•</span>
            <span>
              Thời gian:{' '}
              <strong>
                {new Date(data.assignment.opensAt).toLocaleString('vi-VN')} –{' '}
                {new Date(data.assignment.closesAt).toLocaleString('vi-VN')}
              </strong>
            </span>
          </p>
        </div>

        {/* Quick Stats Box */}
        <div className="relative z-10 flex shrink-0 items-center gap-3 rounded-xl bg-white/10 p-3.5 backdrop-blur-sm border border-white/10">
          <div className="text-right">
            <div className="text-2xl font-black text-white">{official} / {data.submissions.length}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-200">Đã công bố điểm</div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-teal-400/20 flex items-center justify-center text-teal-200 font-bold text-lg">
            ✓
          </div>
        </div>
      </div>

      {/* Dedicated Action Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <input
          type="file"
          ref={fileInputRef}
          accept=".json"
          onChange={(e) => void handleImportFile(e)}
          className="hidden"
        />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Group 1: Off-line & AI Grading Suite */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline">
              Chấm AI & Offline:
            </span>
            <button
              type="button"
              onClick={() => void exportEssayPack()}
              disabled={data.submissions.length === 0}
              title="Tải toàn bộ bài tự luận của sinh viên dưới dạng file JSON để chấm AI bên ngoài"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-cyan-700 transition-colors disabled:opacity-50"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-cyan-600" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4" />
              </svg>
              Tải bài tự luận (JSON)
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importingEssay || data.submissions.length === 0}
              title="Nhập file JSON chứa điểm AI để ra ĐIỂM CHÍNH THỨC trực tiếp"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 text-xs font-bold text-purple-700 shadow-2xs hover:bg-purple-100 transition-colors disabled:opacity-50"
            >
              {importingEssay ? (
                <>
                  <svg aria-hidden="true" className="h-4 w-4 animate-spin text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                  </svg>
                  Đang import...
                </>
              ) : (
                <>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-purple-600" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8 4-4m0 0 4 4m-4-4v12" />
                  </svg>
                  Import điểm AI (JSON)
                </>
              )}
            </button>

            {pendingAi > 0 && (
              <button
                type="button"
                onClick={() => void stopAiGrading()}
                disabled={stoppingAi}
                title="Dừng ngay lập tức các lượt chấm AI đang trong hàng đợi"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 shadow-2xs hover:bg-rose-100 transition-colors disabled:opacity-50"
              >
                {stoppingAi ? (
                  <>
                    <svg aria-hidden="true" className="h-4 w-4 animate-spin text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                    </svg>
                    Đang dừng...
                  </>
                ) : (
                  <>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-rose-600" stroke="currentColor" strokeWidth="2">
                      <rect x="6" y="6" width="12" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Dừng chấm AI ({pendingAi})
                  </>
                )}
              </button>
            )}
          </div>

          {/* Group 2: Management & Export Operations */}
          <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
            <button
              type="button"
              onClick={() => void exportXlsx()}
              disabled={exporting || data.submissions.length === 0}
              title="Xuất danh sách điểm sinh viên ra file Excel"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-700 shadow-2xs hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              {exporting ? (
                <>
                  <svg aria-hidden="true" className="h-4 w-4 animate-spin text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                  </svg>
                  Đang xuất...
                </>
              ) : (
                <>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-emerald-600" stroke="currentColor" strokeWidth="2">
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
              title="Tính lại điểm trắc nghiệm và gửi câu tự luận vào hàng chờ AI"
              className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3.5 text-xs font-bold shadow-2xs transition-all disabled:opacity-50 ${
                regradeArmed
                  ? 'border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-amber-600" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 0 1 14.93-4M20 12a8 8 0 0 1-14.93 4" />
              </svg>
              {regrading ? 'Đang gửi...' : regradeArmed ? 'Bấm lần nữa để xác nhận' : 'Chấm lại toàn bộ'}
            </button>

            <button
              type="button"
              onClick={() => void approveAll()}
              disabled={approving || ready === 0}
              aria-label="Duyệt toàn bộ điểm dự kiến"
              title="Chuyển toàn bộ điểm dự kiến hiện tại thành Điểm chính thức"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 text-xs font-bold text-white shadow-2xs hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {approving ? (
                <>
                  <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                  </svg>
                  Đang duyệt...
                </>
              ) : (
                <>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Duyệt toàn bộ điểm dự kiến {ready > 0 ? `(${ready})` : ''}
                </>
              )}
            </button>
          </div>
        </div>
        {regradeArmed && (
          <p className="text-right text-[11px] font-semibold text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
            Điểm chính thức cũ sẽ chuyển về dự kiến để GV duyệt lại.
          </p>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:bg-slate-50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            AI đang chấm / Hàng đợi
          </p>
          <p className="mt-1 text-2xl font-black text-blue-600">{pendingAi}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:bg-slate-50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Chờ giảng viên duyệt
          </p>
          <p className="mt-1 text-2xl font-black text-amber-600">{ready}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:bg-slate-50">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Đã có điểm chính thức
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-600">{official}</p>
        </div>
      </div>

      {/* Submissions Table with STT & Sorting */}
      <div className="card overflow-hidden border border-slate-200/90 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th
                  onClick={() => toggleSort('index')}
                  className="table-th text-center w-14 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                >
                  STT {renderSortIndicator('index')}
                </th>
                <th
                  onClick={() => toggleSort('student')}
                  className="table-th cursor-pointer select-none hover:bg-slate-100 transition-colors"
                >
                  Sinh viên {renderSortIndicator('student')}
                </th>
                <th
                  onClick={() => toggleSort('attempt')}
                  className="table-th text-center cursor-pointer select-none hover:bg-slate-100 transition-colors"
                >
                  Lượt làm {renderSortIndicator('attempt')}
                </th>
                <th
                  onClick={() => toggleSort('submittedAt')}
                  className="table-th cursor-pointer select-none hover:bg-slate-100 transition-colors"
                >
                  Thời gian nộp {renderSortIndicator('submittedAt')}
                </th>
                <th
                  onClick={() => toggleSort('autoScore')}
                  className="table-th text-center cursor-pointer select-none hover:bg-slate-100 transition-colors"
                >
                  Điểm tự động {renderSortIndicator('autoScore')}
                </th>
                <th
                  onClick={() => toggleSort('predictedScore')}
                  className="table-th text-center cursor-pointer select-none hover:bg-slate-100 transition-colors"
                >
                  Điểm dự kiến {renderSortIndicator('predictedScore')}
                </th>
                <th
                  onClick={() => toggleSort('officialScore')}
                  className="table-th text-center cursor-pointer select-none hover:bg-slate-100 transition-colors"
                >
                  Điểm chính thức {renderSortIndicator('officialScore')}
                </th>
                <th
                  onClick={() => toggleSort('status')}
                  className="table-th cursor-pointer select-none hover:bg-slate-100 transition-colors"
                >
                  Trạng thái {renderSortIndicator('status')}
                </th>
                <th
                  onClick={() => toggleSort('integrity')}
                  className="table-th text-center cursor-pointer select-none hover:bg-slate-100 transition-colors"
                >
                  Giám sát {renderSortIndicator('integrity')}
                </th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {sortedSubmissions.map((row, idx) => {
                const status = statusLabel(row)
                const integrityCount = row.integrityEventCount ?? 0
                return (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="table-td text-center font-bold text-slate-500 text-xs">
                      {idx + 1}
                    </td>
                    <td className="table-td">
                      <p className="font-bold text-slate-900">
                        {row.student.fullName || row.student.username}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500">
                        MSSV: {row.student.username}
                      </p>
                    </td>
                    <td className="table-td text-center font-black text-slate-700">
                      {row.attemptNumber}
                    </td>
                    <td className="table-td text-xs font-semibold text-slate-600">
                      {row.submittedAt
                        ? new Date(row.submittedAt).toLocaleString('vi-VN')
                        : 'Chưa nộp'}
                    </td>
                    <td className="table-td text-center font-bold text-slate-700">
                      {score(row.autoScore, data.assessment.totalPoints)}
                    </td>
                    <td className="table-td text-center">
                      <span className="font-black text-teal-700">
                        {score(row.predictedScore, data.assessment.totalPoints)}
                      </span>
                    </td>
                    <td className="table-td text-center">
                      <span className="font-black text-emerald-700">
                        {score(row.officialScore, data.assessment.totalPoints)}
                      </span>
                    </td>
                    <td className="table-td">
                      <span className={status.className}>{status.label}</span>
                    </td>
                    <td className="table-td text-center">
                      <span
                        className={
                          integrityCount > 0 ? 'badge-yellow font-bold' : 'badge-green font-bold'
                        }
                      >
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
                );
              })}
              {sortedSubmissions.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-sm font-semibold text-slate-500">
                    Chưa có sinh viên nào bắt đầu làm bài kiểm tra này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
