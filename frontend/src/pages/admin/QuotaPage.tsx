import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui'

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
  return status === 'warning' ? 'border-red-300' : 'border-gray-200'
}

function getStatusBadge(status: 'ok' | 'warning', percentage: number) {
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        ⚠️ Above 80%
      </span>
    )
  }
  if (percentage >= 60) {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
        Moderate
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      Healthy
    </span>
  )
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
      setError('Failed to load quota status. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingIndicator label="Loading quota status..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchQuota}
          className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-600 transition-colors"
        >
          Retry
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quota Monitor</h1>
          <p className="mt-1 text-sm text-gray-600">
            Free-tier service usage for the platform.
          </p>
        </div>
        <button
          onClick={fetchQuota}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Warning banner */}
      {warningCount > 0 && (
        <div
          className="rounded border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800"
          role="alert"
        >
          <span className="font-medium">⚠️ Attention:</span>{' '}
          {warningCount} service{warningCount > 1 ? 's are' : ' is'} above 80%
          of free-tier limits. Consider reducing usage or upgrading.
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
              className={`rounded-lg border bg-white p-5 shadow-sm ${getCardBorderColor(
                service.status
              )}`}
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
                    {formatNumber(service.current, service.name)} used
                  </span>
                  <span>
                    {formatLimit(service.limit, service.name)} limit
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
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Warning Log</h2>
          <ul className="mt-3 space-y-1.5">
            {quotaData.warnings.map((warning, idx) => (
              <li
                key={idx}
                className="rounded bg-red-50 px-3 py-2 text-xs text-red-700"
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
