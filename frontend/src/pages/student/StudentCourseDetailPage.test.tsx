import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedGet } from '../../lib/api'
import type { StudentAssessmentListItem } from '../../types/assessment'
import { StudentCourseDetailPage } from './StudentCourseDetailPage'

vi.mock('../../lib/api', () => ({ cachedGet: vi.fn() }))
vi.mock('../../stores/toast.store', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('../../stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'student-1', username: 'sv01', fullName: 'Sinh viên 01' } }),
}))

const mockedCachedGet = vi.mocked(cachedGet)

function assessment(id: string, title: string): StudentAssessmentListItem {
  return {
    id,
    title,
    instructions: '',
    sectionId: 'section-1',
    sectionName: 'INT2204 80',
    opensAt: new Date(Date.now() - 60_000).toISOString(),
    closesAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    durationMinutes: 60,
    totalPoints: 10,
    week: 2,
    session: null,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/student/classes/section-1']}>
      <Routes>
        <Route path="/student/classes/:id" element={<StudentCourseDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('StudentCourseDetailPage assessments', () => {
  let assessmentItems: StudentAssessmentListItem[]

  beforeEach(() => {
    assessmentItems = [assessment('assignment-1', 'Kiểm tra giữa kỳ')]
    mockedCachedGet.mockImplementation(async (url: string) => {
      if (url === '/api/students/sections') {
        return { data: [{ id: 'section-1', name: 'INT2204 80', semester: '2025-2' }] } as never
      }
      if (url === '/api/students/exercises') {
        return { data: { exercises: [] } } as never
      }
      if (url === '/api/students/assessments') {
        return { data: { data: assessmentItems } } as never
      }
      if (url.includes('/leaderboard')) {
        return { data: { leaderboard: [] } } as never
      }
      throw new Error(`Unexpected GET ${url}`)
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows scheduled assessments and refreshes them without using stale cache', async () => {
    renderPage()

    expect(await screen.findByText('Kiểm tra giữa kỳ')).toBeInTheDocument()
    expect(screen.getByText('TUẦN 2')).toBeInTheDocument()
    expect(mockedCachedGet).toHaveBeenCalledWith(
      '/api/students/assessments',
      undefined,
      { force: true }
    )

    assessmentItems = [
      ...assessmentItems,
      assessment('assignment-2', 'Kiểm tra cuối kỳ'),
    ]
    fireEvent.focus(window)

    await waitFor(() => {
      expect(screen.getByText('Kiểm tra cuối kỳ')).toBeInTheDocument()
    })
  })
})
