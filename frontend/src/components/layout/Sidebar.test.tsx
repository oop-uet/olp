import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../../stores/auth.store'
import { Sidebar } from './Sidebar'

function renderSidebar(collapsed = false) {
  return render(
    <MemoryRouter>
      <Sidebar collapsed={collapsed} onToggle={() => {}} />
    </MemoryRouter>
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
    })
  })

  it('should render nothing when no user is logged in', () => {
    const { container } = renderSidebar()
    expect(container.querySelector('aside')).not.toBeInTheDocument()
  })

  it('should render student menu items for a student user', () => {
    useAuthStore.setState({
      user: { id: '1', username: 'student1', email: 's@e.com', role: 'student' },
      isAuthenticated: true,
    })

    renderSidebar()

    expect(screen.getByText('Exercises')).toBeInTheDocument()
    expect(screen.getByText('Submissions')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
  })

  it('should render instructor menu items for an instructor user', () => {
    useAuthStore.setState({
      user: { id: '2', username: 'instructor1', email: 'i@e.com', role: 'instructor' },
      isAuthenticated: true,
    })

    renderSidebar()

    expect(screen.getByText('Exercise Manager')).toBeInTheDocument()
    expect(screen.getByText('Submissions')).toBeInTheDocument()
    expect(screen.getByText('Leaderboard')).toBeInTheDocument()
  })

  it('should render admin menu items for an admin user', () => {
    useAuthStore.setState({
      user: { id: '3', username: 'admin1', email: 'a@e.com', role: 'admin' },
      isAuthenticated: true,
    })

    renderSidebar()

    expect(screen.getByText('Sections')).toBeInTheDocument()
    expect(screen.getByText('Configuration')).toBeInTheDocument()
    expect(screen.getByText('Quota Monitor')).toBeInTheDocument()
  })

  it('should hide text labels when collapsed', () => {
    useAuthStore.setState({
      user: { id: '1', username: 'student1', email: 's@e.com', role: 'student' },
      isAuthenticated: true,
    })

    renderSidebar(true)

    expect(screen.queryByText('Exercises')).not.toBeInTheDocument()
    expect(screen.queryByText('Submissions')).not.toBeInTheDocument()
    expect(screen.queryByText('Progress')).not.toBeInTheDocument()
  })

  it('should display the UET-VNU logo text when expanded', () => {
    useAuthStore.setState({
      user: { id: '1', username: 'student1', email: 's@e.com', role: 'student' },
      isAuthenticated: true,
    })

    renderSidebar(false)

    expect(screen.getByText('UET-VNU OOP')).toBeInTheDocument()
  })
})
