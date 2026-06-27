import { useEffect, useState } from 'react'

interface LoadingIndicatorProps {
  /** Delay in ms before showing the spinner (default: 200) */
  delay?: number
  /** Optional label displayed below the spinner */
  label?: string
}

/**
 * Loading spinner that appears after a configurable delay (default 200ms).
 * Prevents layout flicker for fast loads while giving feedback on slower ones.
 */
export function LoadingIndicator({ delay = 200, label }: LoadingIndicatorProps) {
  const [visible, setVisible] = useState(delay === 0)

  useEffect(() => {
    if (delay === 0) return

    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  if (!visible) return null

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary" />
      {label && <p className="text-sm text-gray-600">{label}</p>}
      <span className="sr-only">Loading...</span>
    </div>
  )
}
