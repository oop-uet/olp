import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface StudentInfo {
  userId: string
  studentId: string
  username: string
  fullName: string
  email: string
}

interface SectionInfo {
  id: string
  name: string
  semester: string
}

interface Summary {
  rank: number
  attemptedExercises: number
  completedExercises: number
  attemptCount: number
  totalScore: number
  totalPossible: number
  completionPercent: number
}

interface SubmissionRow {
  id: string
  exerciseId: string
  exerciseTitle: string
  score: number | null
  manualScore: number | null
  effectiveScore: number
  attemptNumber: number
  submittedAt: string
  status: 'finished' | 'submitted'
}

interface ExerciseProgress {
  exerciseId: string
  title: string
  week: number | null
  bestScore: number
  attemptCount: number
  lastSubmittedAt: string | null
  status: 'completed' | 'in_progress' | 'not_started'
}

interface ProfileResponse {
  section: SectionInfo
  student: StudentInfo
  summary: Summary
  submissions: SubmissionRow[]
  progress: ExerciseProgress[]
}

function formatTimestamp(ts: string) {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function dateKey(ts: string) {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts.slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function getStatusLabel(status: SubmissionRow['status'], score: number) {
  if (score >= 100) return { label: 'Finished', className: 'badge-green' }
  return status === 'finished'
    ? { label: 'Finished', className: 'badge-green' }
    : { label: 'Submitted', className: 'badge-yellow' }
}

export function InstructorStudentProfilePage() {
  const { id, studentId } = useParams<{ id: string; studentId: string }>()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id && studentId) fetchProfile(id, studentId)
  }, [id, studentId])

  async function fetchProfile(sectionId: string, studentUserId: string) {
    setLoading(true)
    try {
      const response = await api.get(`/api/instructor/sections/${sectionId}/students/${studentUserId}/profile`)
      setProfile(response.data)
    } catch {
      toast.error('Không thể tải hồ sơ sinh viên.')
    } finally {
      setLoading(false)
    }
  }

  const activity = useMemo(() => {
    const byDate = new Map<string, { count: number; bestScore: number }>()
    for (const submission of profile?.submissions ?? []) {
      const key = dateKey(submission.submittedAt)
      const current = byDate.get(key) ?? { count: 0, bestScore: 0 }
      byDate.set(key, {
        count: current.count + 1,
        bestScore: Math.max(current.bestScore, submission.effectiveScore),
      })
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, value]) => ({ date, ...value }))
  }, [profile])

  if (loading) return <PageLoader label="Đang tải hồ sơ sinh viên..." />

  if (!profile) {
    return (
      <div className="card p-12 text-center text-slate-500">
        Không tìm thấy hồ sơ sinh viên.
      </div>
    )
  }

  const { student, section, summary, submissions, progress } = profile
  const completed = progress.filter((item) => item.status === 'completed').length
  const attempted = progress.filter((item) => item.attemptCount > 0 && item.status !== 'completed').length
  const notStarted = Math.max(0, progress.length - completed - attempted)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5 rounded border-b border-slate-100 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
        <Link to="/instructor/classes" className="text-primary hover:underline">Trang chủ</Link>
        <span>/</span>
        <Link to="/instructor/statistic" className="text-primary hover:underline">Thống kê</Link>
        <span>/</span>
        <span className="text-slate-400">{student.fullName}</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-primary-800 to-primary p-5 text-white">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/40 bg-white/20 text-2xl font-black">
                  {student.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-black">{student.fullName}</h1>
                  <p className="mt-1 text-sm font-bold text-primary-100">MSV: {student.studentId}</p>
                  <p className="text-sm font-semibold text-primary-100">Lớp: {section.name}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-200 p-4 text-center">
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Điểm</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{summary.totalScore.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Hạng</p>
                <p className="mt-1 text-2xl font-black text-slate-900">#{summary.rank}</p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-primary-800 to-primary px-4 py-3 text-white">
              <h2 className="text-sm font-black uppercase tracking-wide">Mức độ hoàn thành</h2>
            </div>
            <div className="p-5">
              <CompletionDonut percent={summary.completionPercent} />
              <div className="mt-5 space-y-2 text-sm">
                <Legend color="bg-emerald-500" label={`Hoàn thành: ${completed}`} />
                <Legend color="bg-amber-400" label={`Đã nộp chưa đạt: ${attempted}`} />
                <Legend color="bg-rose-400" label={`Chưa làm: ${notStarted}`} />
              </div>
            </div>
          </div>
        </aside>

        <main className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-primary-800 to-primary px-5 py-4 text-white">
              <h2 className="text-sm font-black uppercase tracking-wide">Danh sách bài nộp</h2>
            </div>
            <div className="overflow-x-auto p-5">
              {submissions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Sinh viên chưa có bài nộp.</p>
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-300 text-xs font-black uppercase text-slate-700">
                      <th className="px-3 py-3 w-28">#</th>
                      <th className="px-3 py-3">Tên bài tập</th>
                      <th className="px-3 py-3 w-48">Thời gian nộp</th>
                      <th className="px-3 py-3 text-center w-24">Điểm</th>
                      <th className="px-3 py-3 text-center w-28">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {submissions.map((submission) => {
                      const status = getStatusLabel(submission.status, submission.effectiveScore)
                      return (
                        <tr key={submission.id} className="hover:bg-slate-50">
                          <td className="px-3 py-3 font-bold text-primary">{submission.id.slice(0, 8)}</td>
                          <td className="px-3 py-3 font-semibold text-slate-700">{submission.exerciseTitle}</td>
                          <td className="px-3 py-3 text-slate-500">{formatTimestamp(submission.submittedAt)}</td>
                          <td className="px-3 py-3 text-center font-bold">{submission.effectiveScore.toFixed(1)}/100</td>
                          <td className="px-3 py-3 text-center">
                            <span className={status.className}>{status.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Biểu đồ nộp bài</p>
                <h2 className="text-2xl font-black text-slate-900">Hoạt động gần đây</h2>
              </div>
              <p className="text-sm font-bold text-primary">{submissions.length} lượt nộp</p>
            </div>
            <ActivityChart data={activity} />
          </div>
        </main>
      </div>
    </div>
  )
}

function CompletionDonut({ percent }: { percent: number }) {
  const radius = 58
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, percent) / 100) * circumference
  return (
    <div className="flex items-center justify-center">
      <svg width="170" height="170" viewBox="0 0 170 170" role="img" aria-label={`Hoàn thành ${percent.toFixed(1)}%`}>
        <circle cx="85" cy="85" r={radius} fill="none" stroke="#f43f5e" strokeWidth="22" />
        <circle
          cx="85"
          cy="85"
          r={radius}
          fill="none"
          stroke="#0ea5a4"
          strokeWidth="22"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 85 85)"
        />
        <text x="85" y="80" textAnchor="middle" className="fill-slate-900 text-2xl font-black">
          {percent.toFixed(1)}%
        </text>
        <text x="85" y="104" textAnchor="middle" className="fill-slate-400 text-xs font-bold">
          hoàn thành
        </text>
      </svg>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 font-semibold text-slate-600">
      <span className={`h-3 w-8 rounded ${color}`} />
      <span>{label}</span>
    </div>
  )
}

function ActivityChart({ data }: { data: Array<{ date: string; count: number; bestScore: number }> }) {
  const maxCount = Math.max(1, ...data.map((item) => item.count))
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu để vẽ biểu đồ.</p>
  }

  return (
    <div className="mt-6 flex h-72 items-end gap-3 border-l border-b border-slate-300 px-4 pb-8 pt-4">
      {data.map((item) => {
        const height = Math.max(12, (item.count / maxCount) * 210)
        return (
          <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-56 items-end">
              <div
                className="w-8 rounded-t-md bg-primary shadow-sm"
                style={{ height }}
                title={`${item.date}: ${item.count} lượt, điểm tốt nhất ${item.bestScore.toFixed(1)}`}
              />
            </div>
            <span className="-rotate-45 whitespace-nowrap text-[10px] font-bold text-slate-400">
              {item.date.slice(5)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
