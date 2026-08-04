import { useCallback, useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { readApiError } from '../../lib/apiError'
import { ConfigIcon, EditIcon, ExerciseIcon, PageLoader, Spinner, TrashIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import type { AssessmentAssignmentSummary, InstructorAssessmentListItem } from '../../types/assessment'

function formatDate(value: string) {
  return new Date(value).toLocaleString('vi-VN')
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
  if (now < openTime) return { label: 'SẮP MỞ', className: 'badge-blue' }
  if (now >= closeTime) return { label: 'ĐÃ ĐÓNG', className: 'badge-gray' }
  return { label: 'ĐANG MỞ', className: 'badge-green' }
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

  if (loading) return <PageLoader label="Đang tải bài kiểm tra..." />

  return (
    <div className="space-y-6">
      {/* Page Header - Clean System Style */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-800">Quản lý bài kiểm tra</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate('/instructor/exercises/assessments/new')}
            className="btn-primary"
          >
            Tạo bài kiểm tra
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input max-w-sm"
            placeholder="Tìm theo tiêu đề đề thi hoặc tên lớp..."
          />
        </div>
      )}

      {/* Main Table Content */}
      {filteredItems.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <ExerciseIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">
            {searchQuery ? 'Không tìm thấy bài kiểm tra nào.' : 'Chưa có bài kiểm tra nào.'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => navigate('/instructor/exercises/assessments/new')}
              className="btn-primary btn-sm mt-4"
            >
              Tạo bài kiểm tra đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Thông tin đề thi</th>
                <th className="table-th">Thời lượng</th>
                <th className="table-th">Tổng điểm</th>
                <th className="table-th">Các ca thi / Lớp học phần đã gán</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredItems.map((item) => (
                <tr key={item.id} className="align-top hover:bg-gray-50/70 transition-colors">
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <span className="badge-blue shrink-0">KT</span>
                      <p className="font-bold text-gray-900">{item.title}</p>
                    </div>
                    {item.creatorUsername && (
                      <p className="mt-1 text-[11px] font-semibold text-gray-500">
                        Người tạo: @{item.creatorUsername}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-gray-400">
                      Cập nhật {formatDate(item.updatedAt)}
                    </p>
                  </td>
                  <td className="table-td font-medium text-gray-700">{item.durationMinutes} phút</td>
                  <td className="table-td font-bold text-primary">{item.totalPoints}</td>
                  <td className="table-td">
                    <div className="space-y-2">
                      {item.assignments.length === 0 ? (
                        <span className="text-gray-400 text-xs italic">Chưa gán cho lớp nào</span>
                      ) : (
                        item.assignments.map((assignment) => {
                          const timeBadge = assignmentTimeStatus(assignment.opensAt, assignment.closesAt)
                          return (
                            <div
                              key={assignment.id}
                              className="rounded-lg border border-gray-200 bg-gray-50/50 p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-gray-800 text-xs">{assignment.sectionName}</p>
                                <span className={timeBadge.className}>{timeBadge.label}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-gray-500">
                                {formatDate(assignment.opensAt)} - {formatDate(assignment.closesAt)}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-1.5">
                                <span className="text-[11px] font-medium text-gray-600">
                                  Lượt làm: {assignment.maxAttempts ?? 1}
                                </span>
                                {assignment.hasPassword && (
                                  <span className="text-[11px] font-semibold text-amber-700">
                                    🔒 Có mật khẩu
                                  </span>
                                )}
                                <Link
                                  to={`/instructor/assessment-assignments/${assignment.id}/submissions`}
                                  className="inline-block text-xs font-bold text-primary hover:underline ml-auto"
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
                  <td className="table-td">
                    <div className="flex justify-end gap-2">
                      <Link
                        to={`/instructor/exercises/assessments/${item.id}/edit`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-primary/40 hover:bg-primary-50 hover:text-primary"
                        aria-label={`Sửa đề ${item.title}`}
                        title="Sửa đề"
                      >
                        <EditIcon className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => openSettings(item)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-primary/40 hover:bg-primary-50 hover:text-primary"
                        aria-label={`Cài đặt thời gian ${item.title}`}
                        title="Cài đặt bài kiểm tra"
                      >
                        <ConfigIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteAssessment(item)}
                        disabled={busyId === item.id}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`Xóa đề ${item.title}`}
                        title="Xóa đề"
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
      )}

      {/* Settings Modal */}
      {settingsItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assessment-window-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingAssignmentId) setSettingsItem(null)
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-gray-50 px-5 py-4">
              <h2 id="assessment-window-title" className="font-bold text-gray-900">
                Cài đặt bài kiểm tra
              </h2>
              <button
                type="button"
                onClick={() => setSettingsItem(null)}
                disabled={Boolean(savingAssignmentId)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-xl text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50"
                aria-label="Đóng cài đặt"
              >
                ×
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              {windowDrafts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
                  Đề chưa được gán vào lớp. Hãy gán đề tại màn hình Phân bài theo tuần trước khi đặt thời gian.
                </p>
              ) : (
                windowDrafts.map((draft) => (
                  <form
                    key={draft.id}
                    className="rounded-xl border border-gray-200 p-4"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void saveAssignmentWindow(draft)
                    }}
                  >
                    <h3 className="font-bold text-gray-800">{draft.sectionName}</h3>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor={`opens-at-${draft.id}`}>
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
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`closes-at-${draft.id}`}>
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
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`duration-${draft.id}`}>
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
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`max-attempts-${draft.id}`}>
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
                          className="input"
                        />
                        <p className="mt-1 text-xs text-gray-500">Mặc định 1, tối đa 20 lượt.</p>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label" htmlFor={`assessment-password-${draft.id}`}>
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
                          className="input"
                          autoComplete="new-password"
                          placeholder={
                            draft.hasPassword
                              ? 'Để trống nếu không đổi mật khẩu hiện tại'
                              : 'Để trống nếu không yêu cầu mật khẩu'
                          }
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          {draft.clearPassword
                            ? 'Mật khẩu hiện tại sẽ được gỡ khi lưu.'
                            : draft.hasPassword
                            ? 'Đang bảo vệ bằng mật khẩu. Nhập giá trị mới nếu muốn thay đổi.'
                            : 'Sinh viên sẽ phải nhập mật khẩu này trước khi bắt đầu lượt làm.'}
                        </p>
                        {draft.hasPassword && (
                          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-red-700">
                            <input
                              type="checkbox"
                              checked={draft.clearPassword}
                              onChange={(event) =>
                                updateClearPassword(draft.id, event.target.checked)
                              }
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            Gỡ mật khẩu hiện tại
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="submit"
                        className="btn-primary btn-sm"
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
