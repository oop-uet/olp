import { feedbackDocUrl, isFeedbackEnabled } from '../../config/feedback'
import { FeedbackIcon } from '../ui/Icon'
import { useAuthStore } from '../../stores/auth.store'

interface FeedbackButtonProps {
  mobile?: boolean
  onClick?: () => void
}

export function FeedbackButton({ mobile = false, onClick }: FeedbackButtonProps) {
  const { user } = useAuthStore()
  const isCustomLabel = user?.role === 'admin'
  const textLabel = isCustomLabel ? 'Xem phản hồi' : 'Gửi phản hồi'

  const label = isFeedbackEnabled ? textLabel : `${textLabel} (chưa cấu hình)`
  const title = isFeedbackEnabled
    ? isCustomLabel
      ? 'Mở Google Docs để xem phản hồi'
      : 'Mở Google Docs để gửi phản hồi'
    : 'Chưa có link Google Docs phản hồi. Hãy cấu hình VITE_FEEDBACK_DOC_URL hoặc fallbackFeedbackDocUrl.'

  if (mobile) {
    if (!isFeedbackEnabled) {
      return (
        <button
          type="button"
          disabled
          title={title}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/45"
        >
          <FeedbackIcon className="h-5 w-5" />
          <span>{label}</span>
        </button>
      )
    }

    return (
      <a
        href={feedbackDocUrl}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
        title={title}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
      >
        <FeedbackIcon className="h-5 w-5" />
        <span>{textLabel}</span>
      </a>
    )
  }

  const className =
    'inline-flex h-9 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-bold text-white transition-all'

  if (!isFeedbackEnabled) {
    return (
      <button
        type="button"
        disabled
        title={title}
        className={`${className} cursor-not-allowed bg-white/5 opacity-60`}
      >
        <FeedbackIcon className="h-4 w-4" />
        <span className="hidden xl:inline">{label}</span>
      </button>
    )
  }

  return (
    <a
      href={feedbackDocUrl}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={`${className} bg-white/10 hover:bg-white/15 hover:border-white/35 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]`}
    >
      <FeedbackIcon className="h-4 w-4" />
      <span className="hidden xl:inline">{textLabel}</span>
    </a>
  )
}
