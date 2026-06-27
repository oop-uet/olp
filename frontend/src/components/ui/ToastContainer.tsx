import { useToastStore, ToastType } from '../../stores/toast.store'
import { CheckCircleIcon, XCircleIcon, InfoIcon } from './Icon'

const config: Record<ToastType, { cls: string; icon: JSX.Element }> = {
  success: { cls: 'border-success-500 bg-success-50 text-success-700', icon: <CheckCircleIcon className="h-5 w-5 text-success-600" /> },
  error: { cls: 'border-danger-500 bg-danger-50 text-danger-700', icon: <XCircleIcon className="h-5 w-5 text-danger-600" /> },
  warning: { cls: 'border-warning-500 bg-warning-50 text-warning-700', icon: <InfoIcon className="h-5 w-5 text-warning-600" /> },
  info: { cls: 'border-primary-500 bg-primary-50 text-primary-700', icon: <InfoIcon className="h-5 w-5 text-primary-600" /> },
}

/**
 * Global toast notifications. Mount once at the app root.
 */
export function ToastContainer() {
  const { toasts, remove } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const c = config[t.type]
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border-l-4 bg-white px-4 py-3 shadow-card-hover animate-slide-in-right ${c.cls}`}
            role="alert"
          >
            <span className="mt-0.5 shrink-0">{c.icon}</span>
            <p className="flex-1 text-sm font-medium">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="shrink-0 text-gray-400 transition-colors hover:text-gray-600"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
