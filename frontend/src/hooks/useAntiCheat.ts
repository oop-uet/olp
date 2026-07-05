import { useCallback, useRef, useState } from 'react'
import { api } from '../lib/api'

export type AntiCheatEventType =
  | 'fullscreen_exit'
  | 'visibility_hidden'
  | 'window_blur'
  | 'devtools_open'
  | 'navigation_back'
  | 'copy_attempt'

export interface AntiCheatEvent {
  type: AntiCheatEventType
  timestamp: string
  warningCountAtEvent: number
}

export interface UseAntiCheatOptions {
  /** Warning threshold before score nullification (default: 3) */
  threshold?: number
  /** Exercise ID for the current assessment */
  exerciseId: string
  /** Submission/session ID */
  submissionId?: string
}

export interface UseAntiCheatReturn {
  /** Current number of warnings */
  warningCount: number
  /** Warning threshold */
  threshold: number
  /** Whether the score has been nullified */
  isNullified: boolean
  /** Whether the monitor is actively tracking */
  isActive: boolean
  /** Whether fullscreen was denied by the user */
  fullscreenDenied: boolean
  /** Recorded anti-cheat events */
  events: AntiCheatEvent[]
  /** Activate the anti-cheat monitor (requests fullscreen) */
  activate: () => Promise<boolean>
  /** Deactivate the anti-cheat monitor */
  deactivate: () => void
  /** Record a warning event */
  recordWarning: (type: AntiCheatEventType) => void
}

/**
 * Custom hook managing anti-cheat state for assessment exercises.
 * Tracks violations, sends events to backend, and handles score nullification.
 */
export function useAntiCheat({
  threshold = 3,
  exerciseId,
  submissionId,
}: UseAntiCheatOptions): UseAntiCheatReturn {
  const [warningCount, setWarningCount] = useState(0)
  const [isNullified, setIsNullified] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [fullscreenDenied, setFullscreenDenied] = useState(false)
  const [events, setEvents] = useState<AntiCheatEvent[]>([])

  // Use ref to track the latest warning count inside callbacks
  const warningCountRef = useRef(0)

  const sendEventToBackend = useCallback(
    async (type: AntiCheatEventType, currentWarningCount: number) => {
      try {
        await api.post('/api/anticheat/events', {
          exercise_id: exerciseId,
          submission_id: submissionId,
          event_type: type,
          warning_count: currentWarningCount,
        })
      } catch {
        // Silently fail — don't disrupt assessment if backend is unreachable
      }
    },
    [exerciseId, submissionId]
  )

  const recordWarning = useCallback(
    (type: AntiCheatEventType) => {
      if (isNullified) return

      const newCount = warningCountRef.current + 1
      warningCountRef.current = newCount

      const event: AntiCheatEvent = {
        type,
        timestamp: new Date().toISOString(),
        warningCountAtEvent: newCount,
      }

      setWarningCount(newCount)
      setEvents((prev) => [...prev, event])
      sendEventToBackend(type, newCount)

      if (newCount >= threshold) {
        setIsNullified(true)
      }
    },
    [isNullified, threshold, sendEventToBackend]
  )

  const activate = useCallback(async (): Promise<boolean> => {
    try {
      await document.documentElement.requestFullscreen()
      setIsActive(true)
      setFullscreenDenied(false)
      return true
    } catch {
      setFullscreenDenied(true)
      setIsActive(false)
      return false
    }
  }, [])

  const deactivate = useCallback(() => {
    setIsActive(false)
    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        const result = document.exitFullscreen()
        if (result && typeof result.catch === 'function') {
          result.catch(() => {
            // Ignore exit errors
          })
        }
      }
    } catch {
      // Ignore errors during fullscreen exit
    }
  }, [])

  return {
    warningCount,
    threshold,
    isNullified,
    isActive,
    fullscreenDenied,
    events,
    activate,
    deactivate,
    recordWarning,
  }
}
