import { useEffect, useState, FormEvent } from 'react'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConfigEntry {
  key: string
  value: string
  validRange: string | null
  updatedAt: string
  updatedBy: string | null
}

interface ConfigParam {
  key: string
  label: string
  description: string
  min: number
  max: number
  unit: string
  currentValue: number
}

// ─── Config Parameter Metadata ───────────────────────────────────────────────

const CONFIG_PARAMS: Record<string, Omit<ConfigParam, 'key' | 'currentValue'>> = {
  warning_threshold: {
    label: 'Warning Threshold',
    description:
      'Maximum number of anti-cheat warnings before automatic score nullification.',
    min: 1,
    max: 10,
    unit: 'warnings',
  },
  time_limit: {
    label: 'Exercise Time Limit',
    description: 'Default time limit for exercise completion.',
    min: 1,
    max: 180,
    unit: 'minutes',
  },
  max_submissions: {
    label: 'Maximum Submissions',
    description: 'Maximum number of submission attempts per exercise.',
    min: 1,
    max: 100,
    unit: 'attempts',
  },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConfigPage() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([])
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  async function fetchConfig() {
    try {
      setLoading(true)
      setFetchError(null)
      const response = await api.get('/api/admin/config')
      const data: ConfigEntry[] = response.data.data
      setConfigs(data)

      // Initialize form values from current config
      const values: Record<string, string> = {}
      for (const entry of data) {
        values[entry.key] = entry.value
      }
      setFormValues(values)
    } catch {
      setFetchError('Failed to load configuration. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function validateField(key: string, value: string): string | null {
    const meta = CONFIG_PARAMS[key]
    if (!meta) return null

    const trimmed = value.trim()
    if (!trimmed) return `${meta.label} is required`

    const num = parseInt(trimmed, 10)
    if (isNaN(num) || num.toString() !== trimmed) {
      return `${meta.label} must be a valid integer`
    }

    if (num < meta.min || num > meta.max) {
      return `${meta.label} must be between ${meta.min} and ${meta.max}`
    }

    return null
  }

  function handleChange(key: string, value: string) {
    setFormValues((prev) => ({ ...prev, [key]: value }))
    // Clear error on change
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setSuccessMessage(null)
  }

  async function handleSubmit(key: string, e: FormEvent) {
    e.preventDefault()
    setSuccessMessage(null)

    const value = formValues[key] ?? ''
    const error = validateField(key, value)

    if (error) {
      setErrors((prev) => ({ ...prev, [key]: error }))
      return
    }

    setSaving(key)
    try {
      await api.put('/api/admin/config', { key, value: value.trim() })
      setSuccessMessage(
        `${CONFIG_PARAMS[key]?.label || key} updated successfully.`
      )
      // Refresh config to show latest values
      await fetchConfig()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      const message =
        axiosErr?.response?.data?.error?.message ||
        'Failed to update configuration.'
      setErrors((prev) => ({ ...prev, [key]: message }))
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return <LoadingIndicator label="Loading configuration..." />
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-600">{fetchError}</p>
        <button
          onClick={fetchConfig}
          className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-600 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  // Build display params by merging metadata with current values
  const params: ConfigParam[] = Object.entries(CONFIG_PARAMS)
    .map(([key, meta]) => {
      const entry = configs.find((c) => c.key === key)
      return {
        key,
        ...meta,
        currentValue: entry ? parseInt(entry.value, 10) : 0,
      }
    })
    .filter((p) => configs.some((c) => c.key === p.key))

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Configuration</h1>
        <p className="mt-1 text-sm text-gray-600">
          Adjust system parameters. Changes apply to new sessions after modification.
        </p>
      </div>

      {/* Success message */}
      {successMessage && (
        <div
          className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
          role="status"
        >
          {successMessage}
        </div>
      )}

      {/* Config forms */}
      <div className="space-y-4">
        {params.map((param) => (
          <form
            key={param.key}
            onSubmit={(e) => handleSubmit(param.key, e)}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            noValidate
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1">
                <label
                  htmlFor={`config-${param.key}`}
                  className="block text-sm font-semibold text-gray-800"
                >
                  {param.label}
                </label>
                <p className="mt-0.5 text-xs text-gray-500">{param.description}</p>
                <p className="mt-1 text-xs text-gray-400">
                  Valid range: {param.min}–{param.max} {param.unit} | Current
                  value: {param.currentValue}
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <input
                    id={`config-${param.key}`}
                    type="number"
                    min={param.min}
                    max={param.max}
                    value={formValues[param.key] ?? ''}
                    onChange={(e) => handleChange(param.key, e.target.value)}
                    className={`w-32 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                      errors[param.key]
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                        : 'border-gray-300 focus:border-primary focus:ring-primary'
                    }`}
                  />
                  <span className="text-xs text-gray-500">{param.unit}</span>
                </div>

                {errors[param.key] && (
                  <p className="mt-1.5 text-xs text-red-600">{errors[param.key]}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={saving === param.key}
                className="shrink-0 rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
              >
                {saving === param.key ? 'Saving...' : 'Update'}
              </button>
            </div>
          </form>
        ))}
      </div>

      {params.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">No configurable parameters found.</p>
        </div>
      )}
    </div>
  )
}
