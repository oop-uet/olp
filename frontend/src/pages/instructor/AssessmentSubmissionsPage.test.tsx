import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { toast } from '../../stores/toast.store'
import { AssessmentSubmissionsPage } from './AssessmentSubmissionsPage'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../../stores/toast.store', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const pageData = {
  assignment: {
    id: 'assignment-1',
    opensAt: '2026-08-03T01:00:00.000Z',
    closesAt: '2026-08-03T03:00:00.000Z',
  },
  assessment: { id: 'assessment-1', title: 'Giữa kỳ OOP', totalPoints: 10 },
  submissions: [
    {
      id: 'session-1',
      status: 'graded',
      reviewStatus: 'official',
      startedAt: '2026-08-03T01:05:00.000Z',
      submittedAt: '2026-08-03T02:00:00.000Z',
      autoScore: 4,
      predictedScore: 8,
      officialScore: 8,
      attemptNumber: 1,
      student: {
        id: 'student-1',
        username: '24000001',
        fullName: 'Sinh viên A',
        email: 'student@example.com',
      },
    },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/instructor/assessment-assignments/assignment-1/submissions']}>
      <Routes>
        <Route
          path="/instructor/assessment-assignments/:assignmentId/submissions"
          element={<AssessmentSubmissionsPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('AssessmentSubmissionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: { data: pageData } })
    vi.mocked(api.post).mockResolvedValue({
      data: {
        data: {
          sessionsRegraded: 1,
          objectiveAnswersRescored: 1,
          aiAnswersQueued: 1,
        },
      },
    })
  })

  it('uses an inline two-click confirmation and queues a full regrade without a popup', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    renderPage()

    const button = await screen.findByRole('button', { name: 'Chấm lại toàn bộ bài nộp' })
    fireEvent.click(button)

    expect(api.post).not.toHaveBeenCalled()
    expect(screen.getByText('Bấm lần nữa để xác nhận')).toBeInTheDocument()
    expect(
      screen.getByText('Điểm chính thức cũ sẽ chuyển về dự kiến để GV duyệt lại.')
    ).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()

    fireEvent.click(button)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/instructor/assessments/assignments/assignment-1/regrade-all'
      )
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Đã chấm lại 1 bài: 1 câu tự động, 1 câu đã xếp hàng AI.'
      )
    })
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
