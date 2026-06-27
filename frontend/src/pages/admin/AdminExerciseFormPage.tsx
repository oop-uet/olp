import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'

// ─── Constants ───────────────────────────────────────────────────────────────

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'] as const
type Difficulty = (typeof DIFFICULTY_OPTIONS)[number]

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface TestCaseForm {
  inputData: string
  expectedOutput: string
  isVisible: boolean
  pointValue: number
}

interface FormErrors {
  title?: string
  description?: string
  difficulty?: string
  tags?: string
  testCases?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseOopTags(tags: string[] | string | undefined | null): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function splitTags(input: string): string[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function emptyTestCase(): TestCaseForm {
  return { inputData: '', expectedOutput: '', isVisible: true, pointValue: 10 }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AdminExerciseFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [tagsInput, setTagsInput] = useState('')
  const [starterCode, setStarterCode] = useState('')
  const [isLibrary, setIsLibrary] = useState(false)
  const [testCases, setTestCases] = useState<TestCaseForm[]>([emptyTestCase()])

  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isEditing && id) {
      loadExercise(id)
    }
  }, [id, isEditing])

  async function loadExercise(exerciseId: string) {
    setLoading(true)
    try {
      const response = await api.get(`/api/admin/exercises/${exerciseId}`)
      const ex = response.data
      setTitle(ex.title ?? '')
      setDescription(ex.description ?? '')
      setDifficulty((ex.difficulty as Difficulty) ?? 'easy')
      setTagsInput(parseOopTags(ex.oopTags ?? ex.oop_tags).join(', '))
      setStarterCode(ex.starterCode ?? ex.starter_code ?? '')
      setIsLibrary(ex.isLibrary === 1 || ex.isLibrary === true || ex.is_library === true)

      const loaded = Array.isArray(ex.testCases) ? ex.testCases : []
      if (loaded.length > 0) {
        setTestCases(
          loaded.map((tc: Record<string, unknown>) => ({
            inputData: (tc.inputData ?? tc.input_data ?? '') as string,
            expectedOutput: (tc.expectedOutput ?? tc.expected_output ?? '') as string,
            isVisible:
              tc.isVisible === 1 || tc.isVisible === true || tc.is_visible === true,
            pointValue: (tc.pointValue ?? tc.point_value ?? 10) as number,
          }))
        )
      }
    } catch {
      toast.error('Không thể tải dữ liệu bài tập.')
    } finally {
      setLoading(false)
    }
  }

  function validate(): boolean {
    const newErrors: FormErrors = {}

    if (!title.trim()) {
      newErrors.title = 'Tiêu đề là bắt buộc'
    } else if (title.length > 200) {
      newErrors.title = 'Tiêu đề tối đa 200 ký tự'
    }

    if (!description.trim()) {
      newErrors.description = 'Mô tả là bắt buộc'
    } else if (description.length > 5000) {
      newErrors.description = 'Mô tả tối đa 5000 ký tự'
    }

    if (!difficulty) {
      newErrors.difficulty = 'Độ khó là bắt buộc'
    }

    const tags = splitTags(tagsInput)
    if (tags.length < 1) {
      newErrors.tags = 'Cần ít nhất 1 thẻ OOP'
    } else if (tags.length > 5) {
      newErrors.tags = 'Tối đa 5 thẻ OOP'
    }

    if (!isEditing) {
      const validTestCases = testCases.filter(
        (tc) => tc.inputData.trim() !== '' && tc.expectedOutput.trim() !== ''
      )
      if (validTestCases.length < 1) {
        newErrors.testCases = 'Cần ít nhất 1 bộ test có đầu vào và kết quả mong đợi'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function addTestCase() {
    if (testCases.length >= 50) return
    setTestCases((prev) => [...prev, emptyTestCase()])
  }

  function removeTestCase(index: number) {
    if (testCases.length <= 1) return
    setTestCases((prev) => prev.filter((_, i) => i !== index))
  }

  function updateTestCase(
    index: number,
    field: keyof TestCaseForm,
    value: string | boolean | number
  ) {
    setTestCases((prev) => prev.map((tc, i) => (i === index ? { ...tc, [field]: value } : tc)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!validate()) return

    setSubmitting(true)
    try {
      const tags = splitTags(tagsInput)

      if (isEditing && id) {
        await api.put(`/api/admin/exercises/${id}`, {
          title: title.trim(),
          description: description.trim(),
          difficulty,
          oop_tags: tags,
          starter_code: starterCode,
          is_library: isLibrary,
        })
        toast.success('Đã cập nhật bài tập.')
      } else {
        await api.post('/api/admin/exercises', {
          title: title.trim(),
          description: description.trim(),
          difficulty,
          oop_tags: tags,
          starter_code: starterCode || undefined,
          is_library: isLibrary,
          test_cases: testCases
            .filter((tc) => tc.inputData.trim() !== '' && tc.expectedOutput.trim() !== '')
            .map((tc) => ({
              input_data: tc.inputData,
              expected_output: tc.expectedOutput,
              is_visible: tc.isVisible,
              point_value: tc.pointValue,
            })),
        })
        toast.success('Đã tạo bài tập.')
      }

      navigate('/admin/exercises')
    } catch (error) {
      const message =
        (error as AxiosError<{ error?: { message?: string } }>)?.response?.data?.error?.message ||
        (isEditing
          ? 'Không thể cập nhật bài tập. Vui lòng thử lại.'
          : 'Không thể tạo bài tập. Vui lòng thử lại.')
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải bài tập..." />
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">
          {isEditing ? 'Sửa bài tập' : 'Tạo bài tập'}
        </h1>
        <button onClick={() => navigate('/admin/exercises')} className="btn-ghost btn-sm">
          ← Quay lại danh sách
        </button>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6 p-6" noValidate>
        {/* Title */}
        <div>
          <label htmlFor="title" className="label">
            Tiêu đề <span className="text-danger-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className={`input ${errors.title ? 'input-error' : ''}`}
            placeholder="Tiêu đề bài tập"
          />
          <div className="mt-1 flex justify-between">
            {errors.title && <p className="text-xs text-danger-600">{errors.title}</p>}
            <p className="ml-auto text-xs text-gray-400">{title.length}/200</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="label">
            Mô tả <span className="text-danger-500">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={6}
            className={`input ${errors.description ? 'input-error' : ''}`}
            placeholder="Mô tả yêu cầu của bài tập..."
          />
          <div className="mt-1 flex justify-between">
            {errors.description && <p className="text-xs text-danger-600">{errors.description}</p>}
            <p className="ml-auto text-xs text-gray-400">{description.length}/5000</p>
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <label htmlFor="difficulty" className="label">
            Độ khó <span className="text-danger-500">*</span>
          </label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className={`input ${errors.difficulty ? 'input-error' : ''}`}
          >
            {DIFFICULTY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {DIFFICULTY_LABELS[opt]}
              </option>
            ))}
          </select>
          {errors.difficulty && <p className="mt-1 text-xs text-danger-600">{errors.difficulty}</p>}
        </div>

        {/* OOP Tags */}
        <div>
          <label htmlFor="oop-tags" className="label">
            Thẻ OOP <span className="text-danger-500">*</span>
            <span className="ml-1 font-normal text-gray-400">(phân tách bằng dấu phẩy, 1-5 thẻ)</span>
          </label>
          <input
            id="oop-tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className={`input ${errors.tags ? 'input-error' : ''}`}
            placeholder="inheritance, polymorphism, abstraction"
          />
          {errors.tags && <p className="mt-1 text-xs text-danger-600">{errors.tags}</p>}
        </div>

        {/* Starter Code */}
        <div>
          <label htmlFor="starter-code" className="label">
            Mã khởi tạo (template)
          </label>
          <textarea
            id="starter-code"
            value={starterCode}
            onChange={(e) => setStarterCode(e.target.value)}
            rows={8}
            className="input font-mono"
            placeholder="// Mã khởi tạo cho sinh viên..."
          />
        </div>

        {/* Is Library */}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isLibrary}
            onChange={(e) => setIsLibrary(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          Thêm vào thư viện bài tập
        </label>

        {/* Test Cases */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="label mb-0">
              Bộ test {!isEditing && <span className="text-danger-500">*</span>}
              <span className="ml-1 font-normal text-gray-400">
                {isEditing ? '(không cập nhật khi sửa)' : '(cần ít nhất 1)'}
              </span>
            </label>
            {!isEditing && (
              <button
                type="button"
                onClick={addTestCase}
                disabled={testCases.length >= 50}
                className="btn-ghost btn-sm"
              >
                + Thêm test case
              </button>
            )}
          </div>

          {isEditing && (
            <p className="mb-2 text-xs text-gray-400">
              Các bộ test không thể chỉnh sửa ở đây và sẽ không bị thay đổi khi lưu.
            </p>
          )}

          {errors.testCases && <p className="mb-2 text-xs text-danger-600">{errors.testCases}</p>}

          <div className="space-y-4">
            {testCases.map((tc, index) => (
              <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Bộ test #{index + 1}</span>
                  {!isEditing && testCases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTestCase(index)}
                      className="text-xs text-danger-600 hover:text-danger-700"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">Đầu vào</label>
                    <textarea
                      value={tc.inputData}
                      onChange={(e) => updateTestCase(index, 'inputData', e.target.value)}
                      rows={3}
                      disabled={isEditing}
                      className="input font-mono text-xs disabled:bg-gray-100 disabled:text-gray-500"
                      placeholder="Dữ liệu đầu vào..."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Kết quả mong đợi {!isEditing && <span className="text-danger-500">*</span>}
                    </label>
                    <textarea
                      value={tc.expectedOutput}
                      onChange={(e) => updateTestCase(index, 'expectedOutput', e.target.value)}
                      rows={3}
                      disabled={isEditing}
                      className="input font-mono text-xs disabled:bg-gray-100 disabled:text-gray-500"
                      placeholder="Kết quả mong đợi..."
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Điểm:</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={tc.pointValue}
                      disabled={isEditing}
                      onChange={(e) =>
                        updateTestCase(index, 'pointValue', parseInt(e.target.value) || 1)
                      }
                      className="input w-16 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={tc.isVisible}
                      disabled={isEditing}
                      onChange={(e) => updateTestCase(index, 'isVisible', e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    Hiển thị cho sinh viên
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 border-t border-gray-200 pt-6">
          <button type="submit" disabled={submitting} className="btn-primary btn-lg">
            {submitting
              ? isEditing
                ? 'Đang cập nhật...'
                : 'Đang tạo...'
              : isEditing
                ? 'Cập nhật bài tập'
                : 'Tạo bài tập'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/exercises')}
            className="btn-secondary btn-lg"
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  )
}
