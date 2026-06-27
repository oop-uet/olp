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
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    cleanup()
    setStatus('connecting')
    setConnectionError(null)

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('connected')
        setConnectionError(null)
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY
      }

      ws.onclose = () => {
        wsRef.current = null
        setStatus('disconnected')
        scheduleReconnect()
      }

      ws.onerror = () => {
        setStatus('error')
        setConnectionError({
          message: 'Cannot connect to Local Executor. Make sure the executor is running on your machine.',
          setupInstructions:
            'Download and run the Local Executor:\n1. Download local-executor.jar from the course page\n2. Ensure JDK 17+ is installed (run: javac --version)\n3. Run: java -jar local-executor.jar\n4. Click "Retry" to reconnect',
        })
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

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
