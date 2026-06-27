import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '../../stores/auth.store'
import { Header } from './Header'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderHeader(title?: string) {
  return render(
    <MemoryRouter>
      <Header title={title} />
    </MemoryRouter>
  )
}

describe('Header', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    useAuthStore.setState({
      user: { id: '1', username: 'testuser', email: 't@e.com', role: 'student' },
      isAuthenticated: true,
      accessToken: 'token',
      refreshToken: 'refresh',
    })
  })

  it('should display the default title when no title prop is given', () => {
    renderHeader()
    expect(screen.getByText('OOP Learning Platform')).toBeInTheDocument()
  })

  it('should display a custom title when provided', () => {
    renderHeader('My Exercises')
    expect(screen.getByText('My Exercises')).toBeInTheDocument()
  })

  it('should display the username', () => {
    renderHeader()
    expect(screen.getByText('testuser')).toBeInTheDocument()
  })

  it('should display the user role badge', () => {
    renderHeader()
    expect(screen.getByText('student')).toBeInTheDocument()
  })

  it('should call logout and navigate to /login on logout click', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByText('Logout'))

    // Auth should be cleared
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()

    // Should navigate to login
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })
})
