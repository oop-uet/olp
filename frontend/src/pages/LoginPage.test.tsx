import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/auth.store'
import { LoginPage } from './LoginPage'

vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn(),
  },
  cachedGet: vi.fn(),
  startProactiveTokenRefresh: vi.fn(),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders login form when user is not authenticated', () => {
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
    })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByPlaceholderText('Tên đăng nhập hoặc MSSV')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Mật khẩu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ĐĂNG NHẬP/i })).toBeInTheDocument()
  })

  it('redirects to student dashboard when already authenticated as student', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'std-1',
        username: '21020001',
        email: 'sv@vnu.edu.vn',
        role: 'student',
        fullName: 'Nguyễn Văn A',
        mustChangePassword: false,
      },
      accessToken: 'token',
      refreshToken: 'refresh',
    })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/student/exercises" element={<div>Student Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Student Dashboard')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Nhập mã sinh viên hoặc username')).not.toBeInTheDocument()
  })

  it('redirects to instructor dashboard when already authenticated as instructor', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'ins-1',
        username: 'gv01',
        email: 'gv@vnu.edu.vn',
        role: 'instructor',
        fullName: 'Giảng viên B',
        mustChangePassword: false,
      },
      accessToken: 'token',
      refreshToken: 'refresh',
    })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/instructor/classes" element={<div>Instructor Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Instructor Dashboard')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Nhập mã sinh viên hoặc username')).not.toBeInTheDocument()
  })
})
