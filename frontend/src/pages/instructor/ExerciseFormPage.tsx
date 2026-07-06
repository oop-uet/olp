import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'] as const
type Difficulty = (typeof DIFFICULTY_OPTIONS)[number]

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
}

const OOP_TAG_OPTIONS = [
  'classes and objects',
  'inheritance',
  'polymorphism',
  'abstraction',
  'encapsulation',
  'interfaces',
  'exception handling',
]

interface TestCaseForm {
  input_data: string
  expected_output: string
  is_visible: boolean
  point_value: number
  time_limit_seconds?: number
}

interface FormErrors {
  title?: string
  description?: string
  difficulty?: string
  tags?: string
  testCases?: string
}

interface ExerciseTemplateFile {
  format?: string
  version?: number
  title?: string
  description?: string
  difficulty?: Difficulty
  oop_tags?: string[]
  starter_code?: string
  test_cases?: Partial<TestCaseForm>[]
  exercise?: {
    title?: string
    description?: string
    difficulty?: Difficulty
    oop_tags?: string[]
    starter_code?: string
  }
}

const TEMPLATE_FORMAT = 'uet-oasis-oop-exercise-template'

export const EMPTY_TEST_CASE: TestCaseForm = {
  input_data: '',
  expected_output: '',
  is_visible: true,
  point_value: 10,
}

export const SAMPLE_TEMPLATE: ExerciseTemplateFile & {
  authoring_notes: string[]
} = {
  format: TEMPLATE_FORMAT,
  version: 1,
  title: 'Student Management',
  description:
    'Viết lớp Student và StudentManagement theo yêu cầu. Mô tả rõ các lớp, thuộc tính, constructor, getter/setter và hành vi cần kiểm tra.',
  difficulty: 'medium',
  oop_tags: ['classes and objects', 'encapsulation'],
  starter_code: JSON.stringify(
    {
      format: 'oop-java-files',
      version: 1,
      files: [
        {
          name: 'Student.java',
          content: `public class Student {
    // TODO: declare fields, constructor and methods
}
`,
        },
        {
          name: 'StudentManagement.java',
          content: `public class StudentManagement {
    // TODO: manage students
}
`,
        },
      ],
    },
    null,
    2
  ),
  test_cases: [
    {
      input_data: '__OOP_JAVA_TEST__\nMyTest.java',
      expected_output: `import org.junit.Test;
import static org.junit.Assert.*;

public class MyTest {
    @Test
    public void testStudentConstructor() {
        Student s = new Student("Nguyen Van A", "24000001", 3.5);
        assertEquals("Nguyen Van A", s.getName());
        assertEquals("24000001", s.getStudentId());
        assertEquals(3.5, s.getGpa(), 0.001);
    }
}
`,
      is_visible: true,
      point_value: 50,
      time_limit_seconds: 3,
    },
    {
      input_data: '__OOP_JAVA_TEST__\nHiddenTest.java',
      expected_output: `import org.junit.Test;
import static org.junit.Assert.*;

public class HiddenTest {
    @Test
    public void testValidation() {
        assertThrows(IllegalArgumentException.class, () -> new Student("A", "1", -1.0));
    }
}
`,
      is_visible: false,
      point_value: 50,
      time_limit_seconds: 3,
    },
  ],
  authoring_notes: [
    'Giữ format/version để hệ thống nhận diện template.',
    'Với JUnit test, input_data đặt dạng __OOP_JAVA_TEST__ + tên file test; expected_output là toàn bộ nội dung file .java.',
    'Tổng point_value nên bằng 100 để dễ đọc điểm.',
    'is_visible=false dùng cho test ẩn, sinh viên không nhìn thấy chi tiết.',
  ],
}

export function ExerciseFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [starterCode, setStarterCode] = useState('')
  const [testCases, setTestCases] = useState<TestCaseForm[]>([
    EMPTY_TEST_CASE,
  ])
  const [templateText, setTemplateText] = useState('')
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

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
      const [exerciseRes, testCasesRes] = await Promise.all([
        api.get(`/api/exercises/${exerciseId}`),
        api.get(`/api/exercises/${exerciseId}/testcases`),
      ])
      const ex = exerciseRes.data
      setTitle(ex.title)
      setDescription(ex.description)
      setDifficulty(ex.difficulty)
      setSelectedTags(ex.oop_tags || [])
      setStarterCode(ex.starter_code || '')

      const loadedTestCases = testCasesRes.data
      if (loadedTestCases.length > 0) {
        setTestCases(
          loadedTestCases.map((tc: TestCaseForm) => ({
            input_data: tc.input_data || '',
            expected_output: tc.expected_output || '',
            is_visible: Boolean(tc.is_visible ?? true),
            point_value: tc.point_value || 10,
            time_limit_seconds: tc.time_limit_seconds,
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

    if (selectedTags.length < 1) {
      newErrors.tags = 'Cần ít nhất 1 thẻ'
    } else if (selectedTags.length > 5) {
      newErrors.tags = 'Tối đa 5 thẻ'
    }

    const validTestCases = testCases.filter(
      (tc) => tc.input_data.trim() !== '' && tc.expected_output.trim() !== ''
    )
    if (validTestCases.length < 1) {
      newErrors.testCases = 'Cần ít nhất 1 bộ test có đầu vào và kết quả mong đợi'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleTagToggle(tag: string) {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag)
      }
      if (prev.length >= 5) return prev
      return [...prev, tag]
    })
  }

  function addTestCase() {
    if (testCases.length >= 50) return
    setTestCases((prev) => [
      ...prev,
      EMPTY_TEST_CASE,
    ])
  }

  function removeTestCase(index: number) {
    if (testCases.length <= 1) return
    setTestCases((prev) => prev.filter((_, i) => i !== index))
  }

  function updateTestCase(index: number, field: keyof TestCaseForm, value: string | boolean | number | undefined) {
    setTestCases((prev) => prev.map((tc, i) => (i === index ? { ...tc, [field]: value } : tc)))
  }

  function buildTemplateFromForm(): ExerciseTemplateFile {
    return {
      format: TEMPLATE_FORMAT,
      version: 1,
      title: title.trim() || 'Tên bài tập',
      description: description.trim() || 'Mô tả yêu cầu bài tập.',
      difficulty: difficulty || 'easy',
      oop_tags: selectedTags.length > 0 ? selectedTags : ['classes and objects'],
      starter_code: starterCode,
      test_cases: testCases.map((tc) => ({
        input_data: tc.input_data,
        expected_output: tc.expected_output,
        is_visible: tc.is_visible,
        point_value: tc.point_value,
        ...(tc.time_limit_seconds ? { time_limit_seconds: tc.time_limit_seconds } : {}),
      })),
    }
  }

  function downloadJson(fileName: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function handleDownloadBlankTemplate() {
    downloadJson('uet-oasis-exercise-template.json', SAMPLE_TEMPLATE)
  }

  function handleExportCurrentTemplate() {
    downloadJson(`${slugify(title || 'exercise')}-template.json`, buildTemplateFromForm())
  }

  function normalizeTemplate(raw: ExerciseTemplateFile): Required<Pick<ExerciseTemplateFile, 'title' | 'description' | 'difficulty' | 'oop_tags'>> & {
    starter_code: string
    test_cases: TestCaseForm[]
  } {
    const exercise = raw.exercise ?? {}
    const normalizedTitle = raw.title ?? exercise.title ?? ''
    const normalizedDescription = raw.description ?? exercise.description ?? ''
    const normalizedDifficulty = raw.difficulty ?? exercise.difficulty
    const normalizedTags = raw.oop_tags ?? exercise.oop_tags ?? []
    const normalizedStarterCode = raw.starter_code ?? exercise.starter_code ?? ''
    const normalizedTestCases = Array.isArray(raw.test_cases) ? raw.test_cases : []

    if (!normalizedTitle.trim()) throw new Error('Template thiếu title.')
    if (!normalizedDescription.trim()) throw new Error('Template thiếu description.')
    if (!normalizedDifficulty || !DIFFICULTY_OPTIONS.includes(normalizedDifficulty)) {
      throw new Error('difficulty phải là easy, medium hoặc hard.')
    }
    if (!Array.isArray(normalizedTags) || normalizedTags.length < 1 || normalizedTags.length > 5) {
      throw new Error('oop_tags cần từ 1 đến 5 thẻ.')
    }
    if (normalizedTestCases.length < 1) throw new Error('Template cần ít nhất 1 test case.')
    if (normalizedTestCases.length > 50) throw new Error('Tối đa 50 test case.')

    const mappedTestCases = normalizedTestCases.map((tc, index) => {
      const pointValue = Number(tc.point_value ?? 10)
      const timeLimit = tc.time_limit_seconds == null ? undefined : Number(tc.time_limit_seconds)
      const inputData = String(tc.input_data ?? '').trim()
      const expectedOutput = String(tc.expected_output ?? '')

      if (!inputData) throw new Error(`Test case #${index + 1} thiếu input_data.`)
      if (!expectedOutput.trim()) throw new Error(`Test case #${index + 1} thiếu expected_output.`)
      if (!Number.isInteger(pointValue) || pointValue < 1 || pointValue > 100) {
        throw new Error(`point_value của test case #${index + 1} phải từ 1 đến 100.`)
      }
      if (timeLimit !== undefined && (!Number.isInteger(timeLimit) || timeLimit < 1)) {
        throw new Error(`time_limit_seconds của test case #${index + 1} phải là số nguyên dương.`)
      }

      return {
        input_data: inputData,
        expected_output: expectedOutput,
        is_visible: Boolean(tc.is_visible ?? true),
        point_value: pointValue,
        ...(timeLimit ? { time_limit_seconds: timeLimit } : {}),
      }
    })

    return {
      title: normalizedTitle.trim(),
      description: normalizedDescription.trim(),
      difficulty: normalizedDifficulty,
      oop_tags: normalizedTags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 5),
      starter_code: normalizedStarterCode,
      test_cases: mappedTestCases,
    }
  }

  function applyTemplate(raw: unknown) {
    try {
      const normalized = normalizeTemplate(raw as ExerciseTemplateFile)
      setTitle(normalized.title)
      setDescription(normalized.description)
      setDifficulty(normalized.difficulty)
      setSelectedTags(normalized.oop_tags)
      setStarterCode(normalized.starter_code)
      setTestCases(normalized.test_cases)
      setTemplateError(null)
      setErrors({})
      toast.success('Đã nhập template vào form.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Template không hợp lệ.'
      setTemplateError(message)
      toast.error(message)
    }
  }

  function handleApplyTemplateText() {
    try {
      applyTemplate(JSON.parse(templateText))
    } catch {
      setTemplateError('Nội dung không phải JSON hợp lệ.')
      toast.error('Nội dung không phải JSON hợp lệ.')
    }
  }

  async function handleImportTemplateFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const content = await file.text()
      setTemplateText(content)
      applyTemplate(JSON.parse(content))
      setTemplatePanelOpen(true)
    } catch {
      setTemplateError('Không đọc được file template JSON.')
      toast.error('Không đọc được file template JSON.')
    }
  }

  function handleFillSampleTemplate() {
    setTemplateText(JSON.stringify(SAMPLE_TEMPLATE, null, 2))
    setTemplatePanelOpen(true)
    setTemplateError(null)
  }

  function slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'exercise'
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!validate()) return

    setSubmitting(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        difficulty,
        oop_tags: selectedTags,
        starter_code: starterCode,
        test_cases: testCases.filter((tc) => tc.input_data.trim() !== '' && tc.expected_output.trim() !== ''),
      }

      if (isEditing && id) {
        await api.put(`/api/exercises/${id}`, payload)
        toast.success('Đã cập nhật bài tập.')
      } else {
        await api.post('/api/exercises', payload)
        toast.success('Đã tạo bài tập.')
      }

      navigate('/instructor/exercises')
    } catch {
      toast.error(
        isEditing
          ? 'Không thể cập nhật bài tập. Vui lòng thử lại.'
          : 'Không thể tạo bài tập. Vui lòng thử lại.'
      )
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
        <button onClick={() => navigate('/instructor/exercises')} className="btn-ghost btn-sm">
          ← Quay lại danh sách
        </button>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6 p-6" noValidate>
        <section className="rounded-lg border border-slate-200 bg-slate-50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Template ra đề</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                JSON template dùng để tải mẫu, xuất bài hiện tại hoặc nhập nội dung do AI tạo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleDownloadBlankTemplate} className="btn-secondary btn-sm">
                Tải mẫu JSON
              </button>
              <button type="button" onClick={handleExportCurrentTemplate} className="btn-secondary btn-sm">
                Xuất bài hiện tại
              </button>
              <label className="btn-secondary btn-sm cursor-pointer">
                Nhập file JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportTemplateFile}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setTemplatePanelOpen((value) => !value)}
                className="btn-ghost btn-sm"
              >
                {templatePanelOpen ? 'Ẩn JSON' : 'Dán JSON'}
              </button>
            </div>
          </div>

          {templatePanelOpen && (
            <div className="space-y-3 p-4">
              <textarea
                value={templateText}
                onChange={(e) => {
                  setTemplateText(e.target.value)
                  setTemplateError(null)
                }}
                rows={14}
                className="input font-mono text-xs"
                placeholder="Dán JSON template ở đây..."
              />
              {templateError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {templateError}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleApplyTemplateText} className="btn-primary btn-sm">
                  Áp dụng JSON vào form
                </button>
                <button type="button" onClick={handleFillSampleTemplate} className="btn-ghost btn-sm">
                  Điền mẫu tham khảo
                </button>
              </div>
            </div>
          )}
        </section>

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
            <option value="">Chọn độ khó</option>
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
          <label className="label">
            Thẻ OOP <span className="text-danger-500">*</span>
            <span className="ml-1 font-normal text-gray-400">(chọn 1-5)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {OOP_TAG_OPTIONS.map((tag) => {
              const isSelected = selectedTags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleTagToggle(tag)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-primary-200 hover:bg-primary-50'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
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

        {/* Test Cases */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="label mb-0">
              Bộ test <span className="text-danger-500">*</span>
              <span className="ml-1 font-normal text-gray-400">(cần ít nhất 1)</span>
            </label>
            <button
              type="button"
              onClick={addTestCase}
              disabled={testCases.length >= 50}
              className="btn-ghost btn-sm"
            >
              + Thêm bộ test
            </button>
          </div>

          {errors.testCases && <p className="mb-2 text-xs text-danger-600">{errors.testCases}</p>}

          <div className="space-y-4">
            {testCases.map((tc, index) => (
              <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Bộ test #{index + 1}</span>
                  {testCases.length > 1 && (
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
                      value={tc.input_data}
                      onChange={(e) => updateTestCase(index, 'input_data', e.target.value)}
                      rows={3}
                      className="input font-mono text-xs"
                      placeholder="Dữ liệu đầu vào..."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Kết quả mong đợi <span className="text-danger-500">*</span>
                    </label>
                    <textarea
                      value={tc.expected_output}
                      onChange={(e) => updateTestCase(index, 'expected_output', e.target.value)}
                      rows={3}
                      className="input font-mono text-xs"
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
                      value={tc.point_value}
                      onChange={(e) =>
                        updateTestCase(index, 'point_value', parseInt(e.target.value) || 1)
                      }
                      className="input w-16 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Giây:</label>
                    <input
                      type="number"
                      min={1}
                      value={tc.time_limit_seconds ?? ''}
                      onChange={(e) =>
                        updateTestCase(
                          index,
                          'time_limit_seconds',
                          e.target.value ? parseInt(e.target.value, 10) || undefined : undefined
                        )
                      }
                      className="input w-20 text-xs"
                      placeholder="Mặc định"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={tc.is_visible}
                      onChange={(e) => updateTestCase(index, 'is_visible', e.target.checked)}
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
            onClick={() => navigate('/instructor/exercises')}
            className="btn-secondary btn-lg"
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  )
}
