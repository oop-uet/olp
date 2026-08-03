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
  dom_tampering: 'Can thiệp nội dung đề / tiện ích trình duyệt',
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
  if (!data) return <div className="card p-8 text-center text-slate-500 font-semibold">Không tìm thấy bài nộp.</div>
  const integrityEvents = data.integrityEvents ?? []

  return (
    <div className="space-y-6">
      <Link
        to={`/instructor/assessment-assignments/${data.session.assignmentId}/submissions`}
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-700 hover:text-teal-800 transition-colors"
      >
        <span>←</span> Quay lại danh sách bài nộp
      </Link>

      {/* Signature Gradient Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-cyan-700 to-blue-800 p-6 sm:p-8 text-white shadow-md border-b-4 border-secondary flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="absolute right-0 top-0 h-44 w-44 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 space-y-1.5 min-w-0">
          <span className="inline-block rounded-full bg-white/15 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-cyan-100 backdrop-blur-xs">
            Chấm & Duyệt bài làm
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight truncate">
            {data.assessment.title}
          </h1>
          <p className="text-xs font-bold text-cyan-100/90 mt-1">
            Sinh viên: <span className="text-white">{data.student.fullName || data.student.username}</span> ({data.student.username}) · Lượt làm #{data.session.attemptNumber ?? 1}
          </p>
        </div>

        {/* Header Scores */}
        <div className="relative z-10 flex items-center gap-3 shrink-0 self-start sm:self-center">
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-center backdrop-blur-xs">
            <p className="text-[10px] font-extrabold uppercase text-cyan-200">Điểm dự kiến</p>
            <p className="text-lg font-black text-white">{data.session.predictedScore === null ? '—' : `${data.session.predictedScore}/${data.assessment.totalPoints}`}</p>
          </div>
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-2 text-center backdrop-blur-xs">
            <p className="text-[10px] font-extrabold uppercase text-emerald-200">Điểm chính thức</p>
            <p className="text-lg font-black text-emerald-300">{data.session.officialScore === null ? '—' : `${data.session.officialScore}/${data.assessment.totalPoints}`}</p>
          </div>
        </div>
      </div>

      {/* Session Monitoring Box */}
      <div className={`rounded-xl border p-4 transition-all ${integrityEvents.length > 0 ? 'border-amber-200 bg-amber-50/80' : 'border-slate-200/80 bg-slate-50/70'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800">Giám sát phiên thi</span>
            <span className={integrityEvents.length > 0 ? 'badge-yellow font-bold' : 'badge-green font-bold'}>
              {integrityEvents.length > 0 ? `${integrityEvents.length} cảnh báo` : 'An toàn (0 cảnh báo)'}
            </span>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {integrityEvents.length === 0 ? 'Không ghi nhận thao tác bất thường nào trong quá trình thi.' : 'Có ghi nhận các cảnh báo gián đoạn.'}
          </span>
        </div>
        {integrityEvents.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-xs text-amber-950 border-t border-amber-200/60 pt-3">
            {integrityEvents.map((event) => (
              <li key={event.id} className="flex items-center justify-between rounded-md bg-white/80 px-3 py-1.5 border border-amber-200/50">
                <span className="font-bold text-slate-800">{integrityEventLabels[event.eventType] ?? event.eventType}</span>
                <time className="font-semibold text-slate-500">{new Date(event.occurredAt).toLocaleString('vi-VN')}</time>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Subjective Questions Grading Stack */}
      {subjective.map((answer, index) => {
        const form = draftScores[answer.id] ?? { points: 0, feedback: '', reason: '' }
        const hasSuggestion = answer.aiSuggestedPoints !== null
        const reviewed = ['human_accepted', 'human_adjusted', 'manually_graded'].includes(answer.gradingState)
        return (
          <article key={answer.id} className="card overflow-hidden border border-slate-200/90 shadow-sm">
            {/* Question Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="rounded-md bg-teal-700 px-2 py-0.5 text-xs font-black text-white">
                  Câu {index + 1}
                </span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tự luận</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={reviewed ? 'badge-green font-bold' : hasSuggestion ? 'badge-yellow font-bold' : 'badge-red font-bold'}>
                  {reviewed ? 'Đã duyệt' : hasSuggestion ? 'Chờ duyệt' : 'Cần chấm tay'}
                </span>
                <span className="badge-blue font-bold">Tối đa {answer.question.points} điểm</span>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Question Text */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Đề bài</p>
                <p className="text-sm font-bold text-slate-900 leading-relaxed">{answer.question.prompt}</p>
              </div>

              {/* Grid: Left (Answer & Rubric) vs Right (Grading & AI) */}
              <div className="grid gap-5 lg:grid-cols-2 items-start">
                {/* Left Column: Student Answer, Reference Answer & Rubric */}
                <div className="space-y-4">
                  {/* Student Answer */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                      Bài làm sinh viên
                    </label>
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 max-h-80 overflow-y-auto whitespace-pre-wrap">
                      {answerText(answer)}
                    </div>
                  </div>

                  {/* Reference Answer */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                      Đáp án gợi ý
                    </label>
                    <div className="rounded-xl border-l-4 border-l-teal-500 border border-slate-200 bg-teal-50/20 p-4 text-xs font-medium leading-relaxed text-slate-800 whitespace-pre-wrap">
                      {answer.question.referenceAnswer || 'Không có đáp án gợi ý.'}
                    </div>
                  </div>

                  {/* Rubric */}
                  {answer.question.rubric && answer.question.rubric.length > 0 && (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                        Rubric chấm điểm
                      </label>
                      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                        <table className="min-w-full divide-y divide-slate-100 text-xs">
                          <thead className="bg-slate-50 text-slate-500 font-bold">
                            <tr>
                              <th className="px-3.5 py-2 text-left">Tiêu chí</th>
                              <th className="px-3.5 py-2 text-right w-20">Điểm</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {answer.question.rubric.map((criterion) => (
                              <tr key={criterion.id}>
                                <td className="px-3.5 py-2 font-medium">{criterion.criterion}</td>
                                <td className="px-3.5 py-2 text-right font-black text-slate-900">{criterion.points}đ</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: AI Suggestion & Teacher Form */}
                <div className="space-y-4">
                  {/* AI Suggestion Card */}
                  <div className="rounded-xl border border-cyan-200/90 bg-cyan-50/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-cyan-800">Gợi ý từ AI (LLM)</span>
                      {answer.aiConfidence && (
                        <span className="badge-blue text-[10px] font-bold uppercase">Độ tin cậy: {answer.aiConfidence}</span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-cyan-900">
                        {answer.aiSuggestedPoints === null ? '—' : answer.aiSuggestedPoints}
                      </span>
                      <span className="text-sm font-bold text-cyan-700">/ {answer.question.points} điểm</span>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed text-slate-700 bg-white/70 p-3 rounded-lg border border-cyan-100">
                      {answer.aiFeedback || 'Chưa có nhận xét từ AI.'}
                    </p>

                    {answer.aiCriteria.length > 0 && (
                      <div className="border-t border-cyan-200/60 pt-2.5 space-y-2 text-xs">
                        <p className="font-bold text-cyan-900 text-[11px] uppercase tracking-wider">Chi tiết tiêu chí:</p>
                        {answer.aiCriteria.map((criterion) => {
                          const rubric = answer.question.rubric.find((item) => item.id === criterion.criterionId)
                          return (
                            <div key={criterion.criterionId} className="rounded-md bg-white p-2.5 border border-cyan-100 space-y-1">
                              <div className="flex justify-between font-bold text-slate-800">
                                <span>{rubric?.criterion ?? criterion.criterionId}</span>
                                <span className="text-cyan-800">{criterion.awardedPoints}/{rubric?.points ?? '—'}đ</span>
                              </div>
                              <p className="text-[11px] text-slate-600">Bằng chứng: {criterion.evidence}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Teacher Grading Form */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3.5 shadow-2xs">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-800">Chấm điểm của Giảng viên</p>
                    
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label text-[11px]" htmlFor={`points-${answer.id}`}>
                          Điểm số
                        </label>
                        <input
                          id={`points-${answer.id}`}
                          type="number"
                          min={0}
                          max={answer.question.points}
                          step={0.05}
                          className="input mt-1 h-9 text-xs font-bold text-slate-900"
                          value={form.points}
                          onChange={(event) =>
                            setDraftScores((value) => ({
                              ...value,
                              [answer.id]: { ...form, points: Number(event.target.value) },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="label text-[11px]" htmlFor={`reason-${answer.id}`}>
                          Lý do điều chỉnh (nếu có)
                        </label>
                        <input
                          id={`reason-${answer.id}`}
                          className="input mt-1 h-9 text-xs"
                          placeholder="VD: Trừ 0.1 do thiếu case..."
                          value={form.reason}
                          onChange={(event) =>
                            setDraftScores((value) => ({
                              ...value,
                              [answer.id]: { ...form, reason: event.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label text-[11px]" htmlFor={`feedback-${answer.id}`}>
                        Nhận xét của Giảng viên (Feedback)
                      </label>
                      <textarea
                        id={`feedback-${answer.id}`}
                        rows={2}
                        className="input mt-1 text-xs"
                        placeholder="Nhập nhận xét gửi cho sinh viên..."
                        value={form.feedback}
                        onChange={(event) =>
                          setDraftScores((value) => ({
                            ...value,
                            [answer.id]: { ...form, feedback: event.target.value },
                          }))
                        }
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                      {answer.question.gradingMode === 'llm_assisted' && (
                        <button
                          onClick={() => void retryAi(answer)}
                          disabled={busyId === answer.id}
                          className="btn-secondary h-8 px-3 text-xs font-semibold"
                          title="Chạy lại AI"
                        >
                          Chạy lại AI
                        </button>
                      )}
                      <button
                        onClick={() => void review(answer, hasSuggestion ? 'adjust' : 'manual')}
                        disabled={busyId === answer.id}
                        className="btn-secondary h-8 px-3 text-xs font-bold"
                      >
                        Lưu điểm GV
                      </button>
                      {hasSuggestion && (
                        <button
                          onClick={() => void review(answer, 'accept')}
                          disabled={busyId === answer.id}
                          className="btn-primary h-8 px-3 text-xs font-bold"
                        >
                          Chấp nhận gợi ý AI
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        )
      })}

      {subjective.length === 0 && (
        <div className="card p-12 text-center font-semibold text-slate-500">
          Bài kiểm tra này không có câu hỏi tự luận nào cần duyệt.
        </div>
      )}
    </div>
  )
}
