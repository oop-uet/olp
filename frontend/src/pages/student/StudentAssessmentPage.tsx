import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { readApiError } from '../../lib/apiError'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface Preflight {
  id: string
  title: string
  instructions: string
  totalPoints: number
  durationMinutes: number
  opensAt: string
  closesAt: string
  requireFullscreen: boolean
  warningThreshold: number
  showPredictedScore: boolean
  questionCount: number
  session: { id: string; status: string } | null
}
interface Question {
  id: string
  type: 'true_false' | 'single_choice' | 'short_text' | 'essay' | 'code_analysis'
  prompt: string
  points: number
  options: Array<{ id: string; content: string }>
}
interface Section { id: string; title: string; introContent: string | null; points: number; questions: Question[] }
interface SessionPayload {
  session: { id: string; status: string; expiresAt: string }
  assessment: { title: string; instructions: string; totalPoints: number; sections: Section[] }
  answers: Array<{ questionId: string; answer: Record<string, unknown>; clientRevision: number }>
}
interface ResultPayload {
  id: string
  title: string
  totalPoints: number
  autoScore: number
  reviewStatus: string
  showPredictedScore: boolean
  predictedReady: boolean
  predictedScore: number | null
  officialScore: number | null
  submittedAt: string
  answers: Array<{ id: string; feedback: string | null; gradingState: string }>
}

function formatRemaining(seconds: number) {
  const safe = Math.max(0, seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  return [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':')
}

function hasAnswerValue(answer: Record<string, unknown> | undefined) {
  return Boolean(
    answer &&
    Object.values(answer).some(
      (value) => value !== '' && value !== null && value !== undefined
    )
  )
}

export function StudentAssessmentPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const [preflight, setPreflight] = useState<Preflight | null>(null)
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [result, setResult] = useState<ResultPayload | null>(null)
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({})
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const revisionsRef = useRef<Record<string, number>>({})
  const timersRef = useRef<Record<string, number>>({})
  const submittingRef = useRef(false)
  const serverOffsetRef = useRef(0)

  const loadResult = useCallback(async (sessionId: string) => {
    const response = await api.get(`/api/students/assessments/sessions/${sessionId}/result`)
    setResult(response.data.data)
    setSession(null)
  }, [])

  const loadSession = useCallback(async (sessionId: string) => {
    const response = await api.get(`/api/students/assessments/sessions/${sessionId}`)
    if (response.data.serverNow) {
      serverOffsetRef.current = new Date(response.data.serverNow).getTime() - Date.now()
    }
    const payload: SessionPayload = response.data.data
    if (payload.session.status !== 'in_progress') {
      await loadResult(sessionId)
      return
    }
    setSession(payload)
    const loadedAnswers: Record<string, Record<string, unknown>> = {}
    const revisions: Record<string, number> = {}
    payload.answers.forEach((answer) => {
      loadedAnswers[answer.questionId] = answer.answer
      revisions[answer.questionId] = answer.clientRevision
    })
    setAnswers(loadedAnswers)
    revisionsRef.current = revisions
  }, [loadResult])

  const loadInitial = useCallback(async () => {
    if (!assignmentId) return
    setLoading(true)
    try {
      const response = await api.get(`/api/students/assessments/${assignmentId}/preflight`)
      if (response.data.serverNow) {
        serverOffsetRef.current = new Date(response.data.serverNow).getTime() - Date.now()
      }
      const next: Preflight = response.data.data
      setPreflight(next)
      if (next.session) {
        if (next.session.status === 'in_progress') await loadSession(next.session.id)
        else await loadResult(next.session.id)
      }
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể tải bài kiểm tra.')
    } finally {
      setLoading(false)
    }
  }, [assignmentId, loadResult, loadSession])

  useEffect(() => {
    void loadInitial()
    const answerTimers = timersRef.current
    return () => Object.values(answerTimers).forEach((timer) => window.clearTimeout(timer))
  }, [loadInitial])

  async function start() {
    if (!assignmentId || !preflight) return
    setStarting(true)
    try {
      if (preflight.requireFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
      const response = await api.post(`/api/students/assessments/${assignmentId}/start`)
      await loadSession(response.data.data.id)
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể bắt đầu bài kiểm tra.')
    } finally {
      setStarting(false)
    }
  }

  const saveAnswer = useCallback(
    async (questionId: string, answer: Record<string, unknown>, revision: number) => {
      if (!session) return
      setSaveState('saving')
      try {
        await api.put(`/api/students/assessments/sessions/${session.session.id}/answers`, {
          answers: [{ questionId, answer, clientRevision: revision }],
        })
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    },
    [session]
  )

  function updateAnswer(questionId: string, answer: Record<string, unknown>) {
    setAnswers((current) => ({ ...current, [questionId]: answer }))
    const revision = (revisionsRef.current[questionId] ?? 0) + 1
    revisionsRef.current[questionId] = revision
    if (timersRef.current[questionId]) window.clearTimeout(timersRef.current[questionId])
    timersRef.current[questionId] = window.setTimeout(() => {
      void saveAnswer(questionId, answer, revision)
    }, 700)
  }

  const submit = useCallback(
    async (askConfirmation = true) => {
      if (!session || submittingRef.current) return
      const questions = session.assessment.sections.flatMap((section) => section.questions)
      const unanswered = questions.filter((question) => !answers[question.id] || Object.values(answers[question.id]).every((value) => value === '' || value === null || value === undefined))
      if (askConfirmation && !window.confirm(`Bạn còn ${unanswered.length} câu chưa trả lời. Xác nhận nộp bài?`)) return
      submittingRef.current = true
      setSubmitting(true)
      try {
        Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer))
        const batch = Object.entries(answers).map(([questionId, answer]) => ({
          questionId,
          answer,
          clientRevision: revisionsRef.current[questionId] ?? 1,
        }))
        if (batch.length > 0) {
          await api.put(`/api/students/assessments/sessions/${session.session.id}/answers`, { answers: batch })
        }
        await api.post(`/api/students/assessments/sessions/${session.session.id}/submit`)
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
        await loadResult(session.session.id)
        toast.success('Đã nộp bài kiểm tra.')
      } catch (error: unknown) {
        toast.error(readApiError(error).message ?? 'Không thể nộp bài.')
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [answers, loadResult, session]
  )

  useEffect(() => {
    if (!session) return
    const update = () => {
      const serverNow = Date.now() + serverOffsetRef.current
      const seconds = Math.max(0, Math.ceil((new Date(session.session.expiresAt).getTime() - serverNow) / 1000))
      setRemaining(seconds)
      if (seconds === 0) void submit(false)
    }
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [session, submit])

  useEffect(() => {
    if (!result || result.reviewStatus === 'official') return
    const timer = window.setInterval(() => void loadResult(result.id).catch(() => undefined), 5000)
    return () => window.clearInterval(timer)
  }, [loadResult, result])

  const answeredCount = useMemo(
    () => Object.values(answers).filter((answer) => hasAnswerValue(answer)).length,
    [answers]
  )

  if (loading) return <PageLoader label="Đang tải bài kiểm tra..." />
  if (!preflight) return <div className="card p-8 text-center text-slate-500">Không tìm thấy bài kiểm tra.</div>
  if (result) return <AssessmentResult result={result} />

  if (!session) {
    const now = Date.now() + serverOffsetRef.current
    const notOpen = now < new Date(preflight.opensAt).getTime()
    const closed = now >= new Date(preflight.closesAt).getTime()
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link to="/student/assessments" className="text-sm font-semibold text-primary hover:underline">← Bài kiểm tra</Link>
        <div className="card overflow-hidden">
          <div className="border-b-4 border-secondary bg-primary p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-wider text-white/70">Chuẩn bị làm bài</p>
            <h1 className="mt-2 text-2xl font-black">{preflight.title}</h1>
          </div>
          <div className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Meta label="Thời lượng" value={`${preflight.durationMinutes} phút`} />
              <Meta label="Số câu" value={String(preflight.questionCount)} />
              <Meta label="Tổng điểm" value={String(preflight.totalPoints)} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 whitespace-pre-wrap">
              {preflight.instructions || 'Không có hướng dẫn bổ sung.'}
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>• Mở: {new Date(preflight.opensAt).toLocaleString('vi-VN')}</li>
              <li>• Đóng: {new Date(preflight.closesAt).toLocaleString('vi-VN')}</li>
              <li>• Câu trả lời được tự lưu; tải lại trang không tạo lượt thi mới.</li>
              {preflight.showPredictedScore && <li>• Điểm LLM hiển thị trước dưới nhãn “dự kiến”; GV duyệt mới thành điểm chính thức.</li>}
              {preflight.requireFullscreen && <li>• Bài kiểm tra yêu cầu chế độ toàn màn hình.</li>}
            </ul>
            <button onClick={() => void start()} disabled={starting || notOpen || closed} className="btn-primary btn-lg w-full">
              {notOpen ? 'Bài kiểm tra chưa mở' : closed ? 'Bài kiểm tra đã đóng' : starting ? 'Đang bắt đầu...' : 'Bắt đầu làm bài'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const questions = session.assessment.sections.flatMap((section) => section.questions)
  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-md">
        <div>
          <h1 className="font-black text-slate-900">{session.assessment.title}</h1>
          <p className="text-xs text-slate-500">Đã trả lời {answeredCount}/{questions.length} · {saveState === 'saved' ? 'Đã lưu' : saveState === 'saving' ? 'Đang lưu...' : 'Lỗi lưu - hệ thống sẽ thử lại khi bạn sửa câu'}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`rounded-lg px-4 py-2 font-mono text-lg font-black ${remaining < 300 ? 'bg-rose-100 text-rose-700' : 'bg-slate-900 text-white'}`}>
            {formatRemaining(remaining)}
          </div>
          <button onClick={() => void submit(true)} disabled={submitting} className="btn-primary">
            {submitting ? 'Đang nộp...' : 'Nộp bài'}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="card sticky top-24 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Điều hướng câu hỏi</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {questions.map((question, index) => (
              <a
                key={question.id}
                href={`#question-${question.id}`}
                className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold ${hasAnswerValue(answers[question.id]) ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}
              >
                {index + 1}
              </a>
            ))}
          </div>
        </aside>
        <main className="space-y-5">
          {session.assessment.sections.map((section) => (
            <section key={section.id} className="card overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div className="flex justify-between gap-3"><h2 className="font-black text-slate-900">{section.title}</h2><span className="badge-blue">{section.points} điểm</span></div>
                {section.introContent && <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">{section.introContent}</pre>}
              </div>
              <div className="divide-y divide-slate-100">
                {section.questions.map((question, questionIndex) => (
                  <QuestionInput
                    key={question.id}
                    question={question}
                    number={questionIndex + 1}
                    value={answers[question.id] ?? {}}
                    onChange={(value) => updateAnswer(question.id, value)}
                  />
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  )
}

function QuestionInput({ question, number, value, onChange }: { question: Question; number: number; value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  return (
    <article id={`question-${question.id}`} className="scroll-mt-24 p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="font-semibold leading-6 text-slate-900"><span className="mr-2 text-primary">{number}.</span>{question.prompt}</p>
        <span className="shrink-0 text-xs font-bold text-slate-500">{question.points} điểm</span>
      </div>
      {question.type === 'true_false' && (
        <div className="mt-4 flex gap-3">
          {[true, false].map((option) => (
            <label key={String(option)} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold ${value.value === option ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200'}`}>
              <input type="radio" checked={value.value === option} onChange={() => onChange({ value: option })} />
              {option ? 'Đúng' : 'Sai'}
            </label>
          ))}
        </div>
      )}
      {question.type === 'single_choice' && (
        <div className="mt-4 space-y-2">
          {question.options.map((option, index) => (
            <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${value.optionId === option.id ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 text-slate-700'}`}>
              <input type="radio" className="mt-0.5" checked={value.optionId === option.id} onChange={() => onChange({ optionId: option.id })} />
              <span><strong className="mr-2">{String.fromCharCode(65 + index)}.</strong>{option.content}</span>
            </label>
          ))}
        </div>
      )}
      {['short_text', 'essay', 'code_analysis'].includes(question.type) && (
        <textarea
          rows={question.type === 'short_text' ? 4 : 9}
          className={`input mt-4 ${question.type === 'code_analysis' ? 'font-mono text-xs' : ''}`}
          value={typeof value.text === 'string' ? value.text : ''}
          onChange={(event) => onChange({ text: event.target.value })}
          placeholder="Nhập câu trả lời..."
        />
      )}
    </article>
  )
}

function AssessmentResult({ result }: { result: ResultPayload }) {
  const official = result.officialScore !== null
  const hasVisiblePredicted =
    result.showPredictedScore && result.predictedReady && result.predictedScore !== null
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/student/assessments" className="text-sm font-semibold text-primary hover:underline">← Bài kiểm tra</Link>
      <div className="card overflow-hidden">
        <div className={`p-6 text-white ${official ? 'bg-emerald-600' : 'bg-blue-600'}`}>
          <p className="text-xs font-bold uppercase tracking-wider text-white/75">
            {official ? 'Kết quả chính thức' : hasVisiblePredicted ? 'Kết quả dự kiến' : 'Bài đã nộp'}
          </p>
          <h1 className="mt-2 text-2xl font-black">{result.title}</h1>
        </div>
        <div className="space-y-6 p-6 text-center">
          {official ? (
            <>
              <p className="text-sm font-semibold text-emerald-700">Đã được giảng viên duyệt</p>
              <p className="text-5xl font-black text-emerald-700">{result.officialScore}/{result.totalPoints}</p>
            </>
          ) : hasVisiblePredicted ? (
            <>
              <p className="text-sm font-semibold text-blue-700">Điểm dự kiến từ chấm tự động và LLM</p>
              <p className="text-5xl font-black text-blue-700">{result.predictedScore}/{result.totalPoints}</p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Điểm này chưa chính thức. Giảng viên có thể duyệt hoặc chấm lại phần tự luận.
              </div>
            </>
          ) : result.reviewStatus === 'pending_review' || result.predictedReady ? (
            <>
              <p className="font-semibold text-slate-700">Bài đã chấm sơ bộ và đang chờ giảng viên duyệt.</p>
              <p className="text-sm text-slate-500">Điểm chính thức sẽ xuất hiện sau khi giảng viên hoàn tất review.</p>
            </>
          ) : (
            <>
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
              <p className="font-semibold text-slate-700">AI đang chấm phần tự luận...</p>
              <p className="text-sm text-slate-500">Trang tự cập nhật khi có điểm dự kiến.</p>
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Meta label="Điểm tự động" value={`${result.autoScore}/${result.totalPoints}`} />
            <Meta label="Trạng thái" value={official ? 'Chính thức' : 'Chờ GV duyệt'} />
          </div>
          <p className="text-xs text-slate-400">Nộp lúc {new Date(result.submittedAt).toLocaleString('vi-VN')}</p>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div>
}
