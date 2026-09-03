import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { StudentGuidePage } from './StudentGuidePage'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

const mockApiGet = vi.mocked(api.get)

describe('StudentGuidePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({
      data: [
        {
          id: 'sec-1',
          title: 'Khởi động',
          description: 'Mô tả',
          orderIndex: 0,
          items: [
            {
              id: 'it-1',
              sectionId: 'sec-1',
              type: 'step',
              title: null,
              content: 'Bước 1: Cài đặt JDK',
              orderIndex: 0,
            },
          ],
        },
      ],
    })
  })

  it('renders "Đăng nhập" button when user is not authenticated', async () => {
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      accessToken: null,
      refreshToken: null,
    })

    render(
      <MemoryRouter>
        <StudentGuidePage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Bước 1: Cài đặt JDK')).toBeInTheDocument()
    })

    const loginLink = screen.getByRole('link', { name: /Đăng nhập/i })
    expect(loginLink).toBeInTheDocument()
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('renders "Vào lớp học" and student info when authenticated as student', async () => {
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
      <MemoryRouter>
        <StudentGuidePage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Bước 1: Cài đặt JDK')).toBeInTheDocument()
    })

    expect(screen.queryByRole('link', { name: /^Đăng nhập$/i })).not.toBeInTheDocument()
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(screen.getByText('Sinh viên')).toBeInTheDocument()

    const enterClassLink = screen.getByRole('link', { name: /Vào lớp học/i })
    expect(enterClassLink).toBeInTheDocument()
    expect(enterClassLink).toHaveAttribute('href', '/student/exercises')
  })

  it('renders "Vào hệ thống" and instructor info when authenticated as instructor', async () => {
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
      <MemoryRouter>
        <StudentGuidePage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Bước 1: Cài đặt JDK')).toBeInTheDocument()
    })

    expect(screen.queryByRole('link', { name: /^Đăng nhập$/i })).not.toBeInTheDocument()
    expect(screen.getByText('Giảng viên B')).toBeInTheDocument()
    expect(screen.getByText('Giảng viên')).toBeInTheDocument()

    const enterSystemLink = screen.getByRole('link', { name: /Vào hệ thống/i })
    expect(enterSystemLink).toBeInTheDocument()
    expect(enterSystemLink).toHaveAttribute('href', '/instructor/classes')
  })
})
