import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { toast } from '../../stores/toast.store'
import type { InstructorAssessmentListItem } from '../../types/assessment'
import { AssessmentManagerPanel } from './AssessmentManagerPage'

vi.mock('../../lib/api', () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../../stores/toast.store', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const assessment: InstructorAssessmentListItem = {
  id: 'assessment-1',
  title: 'Kiểm tra giữa kỳ OOP',
  instructions: '',
  durationMinutes: 90,
  totalPoints: 10,
  creatorUsername: 'abcgv',
  updatedAt: '2026-08-03T01:00:00.000Z',
  assignments: [
    {
      id: 'assignment-1',
      sectionId: 'section-1',
      sectionName: 'INT2204 80',
      opensAt: '2026-08-10T01:00:00.000Z',
      closesAt: '2026-08-10T03:00:00.000Z',
      durationMinutes: 90,
    },
  ],
}

describe('AssessmentManagerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: { data: [assessment] } })
    vi.mocked(api.put).mockResolvedValue({ data: { data: {} } })
  })

  it('uses compact accessible icons for edit, settings, and delete', async () => {
    render(
      <MemoryRouter>
        <AssessmentManagerPanel />
      </MemoryRouter>
    )

    expect(await screen.findByText(assessment.title)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: `Sửa đề ${assessment.title}` })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `Cài đặt thời gian ${assessment.title}` })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Xóa đề ${assessment.title}` })).toBeInTheDocument()
  })

  it('allows a closing time much later than opening plus the assessment duration', async () => {
    render(
      <MemoryRouter>
        <AssessmentManagerPanel />
      </MemoryRouter>
    )

    fireEvent.click(
      await screen.findByRole('button', { name: `Cài đặt thời gian ${assessment.title}` })
    )

    const opensAtInput = screen.getByLabelText('Thời gian mở') as HTMLInputElement
    const closesAtInput = screen.getByLabelText('Thời gian đóng') as HTMLInputElement
    fireEvent.change(closesAtInput, { target: { value: '2026-08-17T08:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thời gian' }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/api/instructor/assessments/assignments/assignment-1/window',
        {
          opensAt: new Date(opensAtInput.value).toISOString(),
          closesAt: new Date('2026-08-17T08:00').toISOString(),
        }
      )
    })
    expect(toast.success).toHaveBeenCalledWith('Đã cập nhật thời gian cho lớp INT2204 80.')
  })
})
