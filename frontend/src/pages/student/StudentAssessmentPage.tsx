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
  shuffleQuestions: boolean
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
  session: { id: string; status: string; expiresAt: string; flaggedQuestionIds: string[] }
  assessment: { title: string; instructions: string; totalPoints: number; sections: Section[] }
  answers: Array<{ questionId: string; answer: Record<string, unknown>; clientRevision: number }>
  integrity?: { warningCount: number; warningThreshold: number; requireFullscreen: boolean }
}

type IntegrityEventType =
  | 'fullscreen_exit'
  | 'visibility_hidden'
  | 'window_blur'
  | 'devtools_open'
  | 'copy_attempt'
  | 'paste_attempt'
  | 'context_menu'
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

function assessmentText(value: string | null | undefined) {
  return String(value ?? '').replace(/\\([{}])/g, '$1')
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
  const [flaggedQuestionIds, setFlaggedQuestionIds] = useState<string[]>([])
  const [warningCount, setWarningCount] = useState(0)
  const [integrityNotice, setIntegrityNotice] = useState<string | null>(null)
  const [fullscreenRequired, setFullscreenRequired] = useState(false)
  const revisionsRef = useRef<Record<string, number>>({})
  const timersRef = useRef<Record<string, number>>({})
  const submittingRef = useRef(false)
  const serverOffsetRef = useRef(0)
  const suppressFullscreenExitRef = useRef(false)
  const fullscreenArmedRef = useRef(false)
  const integrityNoticeTimerRef = useRef<number | null>(null)
  const integrityQueueRef = useRef<Promise<void>>(Promise.resolve())
  const lastIntegrityEventRef = useRef<Partial<Record<IntegrityEventType, number>>>({})

  const loadResult = useCallback(async (sessionId: string) => {
    const response = await api.get(`/api/students/assessments/sessions/${sessionId}/result`)
    setResult(response.data.data)
    setSession(null)
    setFullscreenRequired(false)
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
    setFlaggedQuestionIds(payload.session.flaggedQuestionIds ?? [])
    setWarningCount(payload.integrity?.warningCount ?? 0)
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
    return () => {
      Object.values(answerTimers).forEach((timer) => window.clearTimeout(timer))
      if (integrityNoticeTimerRef.current) window.clearTimeout(integrityNoticeTimerRef.current)
    }
  }, [loadInitial])

  const showIntegrityNotice = useCallback((message: string) => {
    setIntegrityNotice(message)
    if (integrityNoticeTimerRef.current) window.clearTimeout(integrityNoticeTimerRef.current)
    integrityNoticeTimerRef.current = window.setTimeout(() => setIntegrityNotice(null), 4500)
  }, [])

  const recordIntegrityEvent = useCallback((
    eventType: IntegrityEventType,
    message: string,
    metadata: Record<string, unknown> = {}
  ) => {
    if (!session || submittingRef.current) return
    const now = Date.now()
    if (now - (lastIntegrityEventRef.current[eventType] ?? 0) < 1500) return
    lastIntegrityEventRef.current[eventType] = now
    const sessionId = session.session.id
    showIntegrityNotice(message)
    const send = async () => {
      try {
        const response = await api.post(
          `/api/students/assessments/sessions/${sessionId}/integrity-events`,
          {
            eventType,
            metadata: { ...metadata, clientTimestamp: new Date().toISOString() },
          }
        )
        const eventResult = response.data.data as {
          warningCount: number
          warningThreshold: number
          autoSubmitted: boolean
        }
        setWarningCount(eventResult.warningCount)
        if (eventResult.autoSubmitted) {
          submittingRef.current = true
          suppressFullscreenExitRef.current = true
          if (document.fullscreenElement) {
            await document.exitFullscreen().catch(() => undefined)
          }
          await loadResult(sessionId)
          toast.error(`Bài đã tự nộp sau ${eventResult.warningCount} vi phạm quy chế.`)
        }
      } catch {
        // Không làm gián đoạn bài thi nếu kết nối ghi log tạm thời thất bại.
      }
    }
    integrityQueueRef.current = integrityQueueRef.current.then(send, send)
  }, [loadResult, session, showIntegrityNotice])

  async function start() {
    if (!assignmentId || !preflight) return
    setStarting(true)
    try {
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen()
        } catch {
          toast.error('Bạn cần cho phép chế độ toàn màn hình để bắt đầu làm bài.')
          return
        }
      }
      const response = await api.post(`/api/students/assessments/${assignmentId}/start`)
      await loadSession(response.data.data.id)
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể bắt đầu bài kiểm tra.')
    } finally {
      setStarting(false)
    }
  }

  async function toggleQuestionFlag(questionId: string) {
    if (!session) return
    const wasFlagged = flaggedQuestionIds.includes(questionId)
    setFlaggedQuestionIds((current) =>
      wasFlagged ? current.filter((id) => id !== questionId) : [...current, questionId]
    )
    try {
      const response = await api.put(
        `/api/students/assessments/sessions/${session.session.id}/question-flag`,
        { questionId, flagged: !wasFlagged }
      )
      setFlaggedQuestionIds(response.data.data.flaggedQuestionIds ?? [])
    } catch (error: unknown) {
      setFlaggedQuestionIds((current) =>
        wasFlagged
          ? current.includes(questionId) ? current : [...current, questionId]
          : current.filter((id) => id !== questionId)
      )
      toast.error(readApiError(error).message ?? 'Không thể lưu cờ câu hỏi.')
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
        suppressFullscreenExitRef.current = true
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
    if (!session) return
    const monitoringStartedAt = Date.now()
    const outsideGracePeriod = () => Date.now() - monitoringStartedAt > 1800
    fullscreenArmedRef.current = Boolean(document.fullscreenElement)
    setFullscreenRequired(!document.fullscreenElement)

    const handleFullscreenChange = () => {
      if (suppressFullscreenExitRef.current) {
        suppressFullscreenExitRef.current = false
        return
      }
      if (document.fullscreenElement) {
        fullscreenArmedRef.current = true
        setFullscreenRequired(false)
        return
      }
      setFullscreenRequired(true)
      if (fullscreenArmedRef.current && outsideGracePeriod()) {
        recordIntegrityEvent('fullscreen_exit', 'Cảnh báo: bạn đã thoát chế độ toàn màn hình.')
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && outsideGracePeriod()) {
        recordIntegrityEvent(
          'visibility_hidden',
          'Cảnh báo: hệ thống ghi nhận việc chuyển tab, thu nhỏ hoặc chuyển ứng dụng.'
        )
      }
    }

    const handleWindowBlur = () => {
      if (!outsideGracePeriod() || document.visibilityState === 'hidden' || !document.fullscreenElement) return
      recordIntegrityEvent('window_blur', 'Cảnh báo: cửa sổ làm bài đã mất focus.')
    }

    const handleCopyOrCut = (event: ClipboardEvent) => {
      event.preventDefault()
      recordIntegrityEvent('copy_attempt', 'Không được sao chép hoặc cắt nội dung trong khi làm bài.')
    }

    const handlePaste = (event: ClipboardEvent) => {
      event.preventDefault()
      recordIntegrityEvent('paste_attempt', 'Không được dán nội dung trong khi làm bài.')
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      recordIntegrityEvent('context_menu', 'Menu chuột phải đã bị khóa trong khi làm bài.')
    }

    const handleDevToolsShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const windowsShortcut = event.ctrlKey && event.shiftKey && ['i', 'j', 'c', 'k'].includes(key)
      const macShortcut = event.metaKey && event.altKey && ['i', 'j', 'c', 'k'].includes(key)
      if (key !== 'f12' && !windowsShortcut && !macShortcut) return
      event.preventDefault()
      if (!event.repeat) {
        recordIntegrityEvent('devtools_open', 'Phím tắt mở DevTools đã bị chặn và ghi nhận.')
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('copy', handleCopyOrCut)
    document.addEventListener('cut', handleCopyOrCut)
    document.addEventListener('paste', handlePaste)
    document.addEventListener('contextmenu', handleContextMenu)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('keydown', handleDevToolsShortcut, true)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('copy', handleCopyOrCut)
      document.removeEventListener('cut', handleCopyOrCut)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('keydown', handleDevToolsShortcut, true)
      fullscreenArmedRef.current = false
    }
  }, [recordIntegrityEvent, session])

  useEffect(() => {
    if (!result || result.reviewStatus === 'official') return
    const timer = window.setInterval(() => void loadResult(result.id).catch(() => undefined), 5000)
    return () => window.clearInterval(timer)
  }, [loadResult, result])

  const answeredCount = useMemo(
    () => Object.values(answers).filter((answer) => hasAnswerValue(answer)).length,
    [answers]
  )
  const flaggedSet = useMemo(() => new Set(flaggedQuestionIds), [flaggedQuestionIds])

  async function restoreFullscreen() {
    try {
      await document.documentElement.requestFullscreen()
      fullscreenArmedRef.current = true
      setFullscreenRequired(false)
      showIntegrityNotice('Đã trở lại chế độ toàn màn hình.')
    } catch {
      showIntegrityNotice('Trình duyệt chưa cho phép toàn màn hình. Hãy bấm thử lại.')
    }
  }

  if (loading) return <PageLoader label="Đang tải bài kiểm tra..." />
  if (!preflight) return <div className="card p-8 text-center text-slate-500">Không tìm thấy bài kiểm tra.</div>
  if (result) return <AssessmentResult result={result} />

  if (!session) {
    const now = Date.now() + serverOffsetRef.current
    const notOpen = now < new Date(preflight.opensAt).getTime()
    const closed = now >= new Date(preflight.closesAt).getTime()
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link to="/student/assessments" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
          <span>←</span> Bài kiểm tra
        </Link>
        <div className="card overflow-hidden shadow-md">
          <div className="relative overflow-hidden rounded-t-xl bg-gradient-to-r from-teal-700 via-cyan-700 to-blue-800 p-6 text-white shadow-sm border-b-4 border-secondary">
            <div className="absolute right-0 top-0 h-40 w-40 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <div className="relative z-10">
              <p className="text-[11px] font-black uppercase tracking-wider text-cyan-200/90">Chuẩn bị làm bài</p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-white text-shadow-sm">{preflight.title}</h1>
            </div>
          </div>
          <div className="space-y-6 p-6 bg-white">
            <div className="grid gap-3 sm:grid-cols-3">
              <Meta label="Thời lượng" value={`${preflight.durationMinutes} phút`} />
              <Meta label="Số câu" value={String(preflight.questionCount)} />
              <Meta label="Tổng điểm" value={String(preflight.totalPoints)} />
            </div>
            {preflight.instructions && (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap font-medium">
                {assessmentText(preflight.instructions)}
              </div>
            )}
            <ul className="space-y-2.5 text-sm text-slate-600 font-medium">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
                <span>Mở: <strong>{new Date(preflight.opensAt).toLocaleString('vi-VN')}</strong></span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                <span>Đóng: <strong>{new Date(preflight.closesAt).toLocaleString('vi-VN')}</strong></span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 shrink-0" />
                <span>Câu trả lời được tự lưu; tải lại trang không tạo lượt thi mới.</span>
              </li>
              {preflight.showPredictedScore && (
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>Điểm LLM hiển thị trước dưới nhãn “dự kiến”; GV duyệt mới thành điểm chính thức.</span>
                </li>
              )}
              {preflight.shuffleQuestions && (
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span>Thứ tự các câu trắc nghiệm được trộn riêng cho lượt thi này.</span>
                </li>
              )}
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span>Chế độ toàn màn hình là bắt buộc; chuyển tab, thu nhỏ hoặc mất focus sẽ được ghi nhận.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                <span>Copy, paste, menu chuột phải và phím tắt DevTools bị khóa trong thời gian làm bài.</span>
              </li>
            </ul>
            <button
              onClick={() => void start()}
              disabled={starting || notOpen || closed}
              className="btn-primary btn-lg w-full text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
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
      {integrityNotice && (
        <div className="fixed left-1/2 top-4 z-[70] w-[min(92vw,680px)] -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-900 shadow-lg" role="alert">
          {integrityNotice}
        </div>
      )}
      {fullscreenRequired && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-5" role="alert" aria-live="assertive">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <p className="text-xs font-black uppercase tracking-wider text-amber-700">Tạm khóa bài làm</p>
            <h2 className="mt-2 text-xl font-black text-slate-900">Cần trở lại toàn màn hình</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Nội dung bài thi chỉ hiển thị trong chế độ toàn màn hình. Lần thoát đã được ghi nhận nếu phiên trước đó đang ở toàn màn hình.
            </p>
            <button onClick={() => void restoreFullscreen()} className="btn-primary mt-5 w-full">
              Trở lại toàn màn hình
            </button>
          </div>
        </div>
      )}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white/95 backdrop-blur-md px-6 py-3.5 shadow-md border-t-4 border-t-cyan-500">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">{session.assessment.title}</h1>
          <p className="text-xs font-semibold text-slate-500">
            Đã trả lời {answeredCount}/{questions.length} · Gắn cờ {flaggedQuestionIds.length} ·{' '}
            {saveState === 'saved'
              ? '✓ Đã lưu'
              : saveState === 'saving'
              ? '⏳ Đang lưu...'
              : '⚠️ Lỗi lưu - hệ thống sẽ thử lại'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-lg px-3 py-2 text-xs font-black ${warningCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
            Cảnh báo {warningCount}/{session.integrity?.warningThreshold ?? preflight.warningThreshold}
          </span>
          <div
            className={`rounded-xl px-4 py-2 font-mono text-lg font-black shadow-inner border ${
              remaining < 300
                ? 'border-rose-300 bg-rose-100 text-rose-700 animate-pulse'
                : 'border-slate-800 bg-slate-900 text-white'
            }`}
          >
            {formatRemaining(remaining)}
          </div>
          <button
            onClick={() => void submit(true)}
            disabled={submitting}
            className="btn-primary font-bold shadow-md hover:shadow-lg transition-all"
          >
            {submitting ? 'Đang nộp...' : 'Nộp bài'}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="card sticky top-24 p-4 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Điều hướng câu hỏi</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {questions.map((question, index) => (
              <a
                key={question.id}
                href={`#question-${question.id}`}
                title={flaggedSet.has(question.id) ? `Câu ${index + 1} đã gắn cờ` : `Đi tới câu ${index + 1}`}
                className={`relative flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                  flaggedSet.has(question.id)
                    ? 'border-amber-400 bg-amber-50 text-amber-800 shadow-2xs font-black'
                    : hasAnswerValue(answers[question.id])
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-2xs font-black'
                    : 'border-slate-200/80 bg-white text-slate-500 hover:border-cyan-400 hover:bg-cyan-50/40'
                }`}
              >
                {index + 1}
                {flaggedSet.has(question.id) && <span className="absolute -right-1 -top-1 text-[10px]" aria-hidden="true">⚑</span>}
              </a>
            ))}
          </div>
        </aside>
        <main className="space-y-5">
          {session.assessment.sections.map((section) => (
            <section key={section.id} className="card overflow-hidden shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/90 px-6 py-4 border-l-4 border-primary">
                <h2 className="text-base font-extrabold text-slate-900">{section.title}</h2>
                <span className="inline-flex items-center rounded-md bg-cyan-500 px-2.5 py-1 text-xs font-black text-white shadow-2xs">
                  {section.points} điểm
                </span>
              </div>
              {section.introContent && (
                <div className="p-5 pb-0">
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs leading-6 text-emerald-400 shadow-inner">
                    {assessmentText(section.introContent)}
                  </pre>
                </div>
              )}
              <div className="divide-y divide-slate-100">
                {section.questions.map((question, questionIndex) => (
                  <QuestionInput
                    key={question.id}
                    question={question}
                    number={questionIndex + 1}
                    value={answers[question.id] ?? {}}
                    flagged={flaggedSet.has(question.id)}
                    onToggleFlag={() => void toggleQuestionFlag(question.id)}
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

function QuestionInput({
  question,
  number,
  value,
  flagged,
  onToggleFlag,
  onChange,
}: {
  question: Question
  number: number
  value: Record<string, unknown>
  flagged: boolean
  onToggleFlag: () => void
  onChange: (value: Record<string, unknown>) => void
}) {
  return (
    <article id={`question-${question.id}`} className="scroll-mt-24 p-6">
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm font-bold leading-relaxed text-slate-900">
          <span className="mr-2 text-base font-black text-primary">{number}.</span>
          {assessmentText(question.prompt)}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={flagged}
            onClick={onToggleFlag}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition ${flagged ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-500 hover:border-amber-300 hover:text-amber-700'}`}
            title={flagged ? 'Bỏ gắn cờ câu hỏi' : 'Gắn cờ để xem lại câu hỏi'}
          >
            <span aria-hidden="true">⚑</span>
            {flagged ? 'Đã gắn cờ' : 'Gắn cờ'}
          </button>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
            {question.points} điểm
          </span>
        </div>
      </div>
      {question.type === 'true_false' && (
        <div className="mt-4 flex gap-3">
          {[true, false].map((option) => (
            <label
              key={String(option)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-5 py-3 text-sm font-bold transition-all shadow-2xs ${
                value.value === option
                  ? 'border-primary bg-primary-50/80 text-primary ring-2 ring-primary/20'
                  : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <input type="radio" checked={value.value === option} onChange={() => onChange({ value: option })} />
              {option ? 'Đúng' : 'Sai'}
            </label>
          ))}
        </div>
      )}
      {question.type === 'single_choice' && (
        <div className="mt-4 space-y-2.5">
          {question.options.map((option, index) => (
            <label
              key={option.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm font-medium transition-all shadow-2xs ${
                value.optionId === option.id
                  ? 'border-primary bg-primary-50/80 text-primary ring-2 ring-primary/20 font-bold'
                  : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <input
                type="radio"
                className="mt-0.5"
                checked={value.optionId === option.id}
                onChange={() => onChange({ optionId: option.id })}
              />
              <span className="whitespace-pre-wrap break-words">
                <strong className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-black text-slate-600">
                  {String.fromCharCode(65 + index)}
                </strong>
                {assessmentText(option.content)}
              </span>
            </label>
          ))}
        </div>
      )}
      {['short_text', 'essay', 'code_analysis'].includes(question.type) && (
        <textarea
          rows={question.type === 'short_text' ? 4 : 9}
          className={`input mt-4 rounded-xl border-slate-200/80 p-3.5 focus:ring-primary/20 font-medium ${
            question.type === 'code_analysis' ? 'font-mono text-xs' : ''
          }`}
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
      <Link to="/student/assessments" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
        <span>←</span> Bài kiểm tra
      </Link>
      <div className="card overflow-hidden shadow-md">
        <div
          className={`relative overflow-hidden rounded-t-xl p-6 text-white shadow-sm border-b-4 border-secondary ${
            official
              ? 'bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800'
              : 'bg-gradient-to-r from-teal-700 via-cyan-700 to-blue-800'
          }`}
        >
          <div className="absolute right-0 top-0 h-40 w-40 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-xl pointer-events-none" />
          <div className="relative z-10">
            <p className="text-[11px] font-black uppercase tracking-wider text-cyan-200/90">
              {official ? 'Kết quả chính thức' : hasVisiblePredicted ? 'Kết quả dự kiến' : 'Bài đã nộp'}
            </p>
            <h1 className="mt-1.5 text-2xl font-black tracking-tight text-white text-shadow-sm">{result.title}</h1>
          </div>
        </div>
        <div className="space-y-6 p-6 text-center bg-white">
          {official ? (
            <>
              <p className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Đã được giảng viên duyệt</p>
              <p className="text-5xl font-black text-emerald-700">{result.officialScore}/{result.totalPoints}</p>
            </>
          ) : hasVisiblePredicted ? (
            <>
              <p className="text-sm font-bold text-cyan-700 uppercase tracking-wide">Điểm dự kiến từ chấm tự động và LLM</p>
              <p className="text-5xl font-black text-primary">{result.predictedScore}/{result.totalPoints}</p>
              <div className="rounded-xl border border-amber-200/90 bg-amber-50/80 p-4 text-sm font-medium text-amber-800 shadow-2xs">
                Điểm này chưa chính thức. Giảng viên có thể duyệt hoặc chấm lại phần tự luận.
              </div>
            </>
          ) : result.reviewStatus === 'pending_review' || result.predictedReady ? (
            <>
              <p className="font-bold text-slate-800">Bài đã chấm sơ bộ và đang chờ giảng viên duyệt.</p>
              <p className="text-sm font-medium text-slate-500">Điểm chính thức sẽ xuất hiện sau khi giảng viên hoàn tất review.</p>
            </>
          ) : (
            <>
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-600" />
              <p className="font-bold text-slate-800">AI đang chấm phần tự luận...</p>
              <p className="text-sm font-medium text-slate-500">Trang tự cập nhật khi có điểm dự kiến.</p>
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Meta label="Điểm tự động" value={`${result.autoScore}/${result.totalPoints}`} />
            <Meta label="Trạng thái" value={official ? 'Chính thức' : 'Chờ GV duyệt'} />
          </div>
          <p className="text-xs font-semibold text-slate-400">Nộp lúc {new Date(result.submittedAt).toLocaleString('vi-VN')}</p>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-center transition-all hover:bg-slate-100/50">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-800">{value}</p>
    </div>
  )
}
