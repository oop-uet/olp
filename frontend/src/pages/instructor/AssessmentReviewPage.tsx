import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { readApiError } from '../../lib/apiError'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface RubricItem { id: string; criterion: string; points: number }
interface AiCriterion { criterionId: string; awardedPoints: number; evidence: string }
interface ReviewAnswer {
  id: string
  questionId: string
  answer: Record<string, unknown>
  aiSuggestedPoints: number | null
  finalPoints: number | null
  aiFeedback: string | null
  finalFeedback: string | null
  aiConfidence: 'low' | 'medium' | 'high' | null
  gradingState: string
  autoPoints: number | null
  aiCriteria: AiCriterion[]
  aiFlags: string[]
  latestAiRun: {
    id: string
    status: string
    provider: string | null
    model: string | null
    needsHumanAttention: boolean
    errorCode: string | null
    errorMessage: string | null
  } | null
  question: {
    id: string
    type: string
    prompt: string
    points: number
    gradingMode: string
    options: Array<{ id: string; content: string }>
    referenceAnswer: string
    gradingPrompt: string
    rubric: RubricItem[]
  }
}
interface ReviewData {
  session: {
    id: string
    assignmentId: string
    autoScore: number
    predictedScore: number | null
    officialScore: number | null
    reviewStatus: string
    attemptNumber: number
  }
  assessment: { title: string; totalPoints: number }
  student: { username: string; fullName?: string | null }
  answers: ReviewAnswer[]
  integrityEvents?: Array<{
    id: string
    eventType: string
    occurredAt: string
    metadata: Record<string, unknown>
  }>
}

const integrityEventLabels: Record<string, string> = {
  fullscreen_exit: 'Thoát toàn màn hình',
  visibility_hidden: 'Chuyển tab / thu nhỏ / chuyển ứng dụng',
  window_blur: 'Cửa sổ mất focus',
  devtools_open: 'Phím tắt mở DevTools',
  copy_attempt: 'Thử copy/cắt',
  paste_attempt: 'Thử paste',
  context_menu: 'Thử mở menu chuột phải',
}

function answerText(answer: ReviewAnswer) {
  if (typeof answer.answer.text === 'string') return answer.answer.text
  if (typeof answer.answer.code === 'string') return answer.answer.code
  if (typeof answer.answer.value === 'boolean') return answer.answer.value ? 'Đúng' : 'Sai'
  if (typeof answer.answer.optionId === 'string') {
    return answer.question.options.find((option) => option.id === answer.answer.optionId)?.content ?? 'Không xác định'
  }
  return 'Không trả lời'
}

export function AssessmentReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [data, setData] = useState<ReviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [draftScores, setDraftScores] = useState<Record<string, { points: number; feedback: string; reason: string }>>({})

  const load = useCallback(async (showLoader = true) => {
    if (!sessionId) return
    if (showLoader) setLoading(true)
    try {
      const response = await api.get(`/api/instructor/assessments/sessions/${sessionId}/review`)
      const next: ReviewData = response.data.data
      setData(next)
      setDraftScores((current) =>
        Object.fromEntries(
          next.answers.map((answer) => [
            answer.id,
            current[answer.id] ?? {
              points: answer.finalPoints ?? answer.aiSuggestedPoints ?? 0,
              feedback: answer.finalFeedback ?? answer.aiFeedback ?? '',
              reason: '',
            },
          ])
        )
      )
    } catch {
      toast.error('Không thể tải bài để chấm.')
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const hasRunningAi = data?.answers.some((answer) =>
      ['queued', 'running'].includes(answer.latestAiRun?.status ?? '')
    )
    if (!hasRunningAi) return
    const timer = window.setInterval(() => void load(false), 4000)
    return () => window.clearInterval(timer)
  }, [data, load])

  const subjective = useMemo(
    () => data?.answers.filter((answer) => answer.question.gradingMode !== 'auto') ?? [],
    [data]
  )

  async function review(answer: ReviewAnswer, decision: 'accept' | 'adjust' | 'manual') {
    const form = draftScores[answer.id]
    setBusyId(answer.id)
    try {
      const response = await api.put(`/api/instructor/assessments/answers/${answer.id}/review`, {
        decision,
        ...(decision === 'accept' ? {} : { points: form?.points ?? 0, feedback: form?.feedback ?? '' }),
        adjustmentReason: form?.reason || undefined,
      })
      const next: ReviewData = response.data.data
      setData(next)
      toast.success(decision === 'accept' ? 'Đã chấp nhận điểm dự kiến.' : 'Đã lưu điểm giảng viên.')
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể lưu điểm.')
    } finally {
      setBusyId(null)
    }
  }

  async function retryAi(answer: ReviewAnswer) {
    setBusyId(answer.id)
    try {
      await api.post(`/api/instructor/assessments/answers/${answer.id}/ai-grade`)
      toast.success('Đã xếp hàng chấm lại bằng AI.')
      await load(false)
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể chấm lại bằng AI.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageLoader label="Đang tải bài tự luận..." />
  if (!data) return <div className="card p-8 text-center text-slate-500">Không tìm thấy bài nộp.</div>
  const integrityEvents = data.integrityEvents ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to={`/instructor/assessment-assignments/${data.session.assignmentId}/submissions`}
            className="text-sm font-semibold text-primary hover:underline"
          >
            ← Danh sách bài nộp
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{data.assessment.title}</h1>
          <p className="text-sm text-slate-500">
            {data.student.fullName || data.student.username} · {data.student.username} · Lượt {data.session.attemptNumber}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <ScoreBox label="Dự kiến" value={data.session.predictedScore} total={data.assessment.totalPoints} tone="blue" />
          <ScoreBox label="Chính thức" value={data.session.officialScore} total={data.assessment.totalPoints} tone="green" />
        </div>
      </div>

      <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
        Điểm AI chỉ là gợi ý. Chọn <strong>Chấp nhận gợi ý</strong> hoặc sửa điểm/feedback rồi
        chọn <strong>Lưu điểm GV</strong>. Khi tất cả câu tự luận đã duyệt, tổng điểm tự động
        trở thành điểm chính thức.
      </div>

      <div className={`rounded-xl border p-4 ${integrityEvents.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`font-black ${integrityEvents.length > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
            Giám sát phiên thi
          </p>
          <span className={integrityEvents.length > 0 ? 'badge-yellow' : 'badge-green'}>
            {integrityEvents.length} cảnh báo
          </span>
        </div>
        {integrityEvents.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm text-amber-950">
            {integrityEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
                <span className="font-semibold">{integrityEventLabels[event.eventType] ?? event.eventType}</span>
                <time className="text-xs text-amber-700">{new Date(event.occurredAt).toLocaleString('vi-VN')}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-emerald-800">Không ghi nhận thao tác vi phạm trong phiên làm bài.</p>
        )}
      </div>

      {subjective.map((answer, index) => {
        const form = draftScores[answer.id] ?? { points: 0, feedback: '', reason: '' }
        const hasSuggestion = answer.aiSuggestedPoints !== null
        const reviewed = ['human_accepted', 'human_adjusted', 'manually_graded'].includes(answer.gradingState)
        return (
          <article key={answer.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Câu tự luận {index + 1}</p>
                <h2 className="mt-1 font-bold text-slate-900">{answer.question.prompt}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className={reviewed ? 'badge-green' : hasSuggestion ? 'badge-yellow' : 'badge-red'}>
                  {reviewed ? 'Đã duyệt' : hasSuggestion ? 'Chờ duyệt' : 'Cần chấm tay'}
                </span>
                <span className="badge-blue">Tối đa {answer.question.points}</span>
              </div>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="label">Bài làm sinh viên</p>
                  <pre className="mt-2 min-h-28 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
                    {answerText(answer)}
                  </pre>
                </div>
                <div>
                  <p className="label">Đáp án gợi ý</p>
                  <div className="mt-2 whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                    {answer.question.referenceAnswer || 'Không có đáp án gợi ý.'}
                  </div>
                </div>
                <div>
                  <p className="label">Rubric</p>
                  <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {(answer.question.rubric ?? []).map((criterion) => (
                      <li key={criterion.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                        <span>{criterion.criterion}</span>
                        <strong>{criterion.points}đ</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-blue-900">Gợi ý từ LLM</p>
                    {answer.aiConfidence && <span className="badge-blue">Tin cậy: {answer.aiConfidence}</span>}
                  </div>
                  <p className="mt-3 text-3xl font-black text-blue-800">
                    {answer.aiSuggestedPoints === null ? 'Đang chờ' : `${answer.aiSuggestedPoints}/${answer.question.points}`}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-blue-900">
                    {answer.aiFeedback || 'Chưa có feedback từ AI.'}
                  </p>
                  {answer.aiCriteria.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t border-blue-200 pt-3 text-xs text-blue-950">
                      {answer.aiCriteria.map((criterion) => {
                        const rubric = answer.question.rubric.find((item) => item.id === criterion.criterionId)
                        return (
                          <li key={criterion.criterionId}>
                            <div className="flex justify-between gap-3 font-bold">
                              <span>{rubric?.criterion ?? criterion.criterionId}</span>
                              <span>{criterion.awardedPoints}/{rubric?.points ?? '—'}</span>
                            </div>
                            <p className="mt-1 text-blue-800">Bằng chứng: {criterion.evidence}</p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {answer.latestAiRun && ['queued', 'running'].includes(answer.latestAiRun.status) && (
                    <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-xs font-bold text-blue-700">
                      AI đang chấm lại; điểm chính thức hiện tại vẫn được giữ nguyên.
                    </p>
                  )}
                  {answer.latestAiRun?.status === 'failed' && (
                    <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      AI chưa chấm được: {answer.latestAiRun.errorMessage || answer.latestAiRun.errorCode}. GV vẫn có thể chấm tay.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="font-bold text-slate-900">Điểm chính thức của giảng viên</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr]">
                    <label>
                      <span className="label">Điểm</span>
                      <input
                        type="number"
                        min={0}
                        max={answer.question.points}
                        step={0.05}
                        className="input mt-1"
                        value={form.points}
                        onChange={(event) =>
                          setDraftScores((value) => ({
                            ...value,
                            [answer.id]: { ...form, points: Number(event.target.value) },
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span className="label">Feedback</span>
                      <textarea
                        rows={3}
                        className="input mt-1"
                        value={form.feedback}
                        onChange={(event) =>
                          setDraftScores((value) => ({
                            ...value,
                            [answer.id]: { ...form, feedback: event.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className="mt-3 block">
                    <span className="label">Lý do điều chỉnh (để audit)</span>
                    <input
                      className="input mt-1"
                      value={form.reason}
                      onChange={(event) =>
                        setDraftScores((value) => ({
                          ...value,
                          [answer.id]: { ...form, reason: event.target.value },
                        }))
                      }
                      placeholder="Ví dụ: Trừ 0.1 do thiếu trường hợp ngoại lệ."
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => void review(answer, 'accept')}
                      disabled={!hasSuggestion || busyId === answer.id}
                      className="btn-primary"
                    >
                      Chấp nhận gợi ý
                    </button>
                    <button
                      onClick={() => void review(answer, hasSuggestion ? 'adjust' : 'manual')}
                      disabled={busyId === answer.id}
                      className="btn-secondary"
                    >
                      Lưu điểm GV
                    </button>
                    {answer.question.gradingMode === 'llm_assisted' && (
                      <button
                        onClick={() => void retryAi(answer)}
                        disabled={busyId === answer.id}
                        className="btn-secondary"
                      >
                        Chạy lại AI
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </article>
        )
      })}

      {subjective.length === 0 && (
        <div className="card p-10 text-center text-slate-500">Đề này không có câu tự luận cần duyệt.</div>
      )}
    </div>
  )
}

function ScoreBox({ label, value, total, tone }: { label: string; value: number | null; total: number; tone: 'blue' | 'green' }) {
  return (
    <div className={`rounded-lg border px-4 py-2 ${tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      <p className="text-[10px] font-bold uppercase">{label}</p>
      <p className="text-lg font-black">{value === null ? '—' : `${value}/${total}`}</p>
    </div>
  )
}
