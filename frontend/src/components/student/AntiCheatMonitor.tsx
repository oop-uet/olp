import { useCallback, useEffect, useRef, useState } from 'react'
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
  isAssessment,
  exerciseId,
  submissionId,
  warningThreshold = 3,
  onNullified,
  children,
}: AntiCheatMonitorProps) {
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
  const [isInitializing, setIsInitializing] = useState(isAssessment)
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasCalledNullifiedRef = useRef(false)

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

  // Request fullscreen on mount for assessments
  useEffect(() => {
    if (!isAssessment) {
      setIsInitializing(false)
      return
    }

    const init = async () => {
      const granted = await activate()
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
  }, [isAssessment])

  // Listen for violations while active
  useEffect(() => {
    if (!isActive || isNullified) return

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        recordWarning('fullscreen_exit')
        showNotification('⚠️ Warning: Fullscreen exit detected!')
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        recordWarning('visibility_hidden')
        showNotification('⚠️ Warning: Tab switch detected!')
      }
    }

    const handleWindowBlur = () => {
      recordWarning('window_blur')
      showNotification('⚠️ Warning: Window lost focus!')
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [isActive, isNullified, recordWarning, showNotification])

  // Trigger onNullified callback when score is nullified
  useEffect(() => {
    if (isNullified && !hasCalledNullifiedRef.current) {
      hasCalledNullifiedRef.current = true
      onNullified?.()
    }
  }, [isNullified, onNullified])

  // Cleanup notification timer on unmount
  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current)
      }
    }
  }, [])

  // Non-assessment exercises: render children directly
  if (!isAssessment) {
    return <>{children}</>
  }

  // Still initializing (requesting fullscreen)
  if (isInitializing) {
    return (
      <div className="flex items-center justify-center p-8" role="status">
        <p className="text-gray-600">Requesting fullscreen mode...</p>
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
            Fullscreen Mode Required
          </h2>
          <p className="mt-2 text-red-700">
            This assessment requires fullscreen mode to proceed. Please allow
            fullscreen access and refresh the page to start the assessment.
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
        <div className="absolute right-4 top-4 z-50">
          <WarningBadge count={warningCount} threshold={threshold} nullified />
        </div>

        {/* Nullification overlay */}
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-white/90"
          role="alert"
          aria-live="assertive"
        >
          <div className="rounded-lg border border-red-300 bg-red-50 p-8 text-center shadow-lg">
            <h2 className="text-xl font-bold text-red-800">
              Assessment Session Locked
            </h2>
            <p className="mt-3 text-red-700">
              Your score has been nullified due to exceeding the maximum number
              of warnings ({threshold}). You received {warningCount} warning(s).
            </p>
            <p className="mt-2 text-sm text-red-600">
              Score: 0%. The code editor and submission are disabled.
            </p>
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
      <div className="absolute right-4 top-4 z-50">
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

      {/* Exercise workspace */}
      {children}
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
      className={`rounded-full border px-3 py-1 text-sm font-medium ${bgColor}`}
      aria-label={`Warnings: ${count} of ${threshold}`}
    >
      Warnings: {count}/{threshold}
    </div>
  )
}
