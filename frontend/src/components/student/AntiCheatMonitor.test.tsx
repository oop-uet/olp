import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AntiCheatMonitor } from './AntiCheatMonitor'

// Mock the api module
vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

describe('AntiCheatMonitor', () => {
  beforeEach(() => {
    // Mock fullscreen APIs on document.documentElement
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)

    // Mock document.exitFullscreen - use defineProperty to ensure it persists
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
    // Re-define exitFullscreen before restoring mocks, so cleanup doesn't break
    Object.defineProperty(document, 'exitFullscreen', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  it('renders children directly for non-assessment exercises', () => {
    render(
      <AntiCheatMonitor isAssessment={false} exerciseId="ex-1">
        <div data-testid="workspace">Workspace Content</div>
      </AntiCheatMonitor>
    )

    expect(screen.getByTestId('workspace')).toBeInTheDocument()
  })

  it('shows initializing state for assessment exercises', async () => {
    // Use a never-resolving promise so the component stays in initializing state
    document.documentElement.requestFullscreen = vi
      .fn()
      .mockReturnValue(new Promise(() => {}))

    render(
      <AntiCheatMonitor isAssessment={true} exerciseId="ex-1">
        <div>Workspace</div>
      </AntiCheatMonitor>
    )

    expect(screen.getByText('Requesting fullscreen mode...')).toBeInTheDocument()
  })

  it('shows blocked message when fullscreen is denied', async () => {
    document.documentElement.requestFullscreen = vi
      .fn()
      .mockRejectedValue(new Error('User denied'))

    await act(async () => {
      render(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1">
          <div>Workspace</div>
        </AntiCheatMonitor>
      )
    })

    expect(screen.getByText('Fullscreen Mode Required')).toBeInTheDocument()
    expect(
      screen.getByText(/This assessment requires fullscreen mode/)
    ).toBeInTheDocument()
  })

  it('renders workspace with warning indicator when fullscreen is granted', async () => {
    await act(async () => {
      render(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-testid="workspace">Workspace Content</div>
        </AntiCheatMonitor>
      )
    })

    expect(screen.getByTestId('workspace')).toBeInTheDocument()
    expect(screen.getByText('Warnings: 0/3')).toBeInTheDocument()
  })

  it('does not show warning indicator for non-assessment exercises', () => {
    render(
      <AntiCheatMonitor isAssessment={false} exerciseId="ex-1">
        <div data-testid="workspace">Workspace Content</div>
      </AntiCheatMonitor>
    )

    expect(screen.queryByText(/Warnings:/)).not.toBeInTheDocument()
  })

  it('shows notification and increments warning on fullscreenchange event', async () => {
    await act(async () => {
      render(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })

    // Simulate fullscreen exit
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    expect(screen.getByText('Warnings: 1/3')).toBeInTheDocument()
    expect(screen.getByText('⚠️ Warning: Fullscreen exit detected!')).toBeInTheDocument()
  })

  it('shows notification on visibilitychange event', async () => {
    await act(async () => {
      render(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })

    // Simulate visibility hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByText('Warnings: 1/3')).toBeInTheDocument()
    expect(screen.getByText('⚠️ Warning: Tab switch detected!')).toBeInTheDocument()
  })

  it('shows notification on window blur event', async () => {
    await act(async () => {
      render(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })

    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })

    expect(screen.getByText('Warnings: 1/3')).toBeInTheDocument()
    expect(screen.getByText('⚠️ Warning: Window lost focus!')).toBeInTheDocument()
  })

  it('shows nullification message and locks session at threshold', async () => {
    await act(async () => {
      render(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={2}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })

    // Trigger 2 violations to reach threshold
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })

    expect(screen.getByText('Assessment Session Locked')).toBeInTheDocument()
    expect(screen.getByText(/Your score has been nullified/)).toBeInTheDocument()
    expect(screen.getByText('Warnings: 2/2')).toBeInTheDocument()
  })

  it('calls onNullified callback when score is nullified', async () => {
    const onNullified = vi.fn()

    await act(async () => {
      render(
        <AntiCheatMonitor
          isAssessment={true}
          exerciseId="ex-1"
          warningThreshold={1}
          onNullified={onNullified}
        >
          <div>Workspace</div>
        </AntiCheatMonitor>
      )
    })

    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    expect(onNullified).toHaveBeenCalledTimes(1)
  })

  it('locks workspace with pointer-events-none when nullified', async () => {
    await act(async () => {
      render(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={1}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })

    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    // The workspace should be in a disabled container
    const workspace = screen.getByTestId('workspace')
    expect(workspace.parentElement).toHaveClass('pointer-events-none')
    expect(workspace.parentElement).toHaveClass('opacity-50')
  })
})
