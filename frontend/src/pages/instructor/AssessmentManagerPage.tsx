import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { readApiError } from '../../lib/apiError'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import type { InstructorAssessmentListItem } from '../../types/assessment'

function formatDate(value: string) {
  return new Date(value).toLocaleString('vi-VN')
}

export function AssessmentManagerPanel() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InstructorAssessmentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

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
                      <Link to={`/instructor/exercises/assessments/${item.id}/edit`} className="btn-secondary btn-sm">
                        Sửa đề
                      </Link>
                      <button
                        type="button"
                        onClick={() => void deleteAssessment(item)}
                        disabled={busyId === item.id}
                        className="btn-danger btn-sm"
                      >
                        {busyId === item.id ? 'Đang xóa...' : 'Xóa'}
                      </button>
                    </div>
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

/** Keep old bookmarks working while management now lives inside the Exercise screen. */
export function AssessmentManagerPage() {
  return <Navigate to="/instructor/exercises?tab=assessments" replace />
}
