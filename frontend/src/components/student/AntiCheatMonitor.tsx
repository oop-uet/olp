import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAntiCheat } from '../../hooks/useAntiCheat'

interface AntiCheatMonitorProps {
  /** Whether this exercise is an assessment requiring anti-cheat */
  isAssessment: boolean
  /** Exercise ID */
  exerciseId: string
  /** Optional submission/session ID */
  submissionId?: string
  /** Warning threshold (default: 3, from system config) */
  warningThreshold?: number
  /** Callback when score is nullified */
  onNullified?: () => void
  /** Callback before leaving an active fullscreen workspace */
  onExitAttempt?: () => void | Promise<void>
  /** Children to render when assessment is accessible */
  children: React.ReactNode
}

/**
 * Anti-Cheat Monitor component that wraps the exercise workspace during assessments.
 *
 * Behavior:
 * - On mount (assessment only): requests fullscreen mode
 * - If denied: blocks assessment with a message
 * - Listens for fullscreenchange, visibilitychange, and blur events
 * - Tracks warnings and displays "Warnings: X/T" indicator
 * - Nullifies score and locks session when warnings >= threshold
 *
 * For non-assessment exercises, renders children directly without monitoring.
 */
export function AntiCheatMonitor({
  exerciseId,
  submissionId,
  warningThreshold = 3,
  onNullified,
  onExitAttempt,
  children,
}: AntiCheatMonitorProps) {
  const navigate = useNavigate()
  const {
    warningCount,
    threshold,
    isNullified,
    isActive,
    fullscreenDenied,
    activate,
    deactivate,
    recordWarning,
  } = useAntiCheat({ threshold: warningThreshold, exerciseId, submissionId })

  const [notification, setNotification] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [fullscreenRecoveryNeeded, setFullscreenRecoveryNeeded] = useState(false)
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasCalledNullifiedRef = useRef(false)
  const lastDevtoolsWarningAtRef = useRef(0)
  const lastExitWarningAtRef = useRef(0)
  const monitoringStartedAtRef = useRef(0)
  const devtoolsDetectionStreakRef = useRef(0)
  const hasArmedBackGuardRef = useRef(false)
  const suppressNextFullscreenExitRef = useRef(false)

  const exitFullscreenIfNeeded = useCallback(() => {
    if (document.fullscreenElement) {
      suppressNextFullscreenExitRef.current = true
      void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  // Show a temporary notification
  const showNotification = useCallback((message: string, duration = 4000) => {
    setNotification(message)
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current)
    }
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null)
    }, duration)
  }, [])

  const restoreFullscreen = useCallback(async () => {
    const granted = await activate()
    if (granted) {
      monitoringStartedAtRef.current = Date.now()
      setFullscreenRecoveryNeeded(false)
      showNotification('Đã trở lại chế độ toàn màn hình.')
    } else {
      showNotification('Trình duyệt chưa cho phép mở toàn màn hình. Hãy bấm nút thử lại.', 6000)
    }
  }, [activate, showNotification])

  // Request fullscreen on mount for every coding exercise.
  useEffect(() => {
    const init = async () => {
      const granted = await activate()
      if (granted) {
        monitoringStartedAtRef.current = Date.now()
      }
      setIsInitializing(false)
      if (!granted) {
        // fullscreenDenied state is handled by the hook
      }
    }

    init()

    return () => {
      deactivate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for violations while active
  useEffect(() => {
    if (!isActive || isNullified) return

    const isInsideStartupGracePeriod = () => Date.now() - monitoringStartedAtRef.current < 2500

    const handleFullscreenChange = () => {
      if (isInsideStartupGracePeriod()) return
      if (!document.fullscreenElement) {
        if (suppressNextFullscreenExitRef.current) {
          suppressNextFullscreenExitRef.current = false
          return
        }
        recordWarning('fullscreen_exit')
        setFullscreenRecoveryNeeded(true)
        showNotification('Bạn đã thoát khỏi chế độ toàn màn hình.')
      } else {
        setFullscreenRecoveryNeeded(false)
      }
    }

    const handleVisibilityChange = () => {
      if (isInsideStartupGracePeriod()) return
      if (document.visibilityState === 'hidden') {
        recordWarning('visibility_hidden')
        showNotification('Bạn đã chuyển sang tab hoặc ứng dụng khác.')
      }
    }

    const handleWindowBlur = () => {
      if (isInsideStartupGracePeriod() || document.visibilityState === 'hidden') return
      if (!document.fullscreenElement) return
      recordWarning('window_blur')
      showNotification('Cửa sổ làm bài không còn được focus.')
    }

    const handleProtectedCopy = (event: ClipboardEvent) => {
      const target = event.target as Element | null
      if (!target?.closest('[data-protected-content="true"]')) return
      event.preventDefault()
      recordWarning('copy_attempt')
      showNotification('Không được sao chép đề bài hoặc test case.')
    }

    const handleProtectedContextMenu = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (!target?.closest('[data-protected-content="true"]')) return
      event.preventDefault()
      recordWarning('copy_attempt')
      showNotification('Không được mở menu sao chép trong vùng đề bài hoặc test case.')
    }

    const leaveWorkspace = async (targetRoute = '/student/exercises') => {
      try {
        await onExitAttempt?.()
      } finally {
        exitFullscreenIfNeeded()
        navigate(targetRoute)
      }
    }

    const routeFromLink = (link: HTMLAnchorElement): string | null => {
      const explicitRoute = link.dataset.antiCheatTo
      if (explicitRoute) return explicitRoute

      if (link.target && link.target !== '_self') return null
      if (link.hasAttribute('download')) return null

      const href = link.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return null
      }

      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return null

      const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
      const fallbackBasePath = '/olp'
      const stripBasePath = (pathname: string) => {
        for (const prefix of [basePath, fallbackBasePath]) {
          if (prefix && prefix !== '/' && pathname.startsWith(prefix)) {
            return pathname.slice(prefix.length) || '/'
          }
        }
        return pathname
      }

      const routePath = stripBasePath(url.pathname)
      const currentPath = stripBasePath(window.location.pathname)

      const targetRoute = `${routePath}${url.search}${url.hash}`
      const currentRoute = `${currentPath}${window.location.search}${window.location.hash}`
      if (targetRoute === currentRoute) return null

      return targetRoute
    }

    const handleSecureExitClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const link = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!link) return
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const targetRoute = routeFromLink(link)
      if (!targetRoute) return

      event.preventDefault()
      const now = Date.now()
      if (now - lastExitWarningAtRef.current > 1000) {
        lastExitWarningAtRef.current = now
        recordWarning('navigation_back')
        showNotification('Rời khỏi màn hình làm bài được tính là một cảnh báo.')
      }

      if (warningCount + 1 >= threshold) {
        return
      }

      setTimeout(() => {
        void leaveWorkspace(targetRoute)
      }, 180)
    }

    const handleBrowserBack = () => {
      if (!isActive || isNullified) return

      window.history.pushState({ oopAntiCheatGuard: true }, '', window.location.href)
      const now = Date.now()
      if (now - lastExitWarningAtRef.current > 1000) {
        lastExitWarningAtRef.current = now
        recordWarning('navigation_back')
        showNotification('Rời khỏi màn hình làm bài được tính là một cảnh báo.')
      }

      if (warningCount + 1 >= threshold) {
        return
      }

      void leaveWorkspace('/student/exercises')
    }

    if (!hasArmedBackGuardRef.current) {
      hasArmedBackGuardRef.current = true
      window.history.pushState({ oopAntiCheatGuard: true }, '', window.location.href)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('copy', handleProtectedCopy)
    document.addEventListener('cut', handleProtectedCopy)
    document.addEventListener('contextmenu', handleProtectedContextMenu)
    document.addEventListener('click', handleSecureExitClick, true)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('popstate', handleBrowserBack)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('copy', handleProtectedCopy)
      document.removeEventListener('cut', handleProtectedCopy)
      document.removeEventListener('contextmenu', handleProtectedContextMenu)
      document.removeEventListener('click', handleSecureExitClick, true)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('popstate', handleBrowserBack)
    }
  }, [exitFullscreenIfNeeded, isActive, isNullified, navigate, onExitAttempt, recordWarning, showNotification, threshold, warningCount])

  // Browser APIs cannot truly forbid DevTools. Viewport gap detection is only
  // a heuristic, so keep it conservative to avoid punishing normal fullscreen
  // startup, browser chrome quirks, split-screen windows, or zoom/layout changes.
  useEffect(() => {
    if (!isActive || isNullified) return

    const detectDevTools = () => {
      if (!document.fullscreenElement || Date.now() - monitoringStartedAtRef.current < 5000) {
        devtoolsDetectionStreakRef.current = 0
        return
      }

      const widthGap = Math.abs(window.outerWidth - window.innerWidth)
      const heightGap = Math.abs(window.outerHeight - window.innerHeight)
      const widthThreshold = Math.max(260, window.innerWidth * 0.22)
      const heightThreshold = Math.max(260, window.innerHeight * 0.22)
      const looksOpen = widthGap > widthThreshold || heightGap > heightThreshold
      const now = Date.now()

      if (!looksOpen) {
        devtoolsDetectionStreakRef.current = 0
        return
      }

      devtoolsDetectionStreakRef.current += 1

      if (devtoolsDetectionStreakRef.current >= 3 && now - lastDevtoolsWarningAtRef.current > 15_000) {
        lastDevtoolsWarningAtRef.current = now
        devtoolsDetectionStreakRef.current = 0
        recordWarning('devtools_open')
        showNotification('Phát hiện DevTools đang mở trong phiên làm bài.')
      }
    }

    detectDevTools()
    const timer = window.setInterval(detectDevTools, 1500)
    return () => window.clearInterval(timer)
  }, [isActive, isNullified, recordWarning, showNotification])

  // Trigger onNullified callback when score is nullified
  useEffect(() => {
    if (isNullified && !hasCalledNullifiedRef.current) {
      hasCalledNullifiedRef.current = true
      exitFullscreenIfNeeded()
      onNullified?.()
    }
  }, [exitFullscreenIfNeeded, isNullified, onNullified])

  // Cleanup notification timer on unmount
  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current)
      }
    }
  }, [])

  // Still initializing (requesting fullscreen)
  if (isInitializing) {
    return (
      <div className="flex items-center justify-center p-8" role="status">
        <p className="text-gray-600">Đang mở chế độ toàn màn hình...</p>
      </div>
    )
  }

  // Fullscreen denied: block assessment
  if (fullscreenDenied) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 p-8"
        role="alert"
        aria-live="assertive"
      >
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800">
            Cần bật chế độ toàn màn hình
          </h2>
          <p className="mt-2 text-red-700">
            Mọi bài tập yêu cầu chế độ toàn màn hình. Hãy cho phép trình duyệt mở toàn màn
            hình rồi tải lại trang để bắt đầu làm bài.
          </p>
        </div>
      </div>
    )
  }

  // Score nullified: lock session
  if (isNullified) {
    return (
      <div className="relative">
        {/* Warning indicator */}
        <div className="fixed bottom-5 right-5 z-50">
          <WarningBadge count={warningCount} threshold={threshold} nullified />
        </div>

        {/* Nullification overlay */}
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-white/90"
          role="alert"
          aria-live="assertive"
        >
          <div className="w-full max-w-2xl rounded-lg border border-red-200 bg-white p-6 text-center shadow-lg">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">
              Phiên làm bài đã khóa
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Bài làm đã được ghi nhận 0 điểm
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Bạn đã vượt quá ngưỡng cảnh báo chống gian lận ({warningCount}/{threshold}).
              Trình soạn thảo và nút nộp bài đã bị khóa cho phiên này.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                to="/student/exercises"
                onClick={exitFullscreenIfNeeded}
                className="btn-primary h-10 px-4 text-sm"
              >
                Quay lại danh sách bài tập
              </Link>
              <Link
                to="/student/submissions"
                onClick={exitFullscreenIfNeeded}
                className="btn-secondary h-10 px-4 text-sm"
              >
                Xem bài nộp
              </Link>
            </div>
          </div>
        </div>

        {/* Locked workspace (disabled) */}
        <div className="pointer-events-none opacity-50" aria-hidden="true">
          {children}
        </div>
      </div>
    )
  }

  // Active monitoring: render workspace with warning indicator
  return (
    <div className="relative">
      {/* Warning indicator */}
      <div className="fixed bottom-5 right-5 z-50">
        <WarningBadge count={warningCount} threshold={threshold} />
      </div>

      {/* Notification toast */}
      {notification && (
        <div
          className="absolute left-1/2 top-4 z-50 -translate-x-1/2"
          role="alert"
          aria-live="polite"
        >
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 shadow-md">
            <p className="text-sm font-medium text-yellow-800">
              {notification}
            </p>
          </div>
        </div>
      )}

      {fullscreenRecoveryNeeded && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-6"
          role="alert"
          aria-live="assertive"
        >
          <div className="w-full max-w-lg rounded-lg border border-amber-200 bg-white p-6 text-center shadow-xl">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
              Đã thoát toàn màn hình
            </p>
            <h2 className="mt-2 text-xl font-black text-slate-900">
              Bấm nút bên dưới để tiếp tục làm bài
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Phím ESC đã thoát khỏi chế độ toàn màn hình. F11 chỉ đổi chế độ cửa sổ
              của trình duyệt, không cấp lại quyền fullscreen cho hệ thống.
            </p>
            <button
              type="button"
              onClick={restoreFullscreen}
              className="btn-primary mt-5 h-10 px-5 text-sm"
            >
              Trở lại toàn màn hình
            </button>
          </div>
        </div>
      )}

      {/* Exercise workspace */}
      <div className={fullscreenRecoveryNeeded ? 'pointer-events-none select-none blur-[1px]' : undefined}>
        {children}
      </div>
    </div>
  )
}

/** Warning count badge */
function WarningBadge({
  count,
  threshold,
  nullified = false,
}: {
  count: number
  threshold: number
  nullified?: boolean
}) {
  const bgColor = nullified
    ? 'bg-red-100 border-red-300 text-red-800'
    : count > 0
      ? 'bg-yellow-100 border-yellow-300 text-yellow-800'
      : 'bg-green-100 border-green-300 text-green-800'

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm font-bold shadow-lg ${bgColor}`}
      aria-label={`Cảnh báo: ${count} trên ${threshold}`}
    >
      Cảnh báo: {count}/{threshold}
    </div>
  )
}
