import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { StudentAssessmentPage } from './StudentAssessmentPage'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../../stores/toast.store', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const mockedApi = vi.mocked(api)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/student/assessments/assignment-1']}>
      <Routes>
        <Route path="/student/assessments/:assignmentId" element={<StudentAssessmentPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('StudentAssessmentPage integrity controls', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.documentElement,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })
    Object.defineProperty(document, 'exitFullscreen', {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    })
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)

    mockedApi.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/preflight')) {
        return {
          data: {
            data: {
              id: 'assignment-1',
              title: 'Kiểm tra OOP',
              instructions: '',
              totalPoints: 2,
              durationMinutes: 60,
              shuffleQuestions: true,
              opensAt: new Date(Date.now() - 60_000).toISOString(),
              closesAt: new Date(Date.now() + 60 * 60_000).toISOString(),
              requireFullscreen: true,
              warningThreshold: 3,
              showPredictedScore: true,
              questionCount: 1,
              session: { id: 'session-1', status: 'in_progress' },
            },
          },
        }
      }
      if (url.endsWith('/sessions/session-1')) {
        return {
          data: {
            data: {
              session: {
                id: 'session-1',
                status: 'in_progress',
                expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
                flaggedQuestionIds: [],
              },
              assessment: {
                title: 'Kiểm tra OOP',
                instructions: '',
                totalPoints: 2,
                sections: [
                  {
                    id: 'section-1',
                    title: 'Một lựa chọn',
                    introContent: null,
                    points: 2,
                    questions: [
                      {
                        id: 'question-1',
                        type: 'single_choice',
                        prompt: 'class A \\{ void show() \\{ \\} \\}',
                        points: 2,
                        options: [
                          { id: 'option-1', content: 'A' },
                          { id: 'option-2', content: 'B' },
                        ],
                      },
                    ],
                  },
                ],
              },
              answers: [],
              integrity: { warningCount: 0, warningThreshold: 3, requireFullscreen: true },
            },
          },
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    })
    mockedApi.post.mockResolvedValue({
      data: { data: { warningCount: 1, warningThreshold: 3, autoSubmitted: false } },
    })
    mockedApi.put.mockResolvedValue({
      data: { data: { flaggedQuestionIds: ['question-1'] } },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('cleans imported brace escapes, blocks copy and persists a question flag', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('class A { void show() { } }')).toBeInTheDocument()
    expect(fireEvent.copy(document.body)).toBe(false)
    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/api/students/assessments/sessions/session-1/integrity-events',
        expect.objectContaining({ eventType: 'copy_attempt' })
      )
    })

    await user.click(screen.getByRole('button', { name: 'Gắn cờ' }))
    await waitFor(() => {
      expect(mockedApi.put).toHaveBeenCalledWith(
        '/api/students/assessments/sessions/session-1/question-flag',
        { questionId: 'question-1', flagged: true }
      )
    })
    expect(screen.getByRole('button', { name: 'Đã gắn cờ' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('batches rapid answer changes and saves only the newest revision', async () => {
    renderPage()

    expect(await screen.findByText('class A { void show() { } }')).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[0])
    fireEvent.click(radios[1])

    expect(mockedApi.put).not.toHaveBeenCalled()
    await waitFor(
      () => {
        const answerCalls = mockedApi.put.mock.calls.filter(([url]) =>
          String(url).endsWith('/sessions/session-1/answers')
        )
        expect(answerCalls).toHaveLength(1)
        expect(answerCalls[0][1]).toEqual({
          answers: [
            {
              questionId: 'question-1',
              answer: { optionId: 'option-2' },
              clientRevision: 2,
            },
          ],
        })
      },
      { timeout: 3_000 }
    )
    expect(screen.getByText(/Đã lưu/)).toBeInTheDocument()
  })
})
