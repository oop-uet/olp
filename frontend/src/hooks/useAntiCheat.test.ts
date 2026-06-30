import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAntiCheat } from './useAntiCheat'

// Mock the api module
vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

describe('useAntiCheat', () => {
  beforeEach(() => {
    // Mock fullscreen APIs
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)

    Object.defineProperty(document, 'exitFullscreen', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    })

    Object.defineProperty(document, 'fullscreenElement', {
      value: document.documentElement,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with default state', () => {
    const { result } = renderHook(() =>
      useAntiCheat({ exerciseId: 'ex-1', threshold: 3 })
    )

    expect(result.current.warningCount).toBe(0)
    expect(result.current.threshold).toBe(3)
    expect(result.current.isNullified).toBe(false)
    expect(result.current.isActive).toBe(false)
    expect(result.current.fullscreenDenied).toBe(false)
    expect(result.current.events).toEqual([])
  })

  it('uses default threshold of 3 when not specified', () => {
    const { result } = renderHook(() =>
      useAntiCheat({ exerciseId: 'ex-1' })
    )

    expect(result.current.threshold).toBe(3)
  })

  it('activates successfully when fullscreen is granted', async () => {
    const { result } = renderHook(() =>
      useAntiCheat({ exerciseId: 'ex-1', threshold: 3 })
    )

    let granted: boolean | undefined
    await act(async () => {
      granted = await result.current.activate()
    })

    expect(granted).toBe(true)
    expect(result.current.isActive).toBe(true)
    expect(result.current.fullscreenDenied).toBe(false)
  })

  it('sets fullscreenDenied when fullscreen is rejected', async () => {
    document.documentElement.requestFullscreen = vi
      .fn()
      .mockRejectedValue(new Error('User denied'))

    const { result } = renderHook(() =>
      useAntiCheat({ exerciseId: 'ex-1', threshold: 3 })
    )

    let granted: boolean | undefined
    await act(async () => {
      granted = await result.current.activate()
    })

    expect(granted).toBe(false)
    expect(result.current.isActive).toBe(false)
    expect(result.current.fullscreenDenied).toBe(true)
  })

  it('increments warning count on recordWarning', () => {
    const { result } = renderHook(() =>
      useAntiCheat({ exerciseId: 'ex-1', threshold: 3 })
    )

    act(() => {
      result.current.recordWarning('fullscreen_exit')
    })

    expect(result.current.warningCount).toBe(1)
    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].type).toBe('fullscreen_exit')
  })

  it('nullifies when warning count reaches threshold', () => {
    const { result } = renderHook(() =>
      useAntiCheat({ exerciseId: 'ex-1', threshold: 2 })
    )

    act(() => {
      result.current.recordWarning('fullscreen_exit')
    })
    expect(result.current.isNullified).toBe(false)

    act(() => {
      result.current.recordWarning('visibility_hidden')
    })
    expect(result.current.isNullified).toBe(true)
    expect(result.current.warningCount).toBe(2)
  })

  it('does not record warnings after nullification', () => {
    const { result } = renderHook(() =>
      useAntiCheat({ exerciseId: 'ex-1', threshold: 1 })
    )

    act(() => {
      result.current.recordWarning('fullscreen_exit')
    })
    expect(result.current.isNullified).toBe(true)

    act(() => {
      result.current.recordWarning('window_blur')
    })
    // Should not increment further
    expect(result.current.warningCount).toBe(1)
    expect(result.current.events).toHaveLength(1)
  })

  it('sends event to backend on warning', async () => {
    const { api } = await import('../lib/api')

    const { result } = renderHook(() =>
      useAntiCheat({ exerciseId: 'ex-1', submissionId: 'sub-1', threshold: 3 })
    )

    act(() => {
      result.current.recordWarning('window_blur')
    })

    expect(api.post).toHaveBeenCalledWith('/api/anticheat/events', expect.objectContaining({
      exercise_id: 'ex-1',
      submission_id: 'sub-1',
      event_type: 'window_blur',
      warning_count: 1,
    }))
  })

  it('deactivates and exits fullscreen', async () => {
    const { result } = renderHook(() =>
      useAntiCheat({ exerciseId: 'ex-1', threshold: 3 })
    )

    await act(async () => {
      await result.current.activate()
    })

    act(() => {
      result.current.deactivate()
    })

    expect(result.current.isActive).toBe(false)
    expect(document.exitFullscreen).toHaveBeenCalled()
  })

  it('tracks multiple event types correctly', () => {
    const { result } = renderHook(() =>
      useAntiCheat({ exerciseId: 'ex-1', threshold: 5 })
    )

    act(() => {
      result.current.recordWarning('fullscreen_exit')
      result.current.recordWarning('visibility_hidden')
      result.current.recordWarning('window_blur')
    })

    expect(result.current.warningCount).toBe(3)
    expect(result.current.events).toHaveLength(3)
    expect(result.current.events[0].type).toBe('fullscreen_exit')
    expect(result.current.events[1].type).toBe('visibility_hidden')
    expect(result.current.events[2].type).toBe('window_blur')
  })
})
