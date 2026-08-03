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
  maxAttempts: number
  attemptsUsed: number
  attemptsRemaining: number
  questionCount: number
  session: { id: string; status: string; reviewStatus?: string; attemptNumber: number } | null
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
  session: { id: string; status: string; expiresAt: string; flaggedQuestionIds: string[]; attemptNumber: number }
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
  attemptNumber: number
  submittedAt: string
  answers: Array<{ id: string; feedback: string | null; gradingState: string }>
}

interface ReviewQuestion extends Question {
  answer: Record<string, unknown>
  awardedPoints: number
  feedback: string | null
}
interface ReviewSection extends Omit<Section, 'questions'> { questions: ReviewQuestion[] }
interface ReviewPayload {
  id: string
  title: string
  instructions: string
  totalPoints: number
  submittedAt: string
  officialAt: string
  officialScore: number
  attemptNumber: number
  sections: ReviewSection[]
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
  const [review, setReview] = useState<ReviewPayload | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
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
  const dirtyAnswersRef = useRef<
    Record<string, { questionId: string; answer: Record<string, unknown>; clientRevision: number }>
  >({})
  const autosaveTimerRef = useRef<number | null>(null)
  const flushPromiseRef = useRef<Promise<void> | null>(null)
  const submittingRef = useRef(false)
  const serverOffsetRef = useRef(0)
  const suppressFullscreenExitRef = useRef(false)
  const fullscreenArmedRef = useRef(false)
  const integrityNoticeTimerRef = useRef<number | null>(null)
  const integrityQueueRef = useRef<Promise<void>>(Promise.resolve())
  const lastIntegrityEventRef = useRef<Partial<Record<IntegrityEventType, number>>>({})

  const loadResult = useCallback(async (sessionId: string) => {
    const response = await api.get(`/api/students/assessments/sessions/${sessionId}/result`)
    dirtyAnswersRef.current = {}
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
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
    dirtyAnswersRef.current = {}
    setSaveState('saved')
  }, [loadResult])

  const loadInitial = useCallback(async () => {
    if (!assignmentId) return
    setLoading(true)
    try {
      const response = await api.get(`/api/students/assessments/${assignmentId}/preflight`)
      if (response.data.serverNow) {
        serverOffsetRef.current = new Date(response.data.serverNow).getTime() - Date.now()
      }
      const raw = response.data.data
      const maxAttempts = raw.maxAttempts ?? 1
      const attemptsUsed = raw.attemptsUsed ?? raw.session?.attemptNumber ?? (raw.session ? 1 : 0)
      const next: Preflight = {
        ...raw,
        maxAttempts,
        attemptsUsed,
        attemptsRemaining: raw.attemptsRemaining ?? Math.max(0, maxAttempts - attemptsUsed),
        session: raw.session
          ? { ...raw.session, attemptNumber: raw.session.attemptNumber ?? attemptsUsed }
          : null,
      }
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

  async function loadReview(sessionId: string) {
    setReviewLoading(true)
    try {
      const response = await api.get(`/api/students/assessments/sessions/${sessionId}/review`)
      setReview(response.data.data)
    } catch (error: unknown) {
      toast.error(readApiError(error).message ?? 'Không thể tải bài nộp đã chấm.')
    } finally {
      setReviewLoading(false)
    }
  }

  useEffect(() => {
    void loadInitial()
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
      if (integrityNoticeTimerRef.current) window.clearTimeout(integrityNoticeTimerRef.current)
    }
  }, [loadInitial])

  const showIntegrityNotice = useCallback((message: string) => {
    setIntegrityNotice(message)
    if (integrityNoticeTimerRef.current) window.clearTimeout(integrityNoticeTimerRef.current)
    integrityNoticeTimerRef.current = window.setTimeout(() => setIntegrityNotice(null), 4500)
  }, [])

  const flushDirtyAnswers = useCallback(async (drain = false) => {
    if (!session) return

    do {
      if (flushPromiseRef.current) {
        await flushPromiseRef.current
        if (!drain) return
        continue
      }

      const batch = Object.values(dirtyAnswersRef.current)
      if (batch.length === 0) {
        setSaveState('saved')
        return
      }

      setSaveState('saving')
      const request = api
        .put(`/api/students/assessments/sessions/${session.session.id}/answers`, { answers: batch })
        .then(() => {
          for (const sent of batch) {
            const pending = dirtyAnswersRef.current[sent.questionId]
            if (pending && pending.clientRevision <= sent.clientRevision) {
              delete dirtyAnswersRef.current[sent.questionId]
            }
          }
          setSaveState(Object.keys(dirtyAnswersRef.current).length === 0 ? 'saved' : 'saving')
        })
        .catch((error: unknown) => {
          setSaveState('error')
          throw error
        })

      flushPromiseRef.current = request
      try {
        await request
      } finally {
        if (flushPromiseRef.current === request) flushPromiseRef.current = null
      }
    } while (drain && Object.keys(dirtyAnswersRef.current).length > 0)
  }, [session])

  function updateAnswer(questionId: string, answer: Record<string, unknown>) {
    setAnswers((current) => ({ ...current, [questionId]: answer }))
    const revision = (revisionsRef.current[questionId] ?? 0) + 1
    revisionsRef.current[questionId] = revision
    dirtyAnswersRef.current[questionId] = {
      questionId,
      answer,
      clientRevision: revision,
    }
    setSaveState('saving')

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    const question = session?.assessment.sections
      .flatMap((section) => section.questions)
      .find((item) => item.id === questionId)
    const debounceMs = question && ['true_false', 'single_choice'].includes(question.type)
      ? 1_200
      : 2_500
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null
      void flushDirtyAnswers().catch(() => undefined)
    }, debounceMs)
  }

  useEffect(() => {
    if (!session) return
    const periodicFlush = window.setInterval(
      () => void flushDirtyAnswers().catch(() => undefined),
      5_000
    )
    const flushWhenBackgrounded = () => {
      if (document.visibilityState === 'hidden') {
        void flushDirtyAnswers().catch(() => undefined)
      }
    }
    const flushOnPageHide = () => void flushDirtyAnswers().catch(() => undefined)
    document.addEventListener('visibilitychange', flushWhenBackgrounded)
    window.addEventListener('pagehide', flushOnPageHide)
    return () => {
      window.clearInterval(periodicFlush)
      document.removeEventListener('visibilitychange', flushWhenBackgrounded)
      window.removeEventListener('pagehide', flushOnPageHide)
    }
  }, [flushDirtyAnswers, session])

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
      await flushDirtyAnswers(true).catch(() => undefined)
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
  }, [flushDirtyAnswers, loadResult, session, showIntegrityNotice])

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
      const attemptNumber = response.data.data.attemptNumber ?? preflight.attemptsUsed + 1
      setPreflight((current) =>
        current
          ? {
              ...current,
              attemptsUsed: Math.max(current.attemptsUsed, attemptNumber),
              attemptsRemaining: Math.max(0, current.maxAttempts - attemptNumber),
              session: {
                id: response.data.data.id,
                status: response.data.data.status,
                reviewStatus: response.data.data.reviewStatus,
                attemptNumber,
              },
            }
          : current
      )
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

  const submit = useCallback(
    async (askConfirmation = true) => {
      if (!session || submittingRef.current) return
      const questions = session.assessment.sections.flatMap((section) => section.questions)
      const unanswered = questions.filter((question) => !answers[question.id] || Object.values(answers[question.id]).every((value) => value === '' || value === null || value === undefined))
      if (askConfirmation && !window.confirm(`Bạn còn ${unanswered.length} câu chưa trả lời. Xác nhận nộp bài?`)) return
      submittingRef.current = true
      setSubmitting(true)
      try {
        if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
        await flushDirtyAnswers(true)
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
    [answers, flushDirtyAnswers, loadResult, session]
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

  const resultId = result?.id
  const resultReviewStatus = result?.reviewStatus
  useEffect(() => {
    if (!resultId || resultReviewStatus === 'official') return
    const delays = [5_000, 10_000, 20_000, 30_000, 60_000]
    let attempt = 0
    let timer: number | null = null
    let cancelled = false
    const poll = async () => {
      try {
        await loadResult(resultId)
      } catch {
        // Giữ trang kết quả ổn định khi backend hoặc nhà cung cấp AI tạm thời chậm.
      } finally {
        if (!cancelled) {
          attempt += 1
          timer = window.setTimeout(poll, delays[Math.min(attempt, delays.length - 1)])
        }
      }
    }
    const refreshOnFocus = () => void loadResult(resultId).catch(() => undefined)
    timer = window.setTimeout(poll, delays[0])
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [loadResult, resultId, resultReviewStatus])

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
  if (!preflight) return <div className="card p-8 text-center text-slate-500 font-semibold">Không tìm thấy bài kiểm tra.</div>
  if (review) return <AssessmentSubmissionReview review={review} onBack={() => setReview(null)} />
  if (result) {
    const now = Date.now() + serverOffsetRef.current
    const canRetry =
      preflight.attemptsRemaining > 0 &&
      now >= new Date(preflight.opensAt).getTime() &&
      now < new Date(preflight.closesAt).getTime()
    return (
      <AssessmentResult
        result={result}
        attemptNumber={result.attemptNumber ?? preflight.session?.attemptNumber ?? preflight.attemptsUsed}
        maxAttempts={preflight.maxAttempts}
        attemptsRemaining={preflight.attemptsRemaining}
        canRetry={canRetry}
        reviewLoading={reviewLoading}
        onReview={() => void loadReview(result.id)}
        onRetry={() => {
          setReview(null)
          setResult(null)
        }}
      />
    )
  }

  if (!session) {
    const now = Date.now() + serverOffsetRef.current
    const notOpen = now < new Date(preflight.opensAt).getTime()
    const closed = now >= new Date(preflight.closesAt).getTime()
    const noAttempts = preflight.attemptsRemaining <= 0
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          to="/student/assessments"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-700 hover:text-teal-800 transition-colors"
        >
          <span>←</span> Quay lại danh sách bài kiểm tra
        </Link>

        <div className="card overflow-hidden border border-slate-200/90 shadow-md">
          {/* Header Banner */}
          <div className="relative overflow-hidden rounded-t-xl bg-gradient-to-r from-teal-700 via-cyan-700 to-blue-800 p-6 sm:p-8 text-white shadow-sm border-b-4 border-secondary">
            <div className="absolute right-0 top-0 h-44 w-44 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-2xl pointer-events-none" />
            <div className="relative z-10 space-y-2">
              <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-cyan-100 backdrop-blur-xs">
                Chuẩn bị làm bài
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                {preflight.title}
              </h1>
            </div>
          </div>

          <div className="space-y-6 p-6 sm:p-8 bg-white">
            {/* Stat Cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:bg-slate-50">
                <span className="text-xl">⏱️</span>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Thời lượng</p>
                <p className="mt-0.5 text-lg font-black text-slate-900">{preflight.durationMinutes} phút</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:bg-slate-50">
                <span className="text-xl">📝</span>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Số câu hỏi</p>
                <p className="mt-0.5 text-lg font-black text-slate-900">{preflight.questionCount} câu</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:bg-slate-50">
                <span className="text-xl">🏆</span>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Tổng điểm</p>
                <p className="mt-0.5 text-lg font-black text-slate-900">{preflight.totalPoints} điểm</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:bg-slate-50">
                <span className="text-xl">🔁</span>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Lượt làm</p>
                <p className="mt-0.5 text-lg font-black text-slate-900">
                  {preflight.attemptsUsed + 1}/{preflight.maxAttempts}
                </p>
              </div>
            </div>

            {/* Instructions */}
            {preflight.instructions && (
              <div className="rounded-xl border border-cyan-200/70 bg-cyan-50/30 p-4 text-xs sm:text-sm leading-relaxed text-slate-700 whitespace-pre-wrap font-medium">
                <p className="text-xs font-bold uppercase tracking-wider text-cyan-800 mb-1.5">📌 Hướng dẫn làm bài</p>
                {assessmentText(preflight.instructions)}
              </div>
            )}

            {/* Exam Rules & Notices */}
            <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 text-xs sm:text-sm text-slate-700">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">📋 Quy chế & Lưu ý bài thi</p>
              <ul className="space-y-2 text-xs sm:text-sm font-medium">
                <li className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0" />
                  <span>Thời gian mở: <strong className="text-slate-900">{new Date(preflight.opensAt).toLocaleString('vi-VN')}</strong></span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                  <span>Thời gian đóng: <strong className="text-slate-900">{new Date(preflight.closesAt).toLocaleString('vi-VN')}</strong></span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-cyan-500 shrink-0" />
                  <span>Câu trả lời được tự động lưu; tải lại trang không làm mất bài thi.</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />
                  <span>Bạn được làm tối đa <strong>{preflight.maxAttempts} lượt</strong>; đây là lượt {preflight.attemptsUsed + 1}.</span>
                </li>
                {preflight.showPredictedScore && (
                  <li className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                    <span>Điểm LLM hiển thị trước dưới nhãn “dự kiến”; Giảng viên duyệt mới thành điểm chính thức.</span>
                  </li>
                )}
                {preflight.shuffleQuestions && (
                  <li className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    <span>Thứ tự các câu hỏi trắc nghiệm được trộn ngẫu nhiên riêng cho lượt thi này.</span>
                  </li>
                )}
                <li className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                  <span>Chế độ toàn màn hình là bắt buộc; chuyển tab, thu nhỏ hoặc mất focus sẽ ghi nhận cảnh báo.</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                  <span>Thao tác Sao chép (Copy), Dán (Paste), Chuột phải và Phím tắt DevTools bị khóa.</span>
                </li>
              </ul>
            </div>

            {/* Start CTA Button */}
            <button
              onClick={() => void start()}
              disabled={starting || notOpen || closed || noAttempts}
              className="btn-primary btn-lg w-full text-sm font-bold shadow-md hover:shadow-lg transition-all h-12"
            >
              {notOpen
                ? 'Bài kiểm tra chưa mở'
                : closed
                  ? 'Bài kiểm tra đã đóng'
                  : noAttempts
                    ? 'Đã sử dụng hết lượt làm'
                    : starting
                      ? 'Đang khởi tạo bài thi...'
                      : `Bắt đầu lượt ${preflight.attemptsUsed + 1}`}
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
        <div className="fixed left-1/2 top-4 z-[70] w-[min(92vw,680px)] -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-900 shadow-xl animate-fade-in" role="alert">
          {integrityNotice}
        </div>
      )}
      {fullscreenRequired && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-xs" role="alert" aria-live="assertive">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl space-y-3">
            <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-800">
              Tạm khóa bài làm
            </span>
            <h2 className="text-xl font-black text-slate-900">Cần trở lại toàn màn hình</h2>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-600 font-medium">
              Nội dung bài thi chỉ hiển thị trong chế độ toàn màn hình. Thao tác thoát đã được hệ thống ghi nhận.
            </p>
            <button onClick={() => void restoreFullscreen()} className="btn-primary mt-4 w-full h-10 text-xs font-bold">
              Trở lại toàn màn hình
            </button>
          </div>
        </div>
      )}

      {/* Sticky Active Exam Header */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white/95 backdrop-blur-md px-5 py-3 shadow-md border-t-4 border-t-cyan-500">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">{session.assessment.title}</h1>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            Lượt {session.session.attemptNumber ?? Math.max(1, preflight.attemptsUsed)}/{preflight.maxAttempts} · Đã trả lời <strong className="text-teal-700">{answeredCount}</strong>/{questions.length} câu · Gắn cờ <strong className="text-amber-600">{flaggedQuestionIds.length}</strong> ·{' '}
            {saveState === 'saved'
              ? '✓ Đã lưu'
              : saveState === 'saving'
              ? '⏳ Đang lưu...'
              : '⚠️ Lỗi lưu - thử lại...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-lg px-3 py-1.5 text-xs font-black ${warningCount > 0 ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'}`}>
            Cảnh báo {warningCount}/{session.integrity?.warningThreshold ?? preflight.warningThreshold}
          </span>
          <div
            className={`rounded-xl px-3.5 py-1.5 font-mono text-base font-black shadow-inner border ${
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
            className="btn-primary h-9 px-4 text-xs font-bold shadow-sm hover:shadow-md transition-all"
          >
            {submitting ? 'Đang nộp...' : 'Nộp bài'}
          </button>
        </div>
      </div>

      {/* Grid Layout: Sidebar Navigation + Question Cards */}
      <div className="grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="card sticky top-20 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Điều hướng câu hỏi</p>
            <span className="text-[11px] font-bold text-teal-700">{answeredCount}/{questions.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {questions.map((question, index) => (
              <a
                key={question.id}
                href={`#question-${question.id}`}
                title={flaggedSet.has(question.id) ? `Câu ${index + 1} đã gắn cờ` : `Đi tới câu ${index + 1}`}
                className={`relative flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                  flaggedSet.has(question.id)
                    ? 'border-amber-400 bg-amber-50 text-amber-800 shadow-2xs font-black ring-1 ring-amber-300'
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
              <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/90 px-6 py-3.5 border-l-4 border-primary">
                <h2 className="text-sm font-extrabold text-slate-900">{section.title}</h2>
                <span className="inline-flex items-center rounded-md bg-cyan-500 px-2.5 py-0.5 text-xs font-black text-white shadow-2xs">
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
    <article id={`question-${question.id}`} className="scroll-mt-24 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 whitespace-pre-wrap break-words text-sm font-bold leading-relaxed text-slate-900 flex items-start gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-black text-teal-800">
            {number}
          </span>
          <div className="mt-0.5">{assessmentText(question.prompt)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={flagged}
            onClick={onToggleFlag}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition ${
              flagged
                ? 'border-amber-400 bg-amber-50 text-amber-800 shadow-2xs'
                : 'border-slate-200 bg-white text-slate-500 hover:border-amber-300 hover:text-amber-700'
            }`}
            title={flagged ? 'Bỏ gắn cờ câu hỏi' : 'Gắn cờ để xem lại câu hỏi'}
          >
            <span aria-hidden="true">⚑</span>
            {flagged ? 'Đã gắn cờ' : 'Gắn cờ'}
          </button>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {question.points} điểm
          </span>
        </div>
      </div>

      {question.type === 'true_false' && (
        <div className="flex flex-wrap gap-3 pl-8">
          {[true, false].map((option) => (
            <label
              key={String(option)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-5 py-2.5 text-xs sm:text-sm font-bold transition-all shadow-2xs ${
                value.value === option
                  ? 'border-teal-600 bg-teal-50/80 text-teal-900 ring-2 ring-teal-600/20'
                  : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <input type="radio" checked={value.value === option} onChange={() => onChange({ value: option })} className="text-teal-600 focus:ring-teal-500" />
              {option ? 'Đúng' : 'Sai'}
            </label>
          ))}
        </div>
      )}

      {question.type === 'single_choice' && (
        <div className="space-y-2.5 pl-8">
          {question.options.map((option, index) => (
            <label
              key={option.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs sm:text-sm font-medium transition-all shadow-2xs ${
                value.optionId === option.id
                  ? 'border-teal-600 bg-teal-50/80 text-teal-950 ring-2 ring-teal-600/20 font-bold'
                  : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <input
                type="radio"
                className="mt-0.5 text-teal-600 focus:ring-teal-500"
                checked={value.optionId === option.id}
                onChange={() => onChange({ optionId: option.id })}
              />
              <span className="whitespace-pre-wrap break-words">
                <strong className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-black text-slate-700">
                  {String.fromCharCode(65 + index)}
                </strong>
                {assessmentText(option.content)}
              </span>
            </label>
          ))}
        </div>
      )}

      {['short_text', 'essay', 'code_analysis'].includes(question.type) && (
        <div className="pl-8">
          <textarea
            rows={question.type === 'short_text' ? 3 : 8}
            className={`input rounded-xl border-slate-200/90 p-3.5 focus:ring-teal-500/20 font-medium ${
              question.type === 'code_analysis' ? 'font-mono text-xs' : ''
            }`}
            value={typeof value.text === 'string' ? value.text : ''}
            onChange={(event) => onChange({ text: event.target.value })}
            placeholder="Nhập câu trả lời của bạn ở đây..."
          />
        </div>
      )}
    </article>
  )
}

function AssessmentResult({
  result,
  attemptNumber,
  maxAttempts,
  attemptsRemaining,
  canRetry,
  reviewLoading,
  onReview,
  onRetry,
}: {
  result: ResultPayload
  attemptNumber: number
  maxAttempts: number
  attemptsRemaining: number
  canRetry: boolean
  reviewLoading: boolean
  onReview: () => void
  onRetry: () => void
}) {
  const official = result.reviewStatus === 'official' && result.officialScore !== null
  const hasVisiblePredicted =
    result.showPredictedScore && result.predictedReady && result.predictedScore !== null

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        to="/student/assessments"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-700 hover:text-teal-800 transition-colors"
      >
        <span>←</span> Quay lại danh sách bài kiểm tra
      </Link>

      <div className="card overflow-hidden border border-slate-200/90 shadow-md">
        {/* Result Header */}
        <div
          className={`relative overflow-hidden rounded-t-xl p-6 sm:p-8 text-white shadow-sm border-b-4 border-secondary ${
            official
              ? 'bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800'
              : 'bg-gradient-to-r from-teal-700 via-cyan-700 to-blue-800'
          }`}
        >
          <div className="absolute right-0 top-0 h-44 w-44 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative z-10 space-y-2">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-cyan-100 backdrop-blur-xs">
              {official ? 'Kết quả chính thức' : hasVisiblePredicted ? 'Kết quả dự kiến' : 'Bài đã nộp'}
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
              {result.title}
            </h1>
          </div>
        </div>

        <div className="space-y-6 p-6 sm:p-8 text-center bg-white">
          {official ? (
            <div className="space-y-2">
              <p className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider">Đã được giảng viên duyệt điểm</p>
              <p className="text-5xl font-black text-emerald-700">{result.officialScore}<span className="text-2xl text-emerald-600/80 font-bold">/{result.totalPoints}</span></p>
            </div>
          ) : hasVisiblePredicted ? (
            <div className="space-y-3">
              <p className="text-xs font-extrabold text-cyan-800 uppercase tracking-wider">Điểm dự kiến từ chấm tự động và AI</p>
              <p className="text-5xl font-black text-teal-700">{result.predictedScore}<span className="text-2xl text-teal-600/80 font-bold">/{result.totalPoints}</span></p>
              <div className="rounded-xl border border-amber-200/90 bg-amber-50/80 p-3.5 text-xs sm:text-sm font-medium text-amber-850 shadow-2xs">
                Điểm này chưa chính thức. Giảng viên có thể duyệt hoặc chấm lại phần tự luận.
              </div>
            </div>
          ) : result.reviewStatus === 'pending_review' || result.predictedReady ? (
            <div className="space-y-2 py-4">
              <p className="text-base font-bold text-slate-800">Bài đã chấm sơ bộ và đang chờ giảng viên duyệt.</p>
              <p className="text-xs text-slate-500 font-medium">Điểm chính thức sẽ xuất hiện sau khi giảng viên hoàn tất chấm bài.</p>
            </div>
          ) : (
            <div className="space-y-3 py-6">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-600" />
              <p className="text-base font-bold text-slate-800">AI đang chấm phần tự luận...</p>
              <p className="text-xs text-slate-500 font-medium">Trang tự động cập nhật khi có điểm dự kiến.</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3 pt-2 border-t border-slate-100">
            <Meta label="Điểm trắc nghiệm tự động" value={`${result.autoScore}/${result.totalPoints}`} />
            <Meta label="Trạng thái duyệt" value={official ? 'Chính thức' : 'Chờ GV duyệt'} />
            <Meta label="Lượt làm" value={`${attemptNumber}/${maxAttempts}`} />
          </div>

          <p className="text-xs font-semibold text-slate-400">
            Thời gian nộp bài: {new Date(result.submittedAt).toLocaleString('vi-VN')}
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            {official && (
              <button
                type="button"
                onClick={onReview}
                disabled={reviewLoading}
                className="btn-secondary"
              >
                {reviewLoading ? 'Đang tải bài nộp...' : 'Xem lại bài nộp'}
              </button>
            )}
            {canRetry && (
              <button type="button" onClick={onRetry} className="btn-primary">
                Làm lượt tiếp theo
              </button>
            )}
          </div>
          {!canRetry && attemptsRemaining > 0 && (
            <p className="text-xs font-semibold text-slate-500">
              Bạn còn {attemptsRemaining} lượt nhưng thời gian làm bài hiện đã đóng.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function AssessmentSubmissionReview({
  review,
  onBack,
}: {
  review: ReviewPayload
  onBack: () => void
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-700 transition-colors hover:text-teal-900"
        >
          <span aria-hidden="true">←</span> Quay lại kết quả
        </button>
        <Link
          to="/student/assessments"
          className="text-xs font-bold text-slate-500 hover:text-primary"
        >
          Danh sách bài kiểm tra
        </Link>
      </div>

      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 p-6 text-white shadow-md sm:p-8">
        <p className="text-xs font-black uppercase tracking-wider text-emerald-100">
          Bài nộp đã chấm · Lượt {review.attemptNumber}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">{review.title}</h1>
            <p className="mt-2 text-xs font-semibold text-emerald-100">
              Nộp lúc {new Date(review.submittedAt).toLocaleString('vi-VN')} · Chấm xong lúc{' '}
              {new Date(review.officialAt).toLocaleString('vi-VN')}
            </p>
          </div>
          <div className="rounded-xl bg-white/15 px-5 py-3 text-center backdrop-blur-xs">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-100">
              Điểm chính thức
            </p>
            <p className="text-3xl font-black">
              {formatAssessmentScore(review.officialScore)}/{formatAssessmentScore(review.totalPoints)}
            </p>
          </div>
        </div>
      </header>

      {review.instructions && (
        <div className="card whitespace-pre-wrap p-5 text-sm leading-6 text-slate-700">
          {assessmentText(review.instructions)}
        </div>
      )}

      {review.sections.map((section) => (
        <section key={section.id} className="card overflow-hidden border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 className="font-black text-slate-900">{section.title}</h2>
            <span className="badge-blue">{formatAssessmentScore(section.points)} điểm</span>
          </div>
          {section.introContent && (
            <pre className="m-5 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-4 font-mono text-xs leading-6 text-emerald-300">
              {assessmentText(section.introContent)}
            </pre>
          )}
          <div className="divide-y divide-slate-100">
            {section.questions.map((question, index) => (
              <ReviewQuestionCard key={question.id} question={question} number={index + 1} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ReviewQuestionCard({ question, number }: { question: ReviewQuestion; number: number }) {
  return (
    <article className="space-y-4 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2.5 whitespace-pre-wrap break-words text-sm font-bold leading-relaxed text-slate-900">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-black text-teal-800">
            {number}
          </span>
          <span>{assessmentText(question.prompt)}</span>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
          {formatAssessmentScore(question.awardedPoints)}/{formatAssessmentScore(question.points)} điểm
        </span>
      </div>

      <div className="pl-0 sm:pl-8">
        <SubmittedAnswer question={question} />
      </div>

      {question.feedback && (
        <div className="ml-0 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700 sm:ml-8">
          <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">Nhận xét</p>
          <p className="mt-1 whitespace-pre-wrap leading-6">{question.feedback}</p>
        </div>
      )}
    </article>
  )
}

function SubmittedAnswer({ question }: { question: ReviewQuestion }) {
  const answer = question.answer
  if (question.type === 'true_false') {
    if (typeof answer.value !== 'boolean') return <EmptyAnswer />
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900">
        Câu trả lời của bạn: {answer.value ? 'Đúng' : 'Sai'}
      </div>
    )
  }

  if (question.type === 'single_choice') {
    const selectedOptionId = typeof answer.optionId === 'string' ? answer.optionId : null
    return (
      <div className="space-y-2">
        {question.options.map((option, index) => {
          const selected = option.id === selectedOptionId
          return (
            <div
              key={option.id}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                selected
                  ? 'border-teal-400 bg-teal-50 font-bold text-teal-950 ring-1 ring-teal-200'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-black text-slate-700">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="flex-1 whitespace-pre-wrap break-words">
                {assessmentText(option.content)}
              </span>
              {selected && <span className="shrink-0 text-[10px] font-black uppercase text-teal-700">Đã chọn</span>}
            </div>
          )
        })}
        {!selectedOptionId && <EmptyAnswer />}
      </div>
    )
  }

  const text = typeof answer.text === 'string' ? answer.text : ''
  if (!text.trim()) return <EmptyAnswer />
  return (
    <pre
      className={`overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 ${
        question.type === 'code_analysis' ? 'font-mono' : 'font-sans'
      }`}
    >
      {assessmentText(text)}
    </pre>
  )
}

function EmptyAnswer() {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold italic text-slate-500">
      Không có câu trả lời.
    </p>
  )
}

function formatAssessmentScore(value: number) {
  return Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-center transition-all hover:bg-slate-100/50">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-base font-black text-slate-900">{value}</p>
    </div>
  )
}
