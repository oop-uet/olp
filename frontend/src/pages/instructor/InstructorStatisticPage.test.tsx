import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedGet } from '../../lib/api'
import { InstructorStatisticPage } from './InstructorStatisticPage'

vi.mock('../../lib/api', () => ({
  cachedGet: vi.fn(),
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../../stores/toast.store', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockSections = [
  { id: 'sec-1', name: 'INT2204 1', semester: 'HK1-2026' },
]

const mockStats = {
  totalStudents: 2,
  exercises: [
    {
      exerciseId: 'ex-1',
      title: 'Tuần 1: Lập trình hướng đối tượng cơ bản',
      difficulty: 'easy',
      attemptedCount: 2,
      completedCount: 2,
      averageScore: 95,
    },
  ],
  students: [
    {
      userId: 'user-1',
      studentId: '24020001',
      username: '24020001',
      fullName: 'Nguyễn Văn An',
      email: 'an.nguyen@vnu.edu.vn',
      attemptedExercises: 1,
      completedExercises: 1,
      attemptCount: 3,
      totalScore: 95,
      totalPossible: 100,
      completionPercent: 95,
      rank: 1,
    },
    {
      userId: 'user-2',
      studentId: '24020002',
      username: '24020002',
      fullName: 'Trần Thị Bình',
      email: 'binh.tran@vnu.edu.vn',
      attemptedExercises: 1,
      completedExercises: 1,
      attemptCount: 2,
      totalScore: 87.5,
      totalPossible: 100,
      completionPercent: 87.5,
      rank: 2,
    },
  ],
}

describe('InstructorStatisticPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cachedGet).mockImplementation(async (url: string) => {
      if (url === '/api/instructor/sections') {
        return { data: mockSections }
      }
      if (url.startsWith('/api/instructor/sections/sec-1/stats')) {
        return { data: mockStats }
      }
      return { data: null }
    })
  })

  it('renders stats table with 10-point scale score in the last column and Excel export button', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <InstructorStatisticPage />
      </MemoryRouter>
    )

    // Wait for data and table to load
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument()
    })

    // Check Excel export button
    const exportBtn = screen.getByRole('button', { name: 'Xuất Excel' })
    expect(exportBtn).toBeInTheDocument()
    expect(exportBtn).not.toBeDisabled()

    // Check table headers
    expect(screen.getByText(/% hoàn thành/)).toBeInTheDocument()
    expect(screen.getByText(/Số bài/)).toBeInTheDocument()
    expect(screen.getByText(/Điểm quy đổi/)).toBeInTheDocument()

    // Check completion percent
    expect(screen.getByText('95.00%')).toBeInTheDocument()
    expect(screen.getByText('87.50%')).toBeInTheDocument()

    // Check student scores on 10-point scale
    // 95/100 -> 9.50
    expect(screen.getByText('9.50')).toBeInTheDocument()
    // 87.5/100 -> 8.75
    expect(screen.getByText('8.75')).toBeInTheDocument()

    // Mock URL.createObjectURL and HTMLAnchorElement.click for export
    const createObjectUrlMock = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectUrlMock = vi.fn()
    window.URL.createObjectURL = createObjectUrlMock
    window.URL.revokeObjectURL = revokeObjectUrlMock
    const clickMock = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    // Click Export Excel
    await user.click(exportBtn)

    await waitFor(() => {
      expect(createObjectUrlMock).toHaveBeenCalled()
      expect(clickMock).toHaveBeenCalled()
    })
    clickMock.mockRestore()
  })
})
