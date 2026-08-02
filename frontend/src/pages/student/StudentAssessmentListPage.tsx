import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import type { StudentAssessmentListItem } from '../../types/assessment'

function timeStatus(item: StudentAssessmentListItem) {
  const now = Date.now()
  if (now < new Date(item.opensAt).getTime()) return { label: 'Sắp mở', className: 'badge-blue' }
  if (now >= new Date(item.closesAt).getTime()) return { label: 'Đã đóng', className: 'badge-gray' }
  return { label: 'Đang mở', className: 'badge-green' }
}

function sessionStatus(item: StudentAssessmentListItem) {
  if (!item.session) return null
  if (item.session.reviewStatus === 'official') return { label: 'Đã có điểm chính thức', className: 'badge-green' }
  if (item.session.reviewStatus === 'pending_review') {
    return item.session.predictedScore !== null
      ? { label: 'Có điểm dự kiến', className: 'badge-yellow' }
      : { label: 'Chờ giảng viên chấm', className: 'badge-yellow' }
  }
  if (['ai_queued', 'ai_running'].includes(item.session.reviewStatus)) return { label: 'AI đang chấm', className: 'badge-blue' }
  return { label: 'Đang làm', className: 'badge-yellow' }
}

export function StudentAssessmentListPage() {
  const [items, setItems] = useState<StudentAssessmentListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      const response = await api.get('/api/students/assessments')
      setItems(response.data.data ?? [])
    } catch {
      toast.error('Không thể tải danh sách bài kiểm tra.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <PageLoader label="Đang tải bài kiểm tra..." />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bài kiểm tra</h1>
      </div>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center p-12 text-center">
          <ExerciseIcon className="h-12 w-12 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-600">Chưa có bài kiểm tra nào được giao.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => {
            const availability = timeStatus(item)
            const progress = sessionStatus(item)
            return (
              <Link
                key={item.id}
                to={`/student/assessments/${item.id}`}
                className="card group border-l-4 border-l-secondary p-5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-secondary">{item.sectionName}</p>
                    <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-slate-900 group-hover:text-primary">
                      <span className="badge-blue">KT</span>
                      <span>{item.title}</span>
                    </h2>
                  </div>
                  <span className={availability.className}>{availability.label}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <div><span className="text-xs text-slate-400">Thời lượng</span><p className="font-bold">{item.durationMinutes} phút</p></div>
                  <div><span className="text-xs text-slate-400">Tổng điểm</span><p className="font-bold">{item.totalPoints}</p></div>
                  <div className="col-span-2"><span className="text-xs text-slate-400">Thời gian thi</span><p className="font-semibold">{new Date(item.opensAt).toLocaleString('vi-VN')} - {new Date(item.closesAt).toLocaleString('vi-VN')}</p></div>
                </div>
                {progress && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    <span className={progress.className}>{progress.label}</span>
                    <div className="text-right text-sm">
                      {item.session?.officialScore !== null ? (
                        <strong className="text-emerald-700">Chính thức: {item.session?.officialScore}/{item.totalPoints}</strong>
                      ) : item.session?.predictedScore !== null ? (
                        <strong className="text-blue-700">Dự kiến: {item.session?.predictedScore}/{item.totalPoints}</strong>
                      ) : (
                        <span className="text-slate-500">Chưa có điểm</span>
                      )}
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
