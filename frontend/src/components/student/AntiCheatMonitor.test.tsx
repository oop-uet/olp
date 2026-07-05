import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AntiCheatMonitor } from './AntiCheatMonitor'

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

  it('shows notification and increments warning on fullscreenchange event', async () => {
    await act(async () => {
      renderWithRouter(
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

    expect(screen.getByText('Cảnh báo: 1/3')).toBeInTheDocument()
    expect(screen.getByText('Bạn đã thoát khỏi chế độ toàn màn hình.')).toBeInTheDocument()
  })

  it('shows notification on visibilitychange event', async () => {
    await act(async () => {
      renderWithRouter(
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
