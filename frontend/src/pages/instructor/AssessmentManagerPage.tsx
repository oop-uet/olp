import { useCallback, useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { readApiError } from '../../lib/apiError'
import { ConfigIcon, EditIcon, ExerciseIcon, PageLoader, Spinner, TrashIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import type { AssessmentAssignmentSummary, InstructorAssessmentListItem } from '../../types/assessment'

function formatDate(value: string) {
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

function isoToLocalInput(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function localInputToIso(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function assignmentTimeStatus(opensAt: string, closesAt: string) {
  const now = Date.now()
  const openTime = new Date(opensAt).getTime()
  const closeTime = new Date(closesAt).getTime()
  if (now < openTime) return { label: 'Sắp mở', className: 'badge-blue' }
  if (now >= closeTime) return { label: 'Đã đóng', className: 'badge-gray' }
  return { label: 'Đang mở', className: 'badge-green' }
}

interface AssignmentWindowDraft extends AssessmentAssignmentSummary {
  opensAtInput: string
  closesAtInput: string
  durationMinutes: number
  hasPassword: boolean
  password: string
  clearPassword: boolean
}

const SETTINGS_PERSISTENCE_ERROR =
  'Máy chủ chưa lưu đúng cài đặt bài kiểm tra. Vui lòng thử lại sau khi hệ thống cập nhật xong.'

function toWindowDrafts(item: InstructorAssessmentListItem): AssignmentWindowDraft[] {
  return item.assignments.map((assignment) => ({
    ...assignment,
    durationMinutes: assignment.durationMinutes ?? item.durationMinutes,
    maxAttempts: assignment.maxAttempts ?? 1,
    hasPassword: assignment.hasPassword ?? false,
    password: '',
    clearPassword: false,
    opensAtInput: isoToLocalInput(assignment.opensAt),
    closesAtInput: isoToLocalInput(assignment.closesAt),
  }))
}

export function AssessmentManagerPanel() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InstructorAssessmentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [settingsItem, setSettingsItem] = useState<InstructorAssessmentListItem | null>(null)
  const [windowDrafts, setWindowDrafts] = useState<AssignmentWindowDraft[]>([])
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchAssessments = useCallback(async () => {
    const assessmentResponse = await api.get('/api/instructor/assessments')
    return (assessmentResponse.data.data ?? []) as InstructorAssessmentListItem[]
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await fetchAssessments())
    } catch {
      toast.error('Không thể tải danh sách bài kiểm tra.')
    } finally {
      setLoading(false)
    }
  }, [fetchAssessments])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!settingsItem) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingAssignmentId) setSettingsItem(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [savingAssignmentId, settingsItem])

  // Filtered items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(q)
      const matchSection = item.assignments.some((a) => a.sectionName.toLowerCase().includes(q))
      const matchCreator = (item.creatorUsername || '').toLowerCase().includes(q)
      return matchTitle || matchSection || matchCreator
    })
  }, [items, searchQuery])

  // Overall Statistics
  const stats = useMemo(() => {
    const totalExams = items.length
    let totalAssignments = 0
    let activeAssignments = 0

    const now = Date.now()
    items.forEach((item) => {
      totalAssignments += item.assignments.length
      item.assignments.forEach((a) => {
        const openTime = new Date(a.opensAt).getTime()
        const closeTime = new Date(a.closesAt).getTime()
        if (now >= openTime && now < closeTime) activeAssignments++
      })
    })

    return { totalExams, totalAssignments, activeAssignments }
  }, [items])

  async function deleteAssessment(item: InstructorAssessmentListItem) {
    if (!window.confirm(`Xóa bài kiểm tra "${item.title}"? Thao tác này không thể hoàn tác.`)) return
    setBusyId(item.id)
    try {
      await api.delete(`/api/instructor/assessments/${item.id}`)
      toast.success('Đã xóa bài kiểm tra.')
      await load()
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể xóa bài kiểm tra.')
    } finally {
      setBusyId(null)
    }
  }

  function openSettings(item: InstructorAssessmentListItem) {
    setSettingsItem(item)
    setWindowDrafts(toWindowDrafts(item))
  }

  function updateDurationMinutes(assignmentId: string, value: number) {
    setWindowDrafts((current) =>
      current.map((draft) =>
        draft.id === assignmentId ? { ...draft, durationMinutes: value } : draft
      )
    )
  }

  function updateMaxAttempts(assignmentId: string, value: number) {
    setWindowDrafts((current) =>
      current.map((draft) =>
        draft.id === assignmentId ? { ...draft, maxAttempts: value } : draft
      )
    )
  }

  function updateAssessmentPassword(assignmentId: string, password: string) {
    setWindowDrafts((current) =>
      current.map((draft) =>
        draft.id === assignmentId
          ? { ...draft, password, clearPassword: password ? false : draft.clearPassword }
          : draft
      )
    )
  }

  function updateClearPassword(assignmentId: string, clearPassword: boolean) {
    setWindowDrafts((current) =>
      current.map((draft) =>
        draft.id === assignmentId ? { ...draft, clearPassword, password: '' } : draft
      )
    )
  }

  function updateWindowDraft(
    assignmentId: string,
    field: 'opensAtInput' | 'closesAtInput',
    value: string
  ) {
    setWindowDrafts((current) =>
      current.map((draft) => (draft.id === assignmentId ? { ...draft, [field]: value } : draft))
    )
  }

  async function saveAssignmentWindow(draft: AssignmentWindowDraft) {
    const opensAt = localInputToIso(draft.opensAtInput)
    const closesAt = localInputToIso(draft.closesAtInput)
    if (!opensAt || !closesAt) {
      toast.error('Vui lòng nhập đầy đủ thời gian mở và đóng.')
      return
    }
    if (new Date(closesAt) <= new Date(opensAt)) {
      toast.error('Thời gian đóng phải sau thời gian mở.')
      return
    }
    if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1 || draft.durationMinutes > 600) {
      toast.error('Thời gian làm bài phải là số nguyên từ 1 đến 600 phút.')
      return
    }
    if (!Number.isInteger(draft.maxAttempts) || draft.maxAttempts < 1 || draft.maxAttempts > 20) {
      toast.error('Số lần làm phải là số nguyên từ 1 đến 20.')
      return
    }
    const password = draft.password.trim()
    if (password && (password.length < 4 || password.length > 100)) {
      toast.error('Mật khẩu bài kiểm tra phải có từ 4 đến 100 ký tự.')
      return
    }
    const expectedHasPassword = draft.clearPassword ? false : Boolean(password) || draft.hasPassword

    setSavingAssignmentId(draft.id)
    try {
      const payload: {
        opensAt: string
        closesAt: string
        durationMinutes: number
        maxAttempts: number
        password?: string
        clearPassword?: boolean
      } = {
        opensAt,
        closesAt,
        durationMinutes: draft.durationMinutes,
        maxAttempts: draft.maxAttempts,
      }
      if (password) payload.password = password
      if (draft.clearPassword) payload.clearPassword = true
      const updateResponse = await api.put(
        `/api/instructor/assessments/assignments/${draft.id}/window`,
        payload
      )
      const savedAssignment = updateResponse.data?.data
      if (
        Number(savedAssignment?.durationMinutes) !== draft.durationMinutes ||
        Number(savedAssignment?.maxAttempts) !== draft.maxAttempts ||
        Boolean(savedAssignment?.hasPassword) !== expectedHasPassword
      ) {
        throw new Error(SETTINGS_PERSISTENCE_ERROR)
      }

      const refreshedItems = await fetchAssessments()
      const refreshedItem = refreshedItems.find((item) => item.id === settingsItem?.id)
      const refreshedAssignment = refreshedItem?.assignments.find(
        (assignment) => assignment.id === draft.id
      )
      if (
        !refreshedItem ||
        Number(refreshedAssignment?.durationMinutes) !== draft.durationMinutes ||
        Number(refreshedAssignment?.maxAttempts) !== draft.maxAttempts ||
        Boolean(refreshedAssignment?.hasPassword) !== expectedHasPassword
      ) {
        throw new Error(SETTINGS_PERSISTENCE_ERROR)
      }

      setItems(refreshedItems)
      setSettingsItem(refreshedItem)
      setWindowDrafts(toWindowDrafts(refreshedItem))
      toast.success(`Đã cập nhật cài đặt cho lớp ${draft.sectionName}.`)
    } catch (error: unknown) {
      toast.error(
        readApiError(error).message ??
          (error instanceof Error ? error.message : 'Không thể cập nhật cài đặt bài kiểm tra.')
      )
    } finally {
      setSavingAssignmentId(null)
    }
  }

  if (loading) return <PageLoader label="Đang tải danh sách bài kiểm tra..." />

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-700 via-purple-700 to-blue-800 p-6 text-white shadow-md border-b-4 border-indigo-400">
        <div className="absolute right-0 top-0 h-48 w-48 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-white">Giảng viên</span>
              <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-sm">
                Quản lý bài kiểm tra
              </h1>
            </div>
            <p className="mt-1 text-xs font-semibold text-purple-100/90">
              Soạn đề thi, phân công cho các lớp học phần, đặt khung giờ, mật khẩu thi và theo dõi chấm điểm tự động AI
            </p>
          </div>

          <button
            onClick={() => navigate('/instructor/exercises/assessments/new')}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-indigo-900 shadow-md transition-all hover:bg-indigo-50 hover:shadow-lg active:scale-95"
          >
            <span className="text-base font-black">+</span> Tạo đề thi mới
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card flex items-center gap-4 p-4 border border-slate-200/80 shadow-sm bg-white">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <ExerciseIcon className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tổng đề thi</span>
            <p className="text-2xl font-black text-slate-800">{stats.totalExams}</p>
          </div>
        </div>

        <div className="card flex items-center gap-4 p-4 border border-slate-200/80 shadow-sm bg-white">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Ca thi đang mở</span>
            <p className="text-2xl font-black text-emerald-600">{stats.activeAssignments}</p>
          </div>
        </div>

        <div className="card flex items-center gap-4 p-4 border border-slate-200/80 shadow-sm bg-white">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tổng lượt gán lớp</span>
            <p className="text-2xl font-black text-slate-800">{stats.totalAssignments}</p>
          </div>
        </div>
      </div>

      {/* Toolbar Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Tìm theo tên đề thi hoặc tên lớp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      {filteredItems.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <ExerciseIcon className="h-7 w-7" />
          </div>
          <p className="mt-4 text-base font-bold text-slate-700">
            {searchQuery ? 'Không tìm thấy bài kiểm tra nào phù hợp' : 'Chưa có bài kiểm tra nào.'}
          </p>
          <button
            onClick={() => navigate('/instructor/exercises/assessments/new')}
            className="btn-primary mt-4 py-2 px-4 text-xs"
          >
            ＋ Tạo đề thi đầu tiên
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden border border-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/90 text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider">Thông tin đề thi</th>
                  <th className="px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider w-28">Thời lượng</th>
                  <th className="px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider w-24">Tổng điểm</th>
                  <th className="px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wider">Các ca thi / Lớp học phần đã gán</th>
                  <th className="px-4 py-3 text-right text-xs font-extrabold uppercase tracking-wider w-36">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="badge-blue shrink-0">KT</span>
                        <p className="font-extrabold text-slate-900 text-sm leading-snug">{item.title}</p>
                      </div>
                      {item.creatorUsername && (
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          Người tạo: <span className="text-slate-700">@{item.creatorUsername}</span>
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-slate-400">
                        Cập nhật: {formatDate(item.updatedAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-center font-extrabold text-slate-700 text-xs">
                      {item.durationMinutes} phút
                    </td>
                    <td className="px-4 py-3.5 text-center font-black text-indigo-700 text-sm">
                      {item.totalPoints}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="space-y-2">
                        {item.assignments.length === 0 ? (
                          <span className="inline-block text-xs font-semibold italic text-slate-400 bg-slate-50 px-2 py-1 rounded">
                            Chưa gán cho lớp nào
                          </span>
                        ) : (
                          item.assignments.map((assignment) => {
                            const timeBadge = assignmentTimeStatus(assignment.opensAt, assignment.closesAt)
                            return (
                              <div
                                key={assignment.id}
                                className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 transition-all hover:bg-slate-100/60"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-extrabold text-slate-800 text-xs">{assignment.sectionName}</p>
                                  <span className={timeBadge.className}>{timeBadge.label}</span>
                                </div>
                                <p className="mt-1 text-[11px] font-medium text-slate-600">
                                  {formatDate(assignment.opensAt)} – {formatDate(assignment.closesAt)}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/50 pt-1.5">
                                  <span className="text-[11px] font-bold text-slate-500">
                                    Lượt làm: {assignment.maxAttempts ?? 1}
                                  </span>
                                  {assignment.hasPassword && (
                                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                      🔒 Có mật khẩu
                                    </span>
                                  )}
                                  <Link
                                    to={`/instructor/assessment-assignments/${assignment.id}/submissions`}
                                    className="inline-flex items-center gap-1 text-xs font-extrabold text-indigo-600 hover:text-indigo-800 hover:underline ml-auto"
                                  >
                                    Xem bài nộp & Xuất Excel →
                                  </Link>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Link
                          to={`/instructor/exercises/assessments/${item.id}/edit`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600"
                          aria-label={`Sửa đề ${item.title}`}
                          title="Sửa nội dung đề thi"
                        >
                          <EditIcon className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => openSettings(item)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600"
                          aria-label={`Cài đặt thời gian ${item.title}`}
                          title="Cài đặt thời gian & mật khẩu ca thi"
                        >
                          <ConfigIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteAssessment(item)}
                          disabled={busyId === item.id}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition-colors hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`Xóa đề ${item.title}`}
                          title="Xóa đề thi"
                        >
                          {busyId === item.id ? <Spinner /> : <TrashIcon className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assessment-window-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingAssignmentId) setSettingsItem(null)
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <h2 id="assessment-window-title" className="font-bold text-slate-900">
                  Cài đặt ca thi cho các lớp
                </h2>
                <p className="text-xs text-slate-500 font-medium">{settingsItem.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsItem(null)}
                disabled={Boolean(savingAssignmentId)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
                aria-label="Đóng cài đặt"
              >
                ×
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              {windowDrafts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 font-medium">
                  Đề chưa được gán vào lớp nào. Hãy gán đề thi tại màn hình Chi tiết lớp học phần để thiết lập thời gian làm bài.
                </p>
              ) : (
                windowDrafts.map((draft) => (
                  <form
                    key={draft.id}
                    className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void saveAssignmentWindow(draft)
                    }}
                  >
                    <h3 className="font-extrabold text-slate-800 text-sm">{draft.sectionName}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label text-xs" htmlFor={`opens-at-${draft.id}`}>
                          Thời gian mở
                        </label>
                        <input
                          id={`opens-at-${draft.id}`}
                          type="datetime-local"
                          required
                          value={draft.opensAtInput}
                          onChange={(event) =>
                            updateWindowDraft(draft.id, 'opensAtInput', event.target.value)
                          }
                          className="input text-xs"
                        />
                      </div>
                      <div>
                        <label className="label text-xs" htmlFor={`closes-at-${draft.id}`}>
                          Thời gian đóng
                        </label>
                        <input
                          id={`closes-at-${draft.id}`}
                          type="datetime-local"
                          required
                          value={draft.closesAtInput}
                          onChange={(event) =>
                            updateWindowDraft(draft.id, 'closesAtInput', event.target.value)
                          }
                          className="input text-xs"
                        />
                      </div>
                      <div>
                        <label className="label text-xs" htmlFor={`duration-${draft.id}`}>
                          Thời gian làm bài (phút)
                        </label>
                        <input
                          id={`duration-${draft.id}`}
                          type="number"
                          min={1}
                          max={600}
                          step={1}
                          required
                          value={draft.durationMinutes}
                          onChange={(event) =>
                            updateDurationMinutes(draft.id, Number(event.target.value))
                          }
                          className="input text-xs"
                        />
                      </div>
                      <div>
                        <label className="label text-xs" htmlFor={`max-attempts-${draft.id}`}>
                          Số lần làm
                        </label>
                        <input
                          id={`max-attempts-${draft.id}`}
                          type="number"
                          min={1}
                          max={20}
                          step={1}
                          required
                          value={draft.maxAttempts}
                          onChange={(event) =>
                            updateMaxAttempts(draft.id, Number(event.target.value))
                          }
                          className="input text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label text-xs" htmlFor={`assessment-password-${draft.id}`}>
                          Mật khẩu vào thi (không bắt buộc)
                        </label>
                        <input
                          id={`assessment-password-${draft.id}`}
                          type="password"
                          minLength={4}
                          maxLength={100}
                          value={draft.password}
                          disabled={draft.clearPassword}
                          onChange={(event) =>
                            updateAssessmentPassword(draft.id, event.target.value)
                          }
                          className="input text-xs"
                          autoComplete="new-password"
                          placeholder={
                            draft.hasPassword
                              ? 'Để trống nếu giữ nguyên mật khẩu hiện tại'
                              : 'Để trống nếu không đặt mật khẩu'
                          }
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          {draft.clearPassword
                            ? 'Mật khẩu hiện tại sẽ được gỡ khi lưu.'
                            : draft.hasPassword
                            ? 'Đang bảo vệ bằng mật khẩu. Nhập giá trị mới nếu muốn thay đổi.'
                            : 'Sinh viên phải nhập đúng mật khẩu này trước khi vào thi.'}
                        </p>
                        {draft.hasPassword && (
                          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-rose-700">
                            <input
                              type="checkbox"
                              checked={draft.clearPassword}
                              onChange={(event) =>
                                updateClearPassword(draft.id, event.target.checked)
                              }
                              className="h-4 w-4 rounded border-slate-300 text-rose-600"
                            />
                            Gỡ mật khẩu hiện tại
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="submit"
                        className="btn-primary btn-sm text-xs font-bold"
                        disabled={Boolean(savingAssignmentId)}
                      >
                        {savingAssignmentId === draft.id ? (
                          <>
                            <Spinner /> Đang lưu...
                          </>
                        ) : (
                          'Lưu cài đặt'
                        )}
                      </button>
                    </div>
                  </form>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Instructor Assessment Management Page component */
export function AssessmentManagerPage() {
  return <AssessmentManagerPanel />
}
