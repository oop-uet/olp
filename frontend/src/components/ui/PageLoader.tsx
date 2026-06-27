/**
 * Full-area loading state shown while a lazy route chunk is being fetched
 * or while a page is loading its initial data.
 */
export function PageLoader({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3" role="status">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-100 border-t-primary" />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  )
}

/**
 * A simple inline spinner for buttons and small areas.
 */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  )
}
