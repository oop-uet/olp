import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { PageLoader, QuotaIcon } from '../../components/ui'

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuotaServiceEntry {
  name: string
  current: number
  limit: number
  percentage: number
  status: 'ok' | 'warning'
}

interface QuotaStatusResponse {
  services: QuotaServiceEntry[]
  warnings: string[]
}

// ─── Display Metadata ────────────────────────────────────────────────────────

const SERVICE_DISPLAY: Record<string, { label: string; icon: string; unit: string }> = {
  turso_reads: {
    label: 'Turso DB Reads',
    icon: '📖',
    unit: 'rows/month',
  },
  turso_writes: {
    label: 'Turso DB Writes',
    icon: '✏️',
    unit: 'rows/month',
  },
  r2_storage: {
    label: 'Cloudflare R2 Storage',
    icon: '💾',
    unit: 'bytes',
  },
  render_compute: {
    label: 'Render Compute',
    icon: '⚡',
    unit: 'hours/month',
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(value: number, serviceName: string): string {
  if (serviceName === 'r2_storage') {
    // Format as GB
    const gb = value / 1_000_000_000
    return `${gb.toFixed(2)} GB`
  }
  if (serviceName === 'render_compute') {
    return `${value} hrs`
  }
  // Format large numbers with abbreviations
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

function formatLimit(limit: number, serviceName: string): string {
  if (serviceName === 'r2_storage') {
    return `${(limit / 1_000_000_000).toFixed(0)} GB`
  }
  if (serviceName === 'render_compute') {
    return `${limit} hrs`
  }
  if (limit >= 1_000_000_000) return `${(limit / 1_000_000_000).toFixed(0)}B`
  if (limit >= 1_000_000) return `${(limit / 1_000_000).toFixed(0)}M`
  if (limit >= 1_000) return `${(limit / 1_000).toFixed(0)}K`
  return limit.toString()
}

function getProgressBarColor(percentage: number): string {
  if (percentage >= 80) return 'bg-red-500'
  if (percentage >= 60) return 'bg-yellow-500'
  return 'bg-green-500'
}

function getCardBorderColor(status: 'ok' | 'warning'): string {
  return status === 'warning' ? 'border-danger-500' : 'border-gray-200'
}

function getStatusBadge(status: 'ok' | 'warning', percentage: number) {
  if (status === 'warning') {
    return <span className="badge-red">⚠️ Trên 80%</span>
  }
  if (percentage >= 60) {
    return <span className="badge-yellow">Trung bình</span>
  }
  return <span className="badge-green">Ổn định</span>
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QuotaPage() {
  const [quotaData, setQuotaData] = useState<QuotaStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchQuota()
  }, [])

  async function fetchQuota() {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/api/admin/quota-status')
      setQuotaData(response.data)
    } catch {
      setError('Không thể tải trạng thái quota. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải trạng thái quota..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-danger-600">{error}</p>
        <button onClick={fetchQuota} className="btn-primary">
          Thử lại
        </button>
      </div>
    )
  }

  if (!quotaData) return null

  const warningCount = quotaData.services.filter(
    (s) => s.status === 'warning'
  ).length

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <QuotaIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Giám sát Quota</h1>
            <p className="mt-1 text-sm text-gray-600">
              Mức sử dụng dịch vụ gói miễn phí của nền tảng.
            </p>
          </div>
        </div>
        <button onClick={fetchQuota} className="btn-secondary">
          ↻ Làm mới
        </button>
      </div>

      {/* Warning banner */}
      {warningCount > 0 && (
        <div
          className="rounded-lg border border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-700"
          role="alert"
        >
          <span className="font-medium">⚠️ Chú ý:</span>{' '}
          {warningCount} dịch vụ đã vượt quá 80% giới hạn gói miễn phí. Hãy cân
          nhắc giảm mức sử dụng hoặc nâng cấp.
        </div>
      )}

      {/* Quota cards grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {quotaData.services.map((service) => {
          const display = SERVICE_DISPLAY[service.name] || {
            label: service.name,
            icon: '📊',
            unit: '',
          }

          return (
            <div
              key={service.name}
              className={`card p-5 ${getCardBorderColor(service.status)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{display.icon}</span>
                  <h3 className="text-sm font-semibold text-gray-800">
                    {display.label}
                  </h3>
                </div>
                {getStatusBadge(service.status, service.percentage)}
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {formatNumber(service.current, service.name)} đã dùng
                  </span>
                  <span>
                    giới hạn {formatLimit(service.limit, service.name)}
                  </span>
                </div>
                <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all ${getProgressBarColor(
                      service.percentage
                    )}`}
                    style={{ width: `${Math.min(service.percentage, 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs font-medium text-gray-600">
                  {service.percentage}%
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Warnings log */}
      {quotaData.warnings.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700">Nhật ký cảnh báo</h2>
          <ul className="mt-3 space-y-1.5">
            {quotaData.warnings.map((warning, idx) => (
              <li
                key={idx}
                className="rounded bg-danger-50 px-3 py-2 text-xs text-danger-700"
              >
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
