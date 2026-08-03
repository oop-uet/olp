import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, cachedGet, invalidateCachedGet } from '../../lib/api'
import { toast } from '../../stores/toast.store'
import { InstructorCourseDetailPage } from './InstructorCourseDetailPage'

vi.mock('../../lib/api', () => ({
  api: { put: vi.fn() },
  cachedGet: vi.fn(),
  invalidateCachedGet: vi.fn(),
}))

vi.mock('../../stores/toast.store', () => ({
  toast: { error: vi.fn() },
}))

const assessmentTitle = 'Kiểm tra giữa kỳ OOP'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/instructor/classes/section-1']}>
      <Routes>
        <Route path="/instructor/classes/:id" element={<InstructorCourseDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('InstructorCourseDetailPage assessment visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cachedGet).mockImplementation(async (url: string) => {
      if (url.endsWith('/detail')) {
        return {
          data: {
            section: {
              id: 'section-1',
              name: 'INT2204 80',
              semester: '2026-1',
              instructor: null,
              createdAt: '2026-08-03T00:00:00.000Z',
            },
            exercises: [],
            studentCount: 1,
            exerciseCount: 0,
          },
        } as never
      }
      if (url.endsWith('/schedule')) {
        return {
          data: {
            weeks: [
              {
                week: 1,
                deadline: null,
                exercises: [],
                assessments: [
                  {
                    assignmentId: 'assignment-1',
                    assessmentId: 'assessment-1',
                    title: assessmentTitle,
                    totalPoints: 10,
                    durationMinutes: 90,
                    creatorUsername: 'abcgv',
                    week: 1,
                    deadline: '2026-08-10T03:00:00.000Z',
                    opensAt: '2026-08-10T01:00:00.000Z',
                    closesAt: '2026-08-10T03:00:00.000Z',
                    isVisible: false,
                    sortOrder: 0,
                  },
                ],
              },
            ],
            unscheduled: [],
            assessmentUnscheduled: [],
          },
        } as never
      }
      if (url.includes('/leaderboard')) {
        return { data: { leaderboard: [], maxPossibleScore: 0 } } as never
      }
      throw new Error(`Unexpected GET ${url}`)
    })
    vi.mocked(api.put).mockResolvedValue({
      data: { success: true, assessmentId: 'assessment-1', isVisible: true },
    })
  })

  it('shows a square visibility control and publishes the assessment optimistically', async () => {
    renderPage()

    const showButton = await screen.findByRole('button', {
      name: `Hiện bài kiểm tra ${assessmentTitle}`,
    })
    expect(showButton).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(showButton)

    expect(
      screen.getByRole('button', { name: `Ẩn bài kiểm tra ${assessmentTitle}` })
    ).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/api/instructor/sections/section-1/schedule/assessment-visibility',
        { assessment_id: 'assessment-1', is_visible: true }
      )
      expect(invalidateCachedGet).toHaveBeenCalledWith(
        '/api/instructor/sections/section-1/schedule'
      )
    })
  })

  it('restores the hidden state when saving visibility fails', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('network'))
    renderPage()

    fireEvent.click(
      await screen.findByRole('button', { name: `Hiện bài kiểm tra ${assessmentTitle}` })
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `Hiện bài kiểm tra ${assessmentTitle}` })
      ).toHaveAttribute('aria-pressed', 'false')
      expect(toast.error).toHaveBeenCalledWith('Không thể lưu trạng thái hiển thị bài kiểm tra.')
      expect(invalidateCachedGet).not.toHaveBeenCalled()
    })
  })
})
