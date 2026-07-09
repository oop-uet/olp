const fallbackFeedbackDocUrl =
  'https://docs.google.com/document/d/1bwIVhwYv_hGJRwDZDFOfLmLYTZTRKn8Zh3J1mY73J7M/edit?usp=sharing'

export const feedbackDocUrl =
  import.meta.env.VITE_FEEDBACK_DOC_URL?.trim() || fallbackFeedbackDocUrl

export const isFeedbackEnabled = feedbackDocUrl.length > 0
