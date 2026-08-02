import { isAxiosError } from 'axios'

interface ApiErrorBody {
  error?: {
    message?: string
    details?: unknown
  }
}

export function readApiError(error: unknown) {
  if (!isAxiosError<ApiErrorBody>(error)) return { message: undefined, details: undefined }
  return {
    message: error.response?.data?.error?.message,
    details: error.response?.data?.error?.details,
  }
}
