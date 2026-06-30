import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalExecutor } from './useLocalExecutor'

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CLOSED = 3

  url: string
  readyState = WebSocket.CONNECTING
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  simulateOpen() {
    this.readyState = WebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  simulateClose() {
    this.readyState = WebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }
}

describe('useLocalExecutor', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('initializes with disconnected status', () => {
    const { result } = renderHook(() => useLocalExecutor())

    expect(result.current.status).toBe('disconnected')
    expect(result.current.isConnected).toBe(false)
    expect(result.current.connectionError).toBeNull()
  })

  it('transitions to connecting then connected on successful connection', () => {
    const { result } = renderHook(() => useLocalExecutor())

    act(() => {
      result.current.connect()
    })

    expect(result.current.status).toBe('connecting')

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })

    expect(MockWebSocket.instances[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'status' }))

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'status',
        ready: true,
        jdkAvailable: true,
      })
    })

    expect(result.current.status).toBe('connected')
    expect(result.current.isConnected).toBe(true)
  })

  it('transitions to error status on connection failure', () => {
    const { result } = renderHook(() => useLocalExecutor())

    act(() => {
      result.current.connect()
    })

    act(() => {
      MockWebSocket.instances[0].simulateError()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.connectionError).not.toBeNull()
    expect(result.current.connectionError?.setupInstructions).toBeDefined()
  })

  it('keeps executor unavailable when status reports missing JDK', () => {
    const { result } = renderHook(() => useLocalExecutor())

    act(() => {
      result.current.connect()
    })
    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'status',
        ready: false,
        jdkAvailable: false,
        code: 'JDK_NOT_FOUND',
        message: 'JDK not found',
        setupInstructions: 'Install JDK 17+',
      })
    })

    expect(result.current.status).toBe('error')
    expect(result.current.isConnected).toBe(false)
    expect(result.current.connectionError).toEqual({
      code: 'JDK_NOT_FOUND',
      message: 'JDK not found',
      setupInstructions: 'Install JDK 17+',
    })
  })

  it('handles compile_and_run request and receives success result', async () => {
    const { result } = renderHook(() => useLocalExecutor())

    act(() => {
      result.current.connect()
    })
    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'status',
        ready: true,
        jdkAvailable: true,
      })
    })

    let promise: Promise<Awaited<ReturnType<typeof result.current.compileAndRun>>>

    act(() => {
      promise = result.current.compileAndRun('public class Main {}', [
        { id: '1', input: '', expectedOutput: 'hello', timeLimit: 5 },
      ])
    })

    expect(MockWebSocket.instances[0].send).toHaveBeenLastCalledWith(
      JSON.stringify({
        type: 'compile_and_run',
        code: 'public class Main {}',
        testCases: [{ id: '1', input: '', expectedOutput: 'hello', timeLimit: 5 }],
      })
    )

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'result',
        compiled: true,
        testResults: [{ id: '1', status: 'passed', actualOutput: 'hello', executionTimeMs: 120 }],
      })
    })

    const executionResult = await promise!

    expect(executionResult).toEqual({
      compiled: true,
      testResults: [{ id: '1', status: 'passed', actualOutput: 'hello', executionTimeMs: 120 }],
      errors: undefined,
    })
  })

  it('handles compilation error response', async () => {
    const { result } = renderHook(() => useLocalExecutor())

    act(() => {
      result.current.connect()
    })
    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'status',
        ready: true,
        jdkAvailable: true,
      })
    })

    let promise: Promise<Awaited<ReturnType<typeof result.current.compileAndRun>>>

    act(() => {
      promise = result.current.compileAndRun('invalid code', [])
    })

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'result',
        compiled: false,
        errors: [{ line: 1, message: '; expected' }],
      })
    })

    const executionResult = await promise!

    expect(executionResult).toEqual({
      compiled: false,
      testResults: undefined,
      errors: [{ line: 1, message: '; expected' }],
    })
  })

  it('handles JDK_NOT_FOUND error from server', async () => {
    const { result } = renderHook(() => useLocalExecutor())

    act(() => {
      result.current.connect()
    })
    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'status',
        ready: true,
        jdkAvailable: true,
      })
    })

    let promise: Promise<Awaited<ReturnType<typeof result.current.compileAndRun>>>

    act(() => {
      promise = result.current.compileAndRun('code', [])
    })

    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'error',
        code: 'JDK_NOT_FOUND',
        message: 'JDK not found on this machine',
        setupInstructions: 'Install JDK 17+',
      })
    })

    expect(result.current.connectionError?.code).toBe('JDK_NOT_FOUND')
    expect(result.current.connectionError?.setupInstructions).toBe('Install JDK 17+')

    await expect(promise!).rejects.toThrow('JDK not found on this machine')
  })

  it('rejects compileAndRun when not connected', async () => {
    const { result } = renderHook(() => useLocalExecutor())

    await expect(
      result.current.compileAndRun('code', [])
    ).rejects.toThrow('Not connected to Local Executor')
  })

  it('schedules reconnect with exponential backoff on disconnect', () => {
    const { result } = renderHook(() => useLocalExecutor())

    act(() => {
      result.current.connect()
    })
    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'status',
        ready: true,
        jdkAvailable: true,
      })
    })
    act(() => {
      MockWebSocket.instances[0].simulateClose()
    })

    expect(result.current.status).toBe('disconnected')

    // After 1000ms (initial delay), should attempt reconnect
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // A new WebSocket instance should have been created
    expect(MockWebSocket.instances.length).toBe(2)
  })

  it('disconnect stops reconnection attempts', () => {
    const { result } = renderHook(() => useLocalExecutor())

    act(() => {
      result.current.connect()
    })
    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'status',
        ready: true,
        jdkAvailable: true,
      })
    })
    act(() => {
      MockWebSocket.instances[0].simulateClose()
    })

    act(() => {
      result.current.disconnect()
    })

    const countBefore = MockWebSocket.instances.length

    act(() => {
      vi.advanceTimersByTime(60000)
    })

    expect(MockWebSocket.instances.length).toBe(countBefore)
  })
})
