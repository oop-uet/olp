import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { readApiError } from '../../lib/apiError'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import type { InstructorAssessmentListItem } from '../../types/assessment'

interface SectionOption {
  id: string
  name: string
  semester: string
}

interface ScheduleDraft {
  sectionId: string
  opensAt: string
  closesAt: string
  durationMinutes: number
  requireFullscreen: boolean
  showPredictedScore: boolean
}

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function defaultSchedule(durationMinutes: number): ScheduleDraft {
  const opens = new Date(Date.now() + 60 * 60_000)
  const closes = new Date(opens.getTime() + Math.max(durationMinutes + 30, 120) * 60_000)
  return {
    sectionId: '',
    opensAt: toLocalInput(opens),
    closesAt: toLocalInput(closes),
    durationMinutes,
    requireFullscreen: true,
    showPredictedScore: true,
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('vi-VN')
}

export function AssessmentManagerPanel() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InstructorAssessmentListItem[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<ScheduleDraft>(defaultSchedule(90))

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [assessmentResponse, sectionResponse] = await Promise.all([
        api.get('/api/instructor/assessments'),
        api.get('/api/instructor/sections'),
      ])
      setItems(assessmentResponse.data.data ?? [])
      setSections(sectionResponse.data ?? [])
    } catch {
      toast.error('Không thể tải danh sách bài kiểm tra.')
    } finally {
      setLoading(false)
    }
  }

  async function publish(item: InstructorAssessmentListItem) {
    if (!window.confirm('Phát hành sẽ khóa nội dung đề. Bạn muốn tiếp tục?')) return
    setBusyId(item.id)
    try {
      await api.post(`/api/instructor/assessments/${item.id}/publish`)
      toast.success('Đã phát hành bài kiểm tra.')
      await load()
    } catch (error: unknown) {
      const details = readApiError(error).details
      toast.error(Array.isArray(details) ? details[0] : 'Không thể phát hành đề.')
    } finally {
      setBusyId(null)
    }
  }

  function openSchedule(item: InstructorAssessmentListItem) {
    setSchedulingId(item.id)
    setSchedule(defaultSchedule(item.durationMinutes))
  }

  async function assign() {
    if (!schedulingId || !schedule.sectionId) {
      toast.error('Vui lòng chọn lớp học phần.')
      return
    }
    setBusyId(schedulingId)
    try {
      await api.post(`/api/instructor/assessments/${schedulingId}/assign`, {
        ...schedule,
        opensAt: new Date(schedule.opensAt).toISOString(),
        closesAt: new Date(schedule.closesAt).toISOString(),
      })
      toast.success('Đã gán lịch thi cho lớp.')
      setSchedulingId(null)
      await load()
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể gán bài kiểm tra.')
    } finally {
      setBusyId(null)
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
                <th className="table-th">Trạng thái</th>
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
                    <p className="mt-1 text-[11px] text-slate-400">
                      Cập nhật {formatDate(item.updatedAt)}
                    </p>
                  </td>
                  <td className="table-td">{item.durationMinutes} phút</td>
                  <td className="table-td font-bold">{item.totalPoints}</td>
                  <td className="table-td">
                    <span className={item.status === 'published' ? 'badge-green' : 'badge-yellow'}>
                      {item.status === 'published' ? 'Đã phát hành' : 'Bản nháp'}
                    </span>
                  </td>
                  <td className="table-td">
                    <div className="space-y-2">
                      {item.assignments.length === 0 && <span className="text-slate-400">Chưa gán</span>}
                      {item.assignments.map((assignment) => (
                        <div key={assignment.id} className="rounded-lg border border-slate-200 p-2">
                          <p className="font-semibold text-slate-700">{assignment.sectionName}</p>
                          <p className="text-[11px] text-slate-500">
                            {formatDate(assignment.opensAt)} - {formatDate(assignment.closesAt)}
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
                      {item.status === 'draft' && (
                        <>
                          <Link to={`/instructor/exercises/assessments/${item.id}/edit`} className="btn-secondary btn-sm">
                            Sửa đề
                          </Link>
                          <button
                            onClick={() => void publish(item)}
                            disabled={busyId === item.id}
                            className="btn-primary btn-sm"
                          >
                            Phát hành
                          </button>
                        </>
                      )}
                      {item.status === 'published' && (
                        <button onClick={() => openSchedule(item)} className="btn-primary btn-sm">
                          Gán lịch thi
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {schedulingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Gán lịch bài kiểm tra</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="label">Lớp học phần</span>
                <select
                  className="input mt-1"
                  value={schedule.sectionId}
                  onChange={(event) => setSchedule((value) => ({ ...value, sectionId: event.target.value }))}
                >
                  <option value="">Chọn lớp</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name} - {section.semester}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Mở lúc</span>
                <input
                  type="datetime-local"
                  className="input mt-1"
                  value={schedule.opensAt}
                  onChange={(event) => setSchedule((value) => ({ ...value, opensAt: event.target.value }))}
                />
              </label>
              <label>
                <span className="label">Đóng lúc</span>
                <input
                  type="datetime-local"
                  className="input mt-1"
                  value={schedule.closesAt}
                  onChange={(event) => setSchedule((value) => ({ ...value, closesAt: event.target.value }))}
                />
              </label>
              <label>
                <span className="label">Thời lượng (phút)</span>
                <input
                  type="number"
                  min={1}
                  max={600}
                  className="input mt-1"
                  value={schedule.durationMinutes}
                  onChange={(event) =>
                    setSchedule((value) => ({ ...value, durationMinutes: Number(event.target.value) }))
                  }
                />
              </label>
              <div className="space-y-3 pt-6">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={schedule.requireFullscreen}
                    onChange={(event) =>
                      setSchedule((value) => ({ ...value, requireFullscreen: event.target.checked }))
                    }
                  />
                  Yêu cầu toàn màn hình
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={schedule.showPredictedScore}
                    onChange={(event) =>
                      setSchedule((value) => ({ ...value, showPredictedScore: event.target.checked }))
                    }
                  />
                  Hiện điểm dự kiến sau khi AI chấm
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setSchedulingId(null)} className="btn-secondary">
                Hủy
              </button>
              <button onClick={() => void assign()} disabled={busyId === schedulingId} className="btn-primary">
                {busyId === schedulingId ? 'Đang gán...' : 'Gán bài kiểm tra'}
              </button>
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
