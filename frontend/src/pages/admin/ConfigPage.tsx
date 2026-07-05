import { useEffect, useState, FormEvent } from 'react'
import { api } from '../../lib/api'
import { PageLoader, Spinner, ConfigIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

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
    label: 'Ngưỡng cảnh báo',
    description:
      'Số lần cảnh báo chống gian lận tối đa trước khi điểm bị tự động hủy.',
    min: 1,
    max: 10,
    unit: 'lần cảnh báo',
  },
  time_limit: {
    label: 'Giới hạn thời gian bài tập',
    description: 'Thời gian làm bài mặc định cho mỗi bài tập.',
    min: 1,
    max: 180,
    unit: 'phút',
  },
  max_submissions: {
    label: 'Số lần nộp tối đa',
    description: 'Số lần nộp bài tối đa cho mỗi bài tập.',
    min: 1,
    max: 100,
    unit: 'lần nộp',
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
      setFetchError('Không thể tải cấu hình. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  function validateField(key: string, value: string): string | null {
    const meta = CONFIG_PARAMS[key]
    if (!meta) return null

    const trimmed = value.trim()
    if (!trimmed) return `${meta.label} là bắt buộc`

    const num = parseInt(trimmed, 10)
    if (isNaN(num) || num.toString() !== trimmed) {
      return `${meta.label} phải là số nguyên hợp lệ`
    }

    if (num < meta.min || num > meta.max) {
      return `${meta.label} phải nằm trong khoảng ${meta.min} đến ${meta.max}`
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
  }

  async function handleSubmit(key: string, e: FormEvent) {
    e.preventDefault()

    const value = formValues[key] ?? ''
    const error = validateField(key, value)

    if (error) {
      setErrors((prev) => ({ ...prev, [key]: error }))
      return
    }

    setSaving(key)
    try {
      await api.put('/api/admin/config', { key, value: value.trim() })
      toast.success(
        `Đã cập nhật ${CONFIG_PARAMS[key]?.label || key} thành công.`
      )
      // Refresh config to show latest values
      await fetchConfig()
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      const message =
        axiosErr?.response?.data?.error?.message ||
        'Không thể cập nhật cấu hình.'
      toast.error(message)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải cấu hình..." />
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-danger-600">{fetchError}</p>
        <button onClick={fetchConfig} className="btn-primary">
          Thử lại
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
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary">
          <ConfigIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cấu hình hệ thống</h1>
        </div>
      </div>

      {/* Config forms */}
      <div className="space-y-4">
        {params.map((param) => (
          <form
            key={param.key}
            onSubmit={(e) => handleSubmit(param.key, e)}
            className="card p-5"
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
                  Khoảng hợp lệ: {param.min}–{param.max} {param.unit} | Giá trị
                  hiện tại: {param.currentValue}
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <input
                    id={`config-${param.key}`}
                    type="number"
                    min={param.min}
                    max={param.max}
                    value={formValues[param.key] ?? ''}
                    onChange={(e) => handleChange(param.key, e.target.value)}
                    className={`input w-32 ${errors[param.key] ? 'input-error' : ''}`}
                  />
                  <span className="text-xs text-gray-500">{param.unit}</span>
                </div>

                {errors[param.key] && (
                  <p className="mt-1.5 text-xs text-danger-600">{errors[param.key]}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={saving === param.key}
                className="btn-primary shrink-0"
              >
                {saving === param.key ? (
                  <>
                    <Spinner /> Đang lưu...
                  </>
                ) : (
                  'Cập nhật'
                )}
              </button>
            </div>
          </form>
        ))}
      </div>

      {params.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500">Không tìm thấy tham số nào có thể cấu hình.</p>
        </div>
      )}
    </div>
  )
}
