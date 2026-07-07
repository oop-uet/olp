import { useState, useRef, useCallback, useEffect } from 'react'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface TestCase {
  id: string
  input: string
  expectedOutput: string
  timeLimit: number
  type?: 'stdio' | 'java_junit'
  testFileName?: string
}

export interface SourceFile {
  name: string
  content: string
}

export interface TestResult {
  id: string
  status: 'passed' | 'failed' | 'timeout' | 'error'
  actualOutput?: string
  executionTimeMs?: number
  error?: string
}

export interface CompilationError {
  line: number
  message: string
}

export interface StyleResult {
  provider: string
  status: 'passed' | 'failed' | 'unavailable'
  score: number
  violationCount: number
  violations: Array<{
    file: string
    line: number
    column: number
    severity: string
    message: string
    source: string
  }>
}

export interface ExecutionResult {
  compiled: boolean
  testResults?: TestResult[]
  errors?: CompilationError[]
  styleResult?: StyleResult
}

export interface ConnectionError {
  code?: string
  message: string
  setupInstructions?: string
}

interface PendingRequest {
  resolve: (result: ExecutionResult) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

const WS_URLS = ['ws://127.0.0.1:9876', 'ws://localhost:9876']
const HTTP_URLS = ['http://127.0.0.1:9877', 'http://localhost:9877']
const INITIAL_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const STATUS_TIMEOUT = 3000
const REQUEST_TIMEOUT = 60000

export function useLocalExecutor() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const pendingRequestRef = useRef<PendingRequest | null>(null)
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(false)
  const connectionAttemptRef = useRef(0)
  const httpBaseUrlRef = useRef<string | null>(null)

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current)
      statusTimerRef.current = null
    }
    if (pendingRequestRef.current) {
      clearTimeout(pendingRequestRef.current.timeoutId)
      pendingRequestRef.current.reject(new Error('Connection closed'))
      pendingRequestRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const tryHttpFallback = useCallback(async () => {
    for (const baseUrl of HTTP_URLS) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), STATUS_TIMEOUT)

      try {
        const response = await fetch(`${baseUrl}/status`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) continue

        const data = await response.json()
        if (data.type !== 'status') continue

        if (data.ready) {
          httpBaseUrlRef.current = baseUrl
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY
          setStatus('connected')
          setConnectionError(null)
          return true
        }

        setStatus('error')
        setConnectionError({
          code: data.code,
          message:
            data.message ||
            'Local Executor chưa sẵn sàng. Hãy kiểm tra JDK 17+ trên máy của bạn.',
          setupInstructions: data.setupInstructions,
        })
        return true
      } catch {
        // Try next local endpoint.
      } finally {
        clearTimeout(timeoutId)
      }
    }

    return false
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current) return

    const delay = reconnectDelayRef.current
    reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY)

    reconnectTimerRef.current = setTimeout(() => {
      if (shouldReconnectRef.current) {
        connectInternal()
      }
    }, delay)
  }, [])

  const connectInternal = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setStatus('connecting')
      setConnectionError(null)
      wsRef.current.send(JSON.stringify({ type: 'status' }))
      return
    }

    cleanup()
    httpBaseUrlRef.current = null
    setStatus('connecting')
    setConnectionError(null)
    connectionAttemptRef.current += 1
    const attemptId = connectionAttemptRef.current

    const tryUrl = (urlIndex: number) => {
      const url = WS_URLS[urlIndex]
      let settled = false

      const failAndTryNext = () => {
        if (settled || attemptId !== connectionAttemptRef.current) return
        settled = true
        if (statusTimerRef.current) {
          clearTimeout(statusTimerRef.current)
          statusTimerRef.current = null
        }

        if (wsRef.current) {
          wsRef.current.onopen = null
          wsRef.current.onclose = null
          wsRef.current.onerror = null
          wsRef.current.onmessage = null
          wsRef.current.close()
          wsRef.current = null
        }

        if (urlIndex + 1 < WS_URLS.length) {
          tryUrl(urlIndex + 1)
          return
        }

        void tryHttpFallback().then((connected) => {
          if (connected) return
          setStatus('error')
          setConnectionError({
            message:
              'Không thể kết nối tới Local Executor dù terminal đang chạy. Trình duyệt đã thử WebSocket 9876 và HTTP 9877 trên 127.0.0.1/localhost.',
            setupInstructions:
              '1. Tải lại bản Local Executor mới nhất\n2. Giữ cửa sổ Local Executor đang mở\n3. Kiểm tra terminal có dòng HTTP fallback available at http://127.0.0.1:9877/status\n4. Nếu dùng Safari và vẫn không có popup cho phép kết nối local, hãy dùng Edge/Chrome cho phiên làm bài',
          })
          scheduleReconnect()
        })
      }

      try {
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'status' }))
          statusTimerRef.current = setTimeout(failAndTryNext, STATUS_TIMEOUT)
        }

        ws.onclose = () => {
          if (!settled) {
            failAndTryNext()
            return
          }
          wsRef.current = null
          setStatus('disconnected')
          scheduleReconnect()
        }

        ws.onerror = failAndTryNext

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            if (data.type === 'status') {
              settled = true
              if (statusTimerRef.current) {
                clearTimeout(statusTimerRef.current)
                statusTimerRef.current = null
              }
              reconnectDelayRef.current = INITIAL_RECONNECT_DELAY

              if (data.ready) {
                setStatus('connected')
                setConnectionError(null)
              } else {
                setStatus('error')
                setConnectionError({
                  code: data.code,
                  message:
                    data.message ||
                    'Local Executor chưa sẵn sàng. Hãy kiểm tra JDK 17+ trên máy của bạn.',
                  setupInstructions: data.setupInstructions,
                })
              }
              return
            }

            if (data.type === 'error') {
              const err: ConnectionError = {
                code: data.code,
                message: data.message,
                setupInstructions: data.setupInstructions,
              }
              setConnectionError(err)

              if (pendingRequestRef.current) {
                clearTimeout(pendingRequestRef.current.timeoutId)
                pendingRequestRef.current.reject(new Error(data.message))
                pendingRequestRef.current = null
              }
              return
            }

            if (data.type === 'result' && pendingRequestRef.current) {
              clearTimeout(pendingRequestRef.current.timeoutId)
              const result: ExecutionResult = {
                compiled: data.compiled,
                testResults: data.testResults,
                errors: data.errors,
                styleResult: data.styleResult,
              }
              pendingRequestRef.current.resolve(result)
              pendingRequestRef.current = null
            }
          } catch {
            // Ignore malformed messages
          }
        }
      } catch {
        failAndTryNext()
      }
    }

    tryUrl(0)
  }, [cleanup, scheduleReconnect, tryHttpFallback])

  const connect = useCallback(() => {
    shouldReconnectRef.current = true
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY
    connectInternal()
  }, [connectInternal])

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    cleanup()
    setStatus('disconnected')
    setConnectionError(null)
  }, [cleanup])

  const compileAndRun = useCallback(
    (codeOrFiles: string | SourceFile[], testCases: TestCase[]): Promise<ExecutionResult> => {
      return new Promise((resolve, reject) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          if (!httpBaseUrlRef.current) {
            reject(new Error('Not connected to Local Executor'))
            return
          }

          const body = Array.isArray(codeOrFiles)
            ? { files: codeOrFiles, testCases }
            : { code: codeOrFiles, testCases }

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
          fetch(`${httpBaseUrlRef.current}/compile-and-run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          })
            .then(async (response) => {
              const data = await response.json()
              if (!response.ok || data.type === 'error') {
                throw new Error(data.message || 'Local Executor returned an error')
              }
              return {
                compiled: data.compiled,
                testResults: data.testResults,
                errors: data.errors,
                styleResult: data.styleResult,
              } as ExecutionResult
            })
            .then(resolve)
            .catch((error) => {
              reject(error instanceof Error ? error : new Error('Execution failed'))
            })
            .finally(() => clearTimeout(timeoutId))
          return
        }

        if (pendingRequestRef.current) {
          clearTimeout(pendingRequestRef.current.timeoutId)
          pendingRequestRef.current.reject(new Error('Request superseded'))
        }

        const timeoutId = setTimeout(() => {
          if (pendingRequestRef.current) {
            pendingRequestRef.current = null
            reject(new Error('Execution timed out'))
          }
        }, REQUEST_TIMEOUT)

        pendingRequestRef.current = { resolve, reject, timeoutId }

        const message = JSON.stringify(
          Array.isArray(codeOrFiles)
            ? { type: 'compile_and_run', files: codeOrFiles, testCases }
            : { type: 'compile_and_run', code: codeOrFiles, testCases }
        )

        wsRef.current.send(message)
      })
    },
    []
  )

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false
      cleanup()
    }
  }, [cleanup])

  return {
    status,
    connectionError,
    isConnected: status === 'connected',
    connect,
    disconnect,
    compileAndRun,
  }
}
