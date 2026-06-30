import { useState, useRef, useCallback, useEffect } from 'react'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface TestCase {
  id: string
  input: string
  expectedOutput: string
  timeLimit: number
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

export interface ExecutionResult {
  compiled: boolean
  testResults?: TestResult[]
  errors?: CompilationError[]
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

const WS_URL = 'ws://localhost:9876'
const INITIAL_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000
const REQUEST_TIMEOUT = 60000

export function useLocalExecutor() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const pendingRequestRef = useRef<PendingRequest | null>(null)
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef(false)

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
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
    setStatus('connecting')
    setConnectionError(null)

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'status' }))
      }

      ws.onclose = () => {
        wsRef.current = null
        setStatus('disconnected')
        scheduleReconnect()
      }

      ws.onerror = () => {
        setStatus('error')
        setConnectionError({
          message:
            'Không thể kết nối tới Local Executor. Hãy đảm bảo executor JAR đang chạy ở cổng 9876.',
          setupInstructions:
            'Tải và chạy Local Executor:\n1. Tải oop-local-executor-1.0.0.jar từ trang bài tập\n2. Cài JDK 17+ và kiểm tra bằng javac --version\n3. Chạy: java -jar oop-local-executor-1.0.0.jar\n4. Bấm thử kết nối lại',
        })
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'status') {
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
            }
            pendingRequestRef.current.resolve(result)
            pendingRequestRef.current = null
          }
        } catch {
          // Ignore malformed messages
        }
      }
    } catch {
      setStatus('error')
      setConnectionError({
        message: 'Failed to create WebSocket connection',
      })
      scheduleReconnect()
    }
  }, [cleanup, scheduleReconnect])

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
    (code: string, testCases: TestCase[]): Promise<ExecutionResult> => {
      return new Promise((resolve, reject) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reject(new Error('Not connected to Local Executor'))
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

        const message = JSON.stringify({
          type: 'compile_and_run',
          code,
          testCases,
        })

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
