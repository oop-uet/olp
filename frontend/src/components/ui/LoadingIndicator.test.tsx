import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LoadingIndicator } from './LoadingIndicator'

describe('LoadingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not be visible before the delay', () => {
    render(<LoadingIndicator />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('should become visible after the default 200ms delay', () => {
    render(<LoadingIndicator />)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should not be visible at 199ms', () => {
    render(<LoadingIndicator />)

    act(() => {
      vi.advanceTimersByTime(199)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('should accept a custom delay', () => {
    render(<LoadingIndicator delay={500} />)

    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should show immediately when delay is 0', () => {
    render(<LoadingIndicator delay={0} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should render a label when provided', () => {
    render(<LoadingIndicator delay={0} label="Loading exercises..." />)
    expect(screen.getByText('Loading exercises...')).toBeInTheDocument()
  })

  it('should include a screen reader only loading text', () => {
    render(<LoadingIndicator delay={0} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
