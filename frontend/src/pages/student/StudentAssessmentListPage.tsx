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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-cyan-700 to-blue-800 p-6 text-white shadow-md border-b-4 border-secondary">
        <div className="absolute right-0 top-0 h-40 w-40 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-xl pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-2xl font-black tracking-tight">Bài kiểm tra</h1>
          <p className="mt-1 text-xs font-semibold text-cyan-100/90">Danh sách các bài kiểm tra được giao theo lớp học phần</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center p-12 text-center border border-slate-100 shadow-sm">
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
                className="card group border-l-4 border-l-cyan-500 bg-cyan-50/10 p-5 transition hover:-translate-y-0.5 hover:shadow-md hover:bg-cyan-50/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">{item.sectionName}</p>
                    <h2 className="mt-1 flex flex-wrap items-center gap-2 text-base font-extrabold text-slate-900 group-hover:text-primary transition-colors">
                      <span>{item.title}</span>
                      <span className="inline-flex items-center rounded-md bg-cyan-500 px-2 py-0.5 text-[10px] font-black text-white shadow-2xs">KT</span>
                    </h2>
                  </div>
                  <span className={availability.className}>{availability.label}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <div><span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Thời lượng</span><p className="font-bold text-slate-800">{item.durationMinutes} phút</p></div>
                  <div><span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng điểm</span><p className="font-bold text-slate-800">{item.totalPoints}</p></div>
                  <div className="col-span-2"><span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Thời gian thi</span><p className="font-semibold text-slate-700">{new Date(item.opensAt).toLocaleString('vi-VN')} - {new Date(item.closesAt).toLocaleString('vi-VN')}</p></div>
                </div>
                {progress && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                    <span className={progress.className}>{progress.label}</span>
                    <div className="text-right text-sm">
                      {item.session?.officialScore !== null ? (
                        <strong className="text-emerald-700 font-extrabold">Chính thức: {item.session?.officialScore}/{item.totalPoints}</strong>
                      ) : item.session?.predictedScore !== null ? (
                        <strong className="text-cyan-700 font-extrabold">Dự kiến: {item.session?.predictedScore}/{item.totalPoints}</strong>
                      ) : (
                        <span className="text-slate-400 font-semibold">Chưa có điểm</span>
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
