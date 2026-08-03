import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { AssessmentReviewPage } from './AssessmentReviewPage'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../../stores/toast.store', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const retryAt = '2026-08-03T08:30:00.000Z'

const reviewData = {
  session: {
    id: 'session-1',
    assignmentId: 'assignment-1',
    autoScore: 5,
    predictedScore: null,
    officialScore: null,
    reviewStatus: 'ai_queued',
    attemptNumber: 1,
  },
  assessment: { title: 'Giữa kỳ OOP', totalPoints: 10 },
  student: { username: '24000001', fullName: 'Sinh viên A' },
  integrityEvents: [],
  answers: [
    {
      id: 'answer-1',
      questionId: 'question-1',
      answer: { text: 'Upcasting chuyển tham chiếu lớp con lên lớp cha.' },
      aiSuggestedPoints: null,
      finalPoints: null,
      aiFeedback: 'AI đang tạm chờ quota và sẽ tự động chấm tiếp.',
      finalFeedback: null,
      aiConfidence: null,
      gradingState: 'ai_queued',
      autoPoints: null,
      aiCriteria: [],
      aiFlags: [],
      latestAiRun: {
        id: 'run-1',
        status: 'queued',
        provider: null,
        model: null,
        needsHumanAttention: false,
        errorCode: 'AI_RATE_LIMITED',
        errorMessage: 'Quota exceeded. Please retry in 60s.',
        attemptCount: 5,
        nextAttemptAt: retryAt,
        createdAt: '2026-08-03T08:00:00.000Z',
        startedAt: null,
        finishedAt: null,
      },
      question: {
        id: 'question-1',
        type: 'essay',
        prompt: 'Giải thích upcasting.',
        points: 5,
        gradingMode: 'llm_assisted',
        options: [],
        referenceAnswer: 'Chuyển tham chiếu lớp con lên lớp cha.',
        gradingPrompt: '',
        rubric: [{ id: 'criterion-1', criterion: 'Giải thích đúng', points: 5 }],
      },
    },
  ],
}

describe('AssessmentReviewPage AI queue diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: { data: reviewData } })
  })

  it('shows quota status, attempts and automatic retry time to the instructor', async () => {
    render(
      <MemoryRouter initialEntries={['/instructor/assessment-sessions/session-1/review']}>
        <Routes>
          <Route
            path="/instructor/assessment-sessions/:sessionId/review"
            element={<AssessmentReviewPage />}
          />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Đang chờ quota')).toBeInTheDocument()
    expect(screen.getByText('Đã thử 5 lần')).toBeInTheDocument()
    expect(
      screen.getByText('Hệ thống đã tạm dừng hàng đợi và sẽ tự động chấm tiếp khi quota phục hồi.')
    ).toBeInTheDocument()
    expect(screen.getByText(`Thử lại dự kiến: ${new Date(retryAt).toLocaleString('vi-VN')}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đang trong hàng đợi' })).toBeDisabled()
    expect(screen.getByText('Chi tiết kỹ thuật')).toBeInTheDocument()
  })
})
