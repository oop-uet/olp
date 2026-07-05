import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../stores/auth.store'
import { useRedirectStore } from '../stores/redirect.store'
import { toast } from '../stores/toast.store'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const APP_BASE_URL = import.meta.env.BASE_URL || '/'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

const CACHE_PREFIX = 'oop-api-cache:v1:'
const DEFAULT_CACHE_TTL_MS = 60_000
const LONG_CACHE_TTL_MS = 5 * 60_000
const inflightGetRequests = new Map<string, Promise<AxiosResponse>>()

const LONG_CACHE_PATHS = [
  '/api/students/sections',
  '/api/students/exercises',
  '/api/instructor/sections',
  '/api/exercises/library',
]

function stableParams(params: unknown): string {
  if (!params || typeof params !== 'object') return ''
  return JSON.stringify(
    Object.keys(params as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = (params as Record<string, unknown>)[key]
        return acc
      }, {})
  )
}

function getCacheKey(url: string, config?: AxiosRequestConfig): string {
  const userId = useAuthStore.getState().user?.id ?? 'anonymous'
  return `${CACHE_PREFIX}${userId}:${url}:${stableParams(config?.params)}`
}

function getCacheTtl(url: string, ttlMs?: number): number {
  if (typeof ttlMs === 'number') return ttlMs
  return LONG_CACHE_PATHS.some((path) => url.startsWith(path))
    ? LONG_CACHE_TTL_MS
    : DEFAULT_CACHE_TTL_MS
}

function readCachedData<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const cached = JSON.parse(raw) as { expiresAt: number; data: T }
    if (Date.now() > cached.expiresAt) {
      sessionStorage.removeItem(key)
      return null
    }
    return cached.data
  } catch {
    sessionStorage.removeItem(key)
    return null
  }
}

function writeCachedData<T>(key: string, data: T, ttlMs: number) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        expiresAt: Date.now() + ttlMs,
        data,
      })
    )
  } catch {
    // Storage can be full or disabled; performance cache is best-effort.
  }
}

export function clearApiCache() {
  inflightGetRequests.clear()
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) {
        sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Best-effort cache cleanup.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cachedGet<T = any>(
  url: string,
  config?: AxiosRequestConfig,
  options: { ttlMs?: number; force?: boolean } = {}
): Promise<AxiosResponse<T>> {
  const key = getCacheKey(url, config)
  const ttlMs = getCacheTtl(url, options.ttlMs)

  if (!options.force) {
    const cachedData = readCachedData<T>(key)
    if (cachedData !== null) {
      return {
        data: cachedData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config ?? {},
      } as AxiosResponse<T>
    }

    const inflight = inflightGetRequests.get(key) as Promise<AxiosResponse<T>> | undefined
    if (inflight) return inflight
  }

  const request = api.get<T>(url, config).then((response) => {
    writeCachedData(key, response.data, ttlMs)
    return response
  })

  inflightGetRequests.set(key, request)
  request.finally(() => inflightGetRequests.delete(key))
  return request
}

// Request interceptor: attach Authorization header
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState()
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: handle 401 and attempt token refresh
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token)
    }
  })
  failedQueue = []
}

function buildAppUrl(path: string): string {
  const base = APP_BASE_URL.endsWith('/') ? APP_BASE_URL : `${APP_BASE_URL}/`
  return `${base}${path.replace(/^\//, '')}`
}

function getCurrentRouterPath(): string {
  const base = APP_BASE_URL.endsWith('/') ? APP_BASE_URL.slice(0, -1) : APP_BASE_URL
  const pathname = window.location.pathname
  const routePath =
    base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname
  return `${routePath}${window.location.search}${window.location.hash}`
}

function redirectToLogin() {
  const currentPath = getCurrentRouterPath()
  if (currentPath !== '/login') {
    useRedirectStore.getState().setIntendedDestination(currentPath)
  }
  window.location.assign(buildAppUrl('/login'))
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    // Surface server (5xx) and network errors as toasts. 401 is handled by the
    // refresh logic below; 4xx validation errors are handled by the pages.
    if (!error.response) {
      toast.error(
        'Không thể kết nối tới máy chủ. Máy chủ có thể đang khởi động, vui lòng thử lại sau 30 giây.'
      )
    } else if (error.response.status >= 500) {
      toast.error('Lỗi máy chủ. Vui lòng thử lại sau.')
    }

    // Only handle 401 errors that haven't been retried
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    // Don't intercept auth endpoints to avoid infinite loops
    if (originalRequest.url?.includes('/api/auth/')) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      // Queue this request while refresh is in progress
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`
        }
        return api(originalRequest)
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    const { refreshToken, setTokens, clearAuth } = useAuthStore.getState()

    if (!refreshToken) {
      clearAuth()
      redirectToLogin()
      return Promise.reject(error)
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
        refreshToken,
      })

      const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
        response.data

      setTokens(newAccessToken, newRefreshToken)
      processQueue(null, newAccessToken)

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
      }

      return api(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      clearAuth()
      redirectToLogin()
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

api.interceptors.response.use((response) => {
  const method = response.config.method?.toLowerCase()
  if (method && method !== 'get') {
    clearApiCache()
  }
  return response
})
