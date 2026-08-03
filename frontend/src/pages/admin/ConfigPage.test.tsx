import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { ConfigPage } from './ConfigPage'

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

describe('ConfigPage OpenRouter fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/admin/config') return { data: { data: [] } }
      return {
        data: {
          data: {
            provider: 'gemini',
            providers: [
              {
                value: 'gemini',
                label: 'Google Gemini',
                defaultModel: 'gemini-2.5-flash',
                keyPlaceholder: 'AIza...',
              },
              {
                value: 'openrouter',
                label: 'OpenRouter',
                defaultModel: 'openrouter/free',
                keyPlaceholder: 'sk-or-v1-...',
              },
            ],
            model: 'gemini-2.5-flash',
            enabled: true,
            keyConfigured: true,
            keyLast4: '1234',
            lastCheckStatus: 'ok',
            lastCheckError: '',
            lastCheckedAt: '2026-08-03T08:00:00.000Z',
            encryptionReady: true,
            openRouterFallback: {
              provider: 'openrouter',
              model: 'openrouter/free',
              enabled: true,
              keyConfigured: true,
              keyLast4: '5678',
              lastCheckStatus: 'ok',
              lastCheckError: '',
              lastCheckedAt: '2026-08-03T08:05:00.000Z',
            },
          },
        },
      }
    })
  })

  it('shows a separately configured Free Models Router fallback without exposing its key', async () => {
    render(<ConfigPage />)

    expect(
      await screen.findByRole('heading', { name: 'OpenRouter Free Models Router — dự phòng chấm tự luận' })
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue('openrouter/free')).toBeInTheDocument()
    expect(screen.getByText(/Dự phòng đang bật/)).toHaveTextContent('••••5678')
    expect(screen.getByRole('switch', { name: 'Bật OpenRouter dự phòng' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.queryByDisplayValue(/sk-or-v1/i)).not.toBeInTheDocument()
  })
})
