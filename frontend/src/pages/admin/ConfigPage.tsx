import { useEffect, useState } from 'react'
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
  min?: number
  max?: number
  unit: string
  currentValue: number
  kind: 'number' | 'toggle' | 'select'
  options?: Array<{ value: string; label: string }>
}

interface AiConfigStatus {
  provider: 'openai'
  model: string
  enabled: boolean
  keyConfigured: boolean
  keyLast4: string
  lastCheckStatus: 'missing' | 'untested' | 'ok' | 'error'
  lastCheckError: string
  lastCheckedAt: string
  encryptionReady: boolean
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
    kind: 'number',
  },
  time_limit: {
    label: 'Giới hạn thời gian bài tập',
    description: 'Thời gian làm bài mặc định cho mỗi bài tập.',
    min: 1,
    max: 180,
    unit: 'phút',
    kind: 'number',
  },
  max_submissions: {
    label: 'Số lần nộp tối đa',
    description: 'Số lần nộp bài tối đa cho mỗi bài tập.',
    min: 1,
    max: 100,
    unit: 'lần nộp',
    kind: 'number',
  },
  source_check_enabled: {
    label: 'Bật kiểm tra mã nguồn',
    description:
      'Cho phép giảng viên chạy kiểm tra tương đồng mã nguồn. Tắt mục này để tiết kiệm tài nguyên tính toán.',
    unit: '',
    kind: 'toggle',
  },
  source_check_weekly_enabled: {
    label: 'Lịch kiểm tra cuối tuần',
    description:
      'Cho phép workflow GitHub Actions chạy định kỳ cuối tuần cho các lớp/bài tập đã được giảng viên cấu hình.',
    unit: '',
    kind: 'toggle',
  },
  source_check_provider: {
    label: 'Công nghệ kiểm tra',
    description:
      'JPlag được chọn làm mặc định cho bài Java OOP; CPD/Dolos giữ làm phương án bổ trợ hoặc mở rộng.',
    unit: '',
    kind: 'select',
    options: [
      { value: 'jplag', label: 'JPlag' },
      { value: 'pmd_cpd', label: 'PMD CPD' },
      { value: 'dolos', label: 'Dolos' },
    ],
  },
  source_check_similarity_threshold: {
    label: 'Ngưỡng tương đồng mã nguồn',
    description:
      'Các cặp bài nộp vượt ngưỡng này sẽ được đưa vào danh sách nghi vấn để giảng viên rà soát.',
    min: 40,
    max: 95,
    unit: '%',
    kind: 'number',
  },
  source_check_max_runtime_minutes: {
    label: 'Giới hạn thời gian mỗi lượt quét',
    description:
      'Workflow sẽ dừng hoặc bỏ qua job nếu vượt quá ngân sách thời gian đã cấu hình.',
    min: 5,
    max: 120,
    unit: 'phút',
    kind: 'number',
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
  const [aiConfig, setAiConfig] = useState<AiConfigStatus | null>(null)
  const [aiModel, setAiModel] = useState('gpt-4o-mini')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  async function fetchConfig() {
    try {
      setLoading(true)
      setFetchError(null)
      const [configResponse, aiResponse] = await Promise.all([
        api.get('/api/admin/config'),
        api.get('/api/admin/ai-config'),
      ])

      const data: ConfigEntry[] = configResponse.data.data
      const aiData: AiConfigStatus = aiResponse.data.data
      setConfigs(data)
      setAiConfig(aiData)
      setAiModel(aiData.model)
      setAiEnabled(aiData.enabled)
      setAiApiKey('')

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

    if (meta.kind === 'toggle') {
      return trimmed === '0' || trimmed === '1' ? null : `${meta.label} không hợp lệ`
    }

    if (meta.kind === 'select') {
      return meta.options?.some((option) => option.value === trimmed)
        ? null
        : `${meta.label} không hợp lệ`
    }

    const num = parseInt(trimmed, 10)
    if (isNaN(num) || num.toString() !== trimmed) {
      return `${meta.label} phải là số nguyên hợp lệ`
    }

    if (typeof meta.min === 'number' && typeof meta.max === 'number' && (num < meta.min || num > meta.max)) {
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

  // Removed single handleSubmit in favor of batch handleSaveAll

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
        currentValue: entry ? parseInt(entry.value, 10) || 0 : 0,
      }
    })
    .filter((p) => configs.some((c) => c.key === p.key))

  async function handleSaveAll() {
    const nextErrors: Record<string, string> = {}
    let hasError = false

    for (const param of params) {
      const val = formValues[param.key] ?? ''
      const error = validateField(param.key, val)
      if (error) {
        nextErrors[param.key] = error
        hasError = true
      }
    }

    if (hasError) {
      setErrors(nextErrors)
      toast.error('Vui lòng sửa các lỗi cấu hình trước khi lưu.')
      return
    }

    setSaving('all')
    try {
      const changedParams = params.filter((p) => {
        const originalEntry = configs.find((c) => c.key === p.key)
        return originalEntry ? originalEntry.value !== formValues[p.key] : false
      })

      if (changedParams.length === 0) {
        toast.info('Không có thay đổi nào cần lưu.')
        return
      }

      await Promise.all(
        changedParams.map((p) =>
          api.put('/api/admin/config', {
            key: p.key,
            value: (formValues[p.key] ?? '').trim(),
          })
        )
      )

      toast.success('Đã lưu cấu hình hệ thống thành công.')
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

  async function handleSaveAiConfig() {
    const trimmedModel = aiModel.trim()
    if (trimmedModel.length < 3) {
      toast.error('Tên model AI không hợp lệ.')
      return
    }

    setAiSaving(true)
    try {
      const response = await api.put('/api/admin/ai-config', {
        provider: 'openai',
        model: trimmedModel,
        apiKey: aiApiKey.trim() || undefined,
        enabled: aiEnabled,
      })
      const nextConfig: AiConfigStatus = response.data.data
      setAiConfig(nextConfig)
      setAiModel(nextConfig.model)
      setAiEnabled(nextConfig.enabled)
      setAiApiKey('')
      toast.success(
        nextConfig.enabled
          ? 'Đã lưu và bật tính năng tạo bài tập bằng AI.'
          : 'Đã lưu cấu hình AI. Hãy kiểm tra API key thành công để bật tính năng.'
      )
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể lưu cấu hình AI.')
    } finally {
      setAiSaving(false)
    }
  }

  async function handleTestAiConfig() {
    setAiTesting(true)
    try {
      const response = await api.post('/api/admin/ai-config/test')
      const nextConfig: AiConfigStatus = response.data.data
      setAiConfig(nextConfig)
      setAiModel(nextConfig.model)
      setAiEnabled(nextConfig.enabled)
      if (nextConfig.lastCheckStatus === 'ok') {
        toast.success('API key AI hoạt động. Tính năng tạo bài tập đã được bật.')
      } else {
        toast.error(nextConfig.lastCheckError || 'API key AI chưa kiểm tra thành công.')
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể kiểm tra API key AI.')
    } finally {
      setAiTesting(false)
    }
  }

  async function handleClearAiKey() {
    setAiSaving(true)
    try {
      const response = await api.put('/api/admin/ai-config', {
        clearApiKey: true,
        enabled: false,
      })
      const nextConfig: AiConfigStatus = response.data.data
      setAiConfig(nextConfig)
      setAiModel(nextConfig.model)
      setAiEnabled(false)
      setAiApiKey('')
      toast.success('Đã xóa API key AI và tắt tính năng tạo bài tập bằng AI.')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể xóa API key AI.')
    } finally {
      setAiSaving(false)
    }
  }

  function getAiStatusLabel() {
    if (!aiConfig?.keyConfigured) return 'Chưa có API key'
    if (aiConfig.lastCheckStatus === 'ok') return 'Key hoạt động'
    if (aiConfig.lastCheckStatus === 'untested') return 'Key chưa kiểm tra'
    if (aiConfig.lastCheckStatus === 'error') return 'Key lỗi'
    return 'Chưa có API key'
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-800 text-lg shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <ConfigIcon className="h-5 w-5" />
          </span>
          <span>CẤU HÌNH HỆ THỐNG</span>
        </div>
        {params.length > 0 && (
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving === 'all'}
            className="bg-primary hover:bg-primary-700 text-white text-[11px] font-bold px-4 py-2.5 rounded-lg transition-all active:scale-[0.97] shadow-sm cursor-pointer inline-flex items-center gap-1.5"
          >
            {saving === 'all' ? (
              <>
                <Spinner /> Đang lưu...
              </>
            ) : (
              'Lưu cấu hình'
            )}
          </button>
        )}
      </div>

      {/* Config forms */}
      <div className="space-y-4">
        {params.map((param) => (
          <div
            key={param.key}
            className="card p-5"
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
                {param.kind === 'number' && (
                  <p className="mt-1 text-xs text-gray-400">
                    Khoảng hợp lệ: {param.min}–{param.max} {param.unit} | Giá trị
                    hiện tại: {param.currentValue}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-3">
                  {param.kind === 'toggle' ? (
                    <button
                      type="button"
                      onClick={() => handleChange(param.key, formValues[param.key] === '1' ? '0' : '1')}
                      className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-bold transition ${
                        formValues[param.key] === '1'
                          ? 'border-primary bg-primary-50 text-primary'
                          : 'border-gray-200 bg-gray-50 text-gray-500'
                      }`}
                      aria-pressed={formValues[param.key] === '1'}
                    >
                      {formValues[param.key] === '1' ? 'Đang bật' : 'Đang tắt'}
                    </button>
                  ) : param.kind === 'select' ? (
                    <select
                      id={`config-${param.key}`}
                      value={formValues[param.key] ?? ''}
                      onChange={(e) => handleChange(param.key, e.target.value)}
                      className={`input w-44 ${errors[param.key] ? 'input-error' : ''}`}
                    >
                      {param.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>

                {errors[param.key] && (
                  <p className="mt-1.5 text-xs text-danger-600">{errors[param.key]}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {params.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500">Không tìm thấy tham số nào có thể cấu hình.</p>
        </div>
      )}

      <div className="card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
              AI tạo bài tập
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Cấu hình API key để bật nút tạo draft bài tập bằng AI trong form ra đề.
              Frontend chỉ thấy trạng thái, không bao giờ nhận API key.
            </p>
            {!aiConfig?.encryptionReady && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Backend cần AI_SECRET_ENCRYPTION_KEY hoặc JWT_SECRET để mã hóa API key trước khi lưu.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
            {getAiStatusLabel()}
            {aiConfig?.keyLast4 && <span className="ml-1 font-mono">••••{aiConfig.keyLast4}</span>}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor="ai-provider" className="block text-sm font-semibold text-gray-800">
              Provider
            </label>
            <select id="ai-provider" value="openai" disabled className="input mt-2">
              <option value="openai">OpenAI</option>
            </select>
          </div>

          <div>
            <label htmlFor="ai-model" className="block text-sm font-semibold text-gray-800">
              Model
            </label>
            <input
              id="ai-model"
              value={aiModel}
              onChange={(event) => setAiModel(event.target.value)}
              className="input mt-2"
              placeholder="gpt-4o-mini"
            />
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="ai-api-key" className="block text-sm font-semibold text-gray-800">
              OpenAI API key
            </label>
            <input
              id="ai-api-key"
              type="password"
              value={aiApiKey}
              onChange={(event) => setAiApiKey(event.target.value)}
              className="input mt-2"
              placeholder={aiConfig?.keyConfigured ? 'Để trống nếu không đổi key' : 'sk-...'}
              autoComplete="off"
            />
          </div>
        </div>

        {aiConfig?.lastCheckError && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {aiConfig.lastCheckError}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setAiEnabled((value) => !value)}
            className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-bold transition ${
              aiEnabled
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-gray-200 bg-gray-50 text-gray-500'
            }`}
            aria-pressed={aiEnabled}
          >
            {aiEnabled ? 'Muốn bật' : 'Đang tắt'}
          </button>

          <button
            type="button"
            onClick={handleSaveAiConfig}
            disabled={aiSaving || !aiConfig?.encryptionReady}
            className="btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {aiSaving ? 'Đang lưu...' : 'Lưu cấu hình AI'}
          </button>

          <button
            type="button"
            onClick={handleTestAiConfig}
            disabled={aiTesting || !aiConfig?.keyConfigured || !aiConfig?.encryptionReady}
            className="btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {aiTesting ? 'Đang kiểm tra...' : 'Kiểm tra key'}
          </button>

          {aiConfig?.keyConfigured && (
            <button
              type="button"
              onClick={handleClearAiKey}
              disabled={aiSaving}
              className="btn-ghost btn-sm text-danger-600"
            >
              Xóa key
            </button>
          )}
        </div>

        {aiConfig?.lastCheckedAt && (
          <p className="mt-3 text-xs text-gray-400">
            Lần kiểm tra gần nhất: {new Date(aiConfig.lastCheckedAt).toLocaleString('vi-VN')}
          </p>
        )}
      </div>
    </div>
  )
}
