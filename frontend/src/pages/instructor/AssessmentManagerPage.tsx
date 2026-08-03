import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
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

interface AssignmentWindowDraft extends AssessmentAssignmentSummary {
  opensAtInput: string
  closesAtInput: string
  durationMinutes: number
}

export function AssessmentManagerPanel() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InstructorAssessmentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [settingsItem, setSettingsItem] = useState<InstructorAssessmentListItem | null>(null)
  const [windowDrafts, setWindowDrafts] = useState<AssignmentWindowDraft[]>([])
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!settingsItem) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingAssignmentId) setSettingsItem(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [savingAssignmentId, settingsItem])

  async function load() {
    setLoading(true)
    try {
      const assessmentResponse = await api.get('/api/instructor/assessments')
      setItems(assessmentResponse.data.data ?? [])
    } catch {
      toast.error('Không thể tải danh sách bài kiểm tra.')
    } finally {
      setLoading(false)
    }
  }

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
    setWindowDrafts(
      item.assignments.map((assignment) => ({
        ...assignment,
        durationMinutes: assignment.durationMinutes ?? item.durationMinutes,
        maxAttempts: assignment.maxAttempts ?? 1,
        opensAtInput: isoToLocalInput(assignment.opensAt),
        closesAtInput: isoToLocalInput(assignment.closesAt),
      }))
    )
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

    setSavingAssignmentId(draft.id)
    try {
      await api.put(`/api/instructor/assessments/assignments/${draft.id}/window`, {
        opensAt,
        closesAt,
        durationMinutes: draft.durationMinutes,
        maxAttempts: draft.maxAttempts,
      })
      setItems((current) =>
        current.map((item) =>
          item.id !== settingsItem?.id
            ? item
            : {
                ...item,
                assignments: item.assignments.map((assignment) =>
                  assignment.id === draft.id
                    ? {
                        ...assignment,
                        opensAt,
                        closesAt,
                        durationMinutes: draft.durationMinutes,
                        maxAttempts: draft.maxAttempts,
                      }
                    : assignment
                ),
              }
        )
      )
      setSettingsItem((current) =>
        current
          ? {
              ...current,
              assignments: current.assignments.map((assignment) =>
                assignment.id === draft.id
                  ? {
                      ...assignment,
                      opensAt,
                      closesAt,
                      durationMinutes: draft.durationMinutes,
                      maxAttempts: draft.maxAttempts,
                    }
                  : assignment
              ),
            }
          : current
      )
      toast.success(`Đã cập nhật cài đặt cho lớp ${draft.sectionName}.`)
      await load()
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể cập nhật thời gian bài kiểm tra.')
    } finally {
      setSavingAssignmentId(null)
    }
  }

  if (loading) return <PageLoader label="Đang tải bài kiểm tra..." />

  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <div className="card flex flex-col items-center p-12 text-center">
          <ExerciseIcon className="h-12 w-12 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-600">Chưa có bài kiểm tra nào.</p>
          <button onClick={() => navigate('/instructor/exercises/assessments/new')} className="btn-primary mt-4">
            Tạo đề đầu tiên
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">Tên đề</th>
                <th className="table-th">Thời lượng</th>
                <th className="table-th">Tổng điểm</th>
                <th className="table-th">Lớp đã gán</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="align-top hover:bg-slate-50/70">
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <span className="badge-blue">KT</span>
                      <p className="font-bold text-slate-900">{item.title}</p>
                    </div>
                    {item.creatorUsername && (
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">Người ra đề: @{item.creatorUsername}</p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-400">
                      Cập nhật {formatDate(item.updatedAt)}
                    </p>
                  </td>
                  <td className="table-td">{item.durationMinutes} phút</td>
                  <td className="table-td font-bold">{item.totalPoints}</td>
                  <td className="table-td">
                    <div className="space-y-2">
                      {item.assignments.length === 0 && <span className="text-slate-400">Chưa gán</span>}
                      {item.assignments.map((assignment) => (
                        <div key={assignment.id} className="rounded-lg border border-slate-200 p-2">
                          <p className="font-semibold text-slate-700">{assignment.sectionName}</p>
                          <p className="text-[11px] text-slate-500">
                            {formatDate(assignment.opensAt)} - {formatDate(assignment.closesAt)}
                          </p>
                          <p className="text-[11px] font-semibold text-slate-500">
                            Tối đa {assignment.maxAttempts ?? 1} lượt làm
                          </p>
                          <Link
                            to={`/instructor/assessment-assignments/${assignment.id}/submissions`}
                            className="mt-1 inline-block text-xs font-bold text-primary hover:underline"
                          >
                            Xem bài nộp
                          </Link>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="table-td">
                    <div className="flex justify-end gap-2">
                      <Link
                        to={`/instructor/exercises/assessments/${item.id}/edit`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-primary/40 hover:bg-primary-50 hover:text-primary"
                        aria-label={`Sửa đề ${item.title}`}
                        title="Sửa đề"
                      >
                        <EditIcon className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => openSettings(item)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-primary/40 hover:bg-primary-50 hover:text-primary"
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
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 id="assessment-window-title" className="font-bold text-slate-900">
                Cài đặt bài kiểm tra
              </h2>
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
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  Đề chưa được gán vào lớp. Hãy gán đề tại màn hình Phân bài theo tuần trước khi đặt thời gian.
                </p>
              ) : (
                windowDrafts.map((draft) => (
                  <form
                    key={draft.id}
                    className="rounded-xl border border-slate-200 p-4"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void saveAssignmentWindow(draft)
                    }}
                  >
                    <h3 className="font-bold text-slate-800">{draft.sectionName}</h3>
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
                        <p className="mt-1 text-xs text-slate-500">Mặc định 1, tối đa 20 lượt.</p>
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

/** Keep old bookmarks working while management now lives inside the Exercise screen. */
export function AssessmentManagerPage() {
  return <Navigate to="/instructor/exercises?tab=assessments" replace />
}
