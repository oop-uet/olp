import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from '../../lib/api'
import { AntiCheatMonitor } from './AntiCheatMonitor'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock the api module
vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('AntiCheatMonitor', () => {
  let nowMs = 0

  beforeEach(() => {
    mockNavigate.mockReset()
    nowMs = 0
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs)

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

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
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

  it('requires fullscreen for non-assessment exercises too', async () => {
    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={false} exerciseId="ex-1">
          <div data-testid="workspace">Workspace Content</div>
        </AntiCheatMonitor>
      )
    })

    expect(screen.getByTestId('workspace')).toBeInTheDocument()
    expect(screen.getByText('Cảnh báo: 0/3')).toBeInTheDocument()
  })

  it('shows initializing state for assessment exercises', async () => {
    // Use a never-resolving promise so the component stays in initializing state
    document.documentElement.requestFullscreen = vi
      .fn()
      .mockReturnValue(new Promise(() => {}))

    renderWithRouter(
      <AntiCheatMonitor isAssessment={true} exerciseId="ex-1">
        <div>Workspace</div>
      </AntiCheatMonitor>
    )

    expect(screen.getByText('Đang mở chế độ toàn màn hình...')).toBeInTheDocument()
  })

  it('shows blocked message when fullscreen is denied', async () => {
    document.documentElement.requestFullscreen = vi
      .fn()
      .mockRejectedValue(new Error('User denied'))

    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1">
          <div>Workspace</div>
        </AntiCheatMonitor>
      )
    })

    expect(screen.getByText('Cần bật chế độ toàn màn hình')).toBeInTheDocument()
    expect(
      screen.getByText(/Mọi bài tập yêu cầu chế độ toàn màn hình/)
    ).toBeInTheDocument()
  })

  it('renders workspace with warning indicator when fullscreen is granted', async () => {
    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-testid="workspace">Workspace Content</div>
        </AntiCheatMonitor>
      )
    })

    expect(screen.getByTestId('workspace')).toBeInTheDocument()
    expect(screen.getByText('Cảnh báo: 0/3')).toBeInTheDocument()
  })

  it('shows warning indicator for non-assessment exercises', async () => {
    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={false} exerciseId="ex-1">
          <div data-testid="workspace">Workspace Content</div>
        </AntiCheatMonitor>
      )
    })

    expect(screen.getByText('Cảnh báo: 0/3')).toBeInTheDocument()
  })

  it('blocks copying protected exercise content and records a warning', async () => {
    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-protected-content="true">Protected prompt</div>
        </AntiCheatMonitor>
      )
    })

    fireEvent.copy(screen.getByText('Protected prompt'))

    await waitFor(() => {
      expect(screen.getByText('Cảnh báo: 1/3')).toBeInTheDocument()
    })
    expect(screen.getByText('Không được sao chép đề bài hoặc test case.')).toBeInTheDocument()
  })

  it('uses an internal route instead of the rendered href for secure exit links', async () => {
    vi.useFakeTimers()

    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <a href="/olp/student/exercises" data-anti-cheat-exit="true" data-anti-cheat-to="/student/exercises">
            Back
          </a>
        </AntiCheatMonitor>
      )
    })

    fireEvent.click(screen.getByText('Back'))

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    expect(mockNavigate).toHaveBeenCalledWith('/student/exercises')

    vi.useRealTimers()
  })

  it('records an exit attempt for regular internal navbar links', async () => {
    vi.useFakeTimers()
    const onExitAttempt = vi.fn().mockResolvedValue(undefined)

    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor
          isAssessment={true}
          exerciseId="ex-1"
          warningThreshold={3}
          onExitAttempt={onExitAttempt}
        >
          <a href="/olp/student/leaderboard">Bảng xếp hạng</a>
        </AntiCheatMonitor>
      )
    })

    fireEvent.click(screen.getByText('Bảng xếp hạng'))

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    expect(onExitAttempt).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/student/leaderboard')

    vi.useRealTimers()
  })

  it('shows notification and increments warning on fullscreenchange event', async () => {
    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })
    nowMs = 3000

    // Simulate fullscreen exit
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    expect(screen.getByText('Cảnh báo: 1/3')).toBeInTheDocument()
    expect(screen.getByText('Bạn đã thoát khỏi chế độ toàn màn hình.')).toBeInTheDocument()
  })

  it('does not count fullscreen startup focus churn as a warning', async () => {
    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
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
      window.dispatchEvent(new Event('blur'))
    })

    expect(screen.getByText('Cảnh báo: 0/3')).toBeInTheDocument()
  })

  it('does not record a fullscreen warning during legitimate unmount cleanup', async () => {
    Object.defineProperty(document, 'exitFullscreen', {
      value: vi.fn().mockImplementation(() => {
        Object.defineProperty(document, 'fullscreenElement', {
          value: null,
          writable: true,
          configurable: true,
        })
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      }),
      writable: true,
      configurable: true,
    })

    let unmount!: () => void
    await act(async () => {
      const rendered = renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={1}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
      unmount = rendered.unmount
    })
    vi.mocked(api.post).mockClear()
    nowMs = 3000

    await act(async () => {
      unmount()
    })

    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows notification on visibilitychange event', async () => {
    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })
    nowMs = 3000

    // Simulate visibility hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByText('Cảnh báo: 1/3')).toBeInTheDocument()
    expect(screen.getByText('Bạn đã chuyển sang tab hoặc ứng dụng khác.')).toBeInTheDocument()
  })

  it('shows notification on window blur event', async () => {
    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })
    nowMs = 3000

    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })

    expect(screen.getByText('Cảnh báo: 1/3')).toBeInTheDocument()
    expect(screen.getByText('Cửa sổ làm bài không còn được focus.')).toBeInTheDocument()
  })

  it('shows nullification message and locks session at threshold', async () => {
    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={2}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })
    nowMs = 3000

    // Trigger 2 violations to reach threshold
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByText('Phiên làm bài đã khóa')).toBeInTheDocument()
    expect(screen.getByText('Bài làm đã được ghi nhận 0 điểm')).toBeInTheDocument()
    expect(screen.getByText('Cảnh báo: 2/2')).toBeInTheDocument()
    expect(screen.getByText('Quay lại danh sách bài tập')).toBeInTheDocument()
    expect(screen.getByText('Xem bài nộp')).toBeInTheDocument()
  })

  it('calls onNullified callback when score is nullified', async () => {
    const onNullified = vi.fn()

    await act(async () => {
      renderWithRouter(
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
    nowMs = 3000

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
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={1}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })
    nowMs = 3000

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

  it('does not warn for a devtools-like viewport gap during startup', async () => {
    Object.defineProperty(window, 'outerWidth', { value: 1400, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    Object.defineProperty(window, 'outerHeight', { value: 900, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })

    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })

    expect(screen.getByText('Cảnh báo: 0/3')).toBeInTheDocument()
  })

  it('does not warn before repeated devtools detections are confirmed', async () => {
    vi.mocked(Date.now).mockRestore()
    vi.useFakeTimers()
    vi.setSystemTime(0)
    Object.defineProperty(window, 'outerWidth', { value: 1400, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    Object.defineProperty(window, 'outerHeight', { value: 900, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })

    await act(async () => {
      renderWithRouter(
        <AntiCheatMonitor isAssessment={true} exerciseId="ex-1" warningThreshold={3}>
          <div data-testid="workspace">Workspace</div>
        </AntiCheatMonitor>
      )
    })

    await act(async () => {
      vi.advanceTimersByTime(6500)
    })
    expect(screen.getByText('Cảnh báo: 0/3')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByText('Cảnh báo: 0/3')).toBeInTheDocument()

    vi.useRealTimers()
  })
})
