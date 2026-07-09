import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { ExerciseDescriptionEditor } from '../../components/exercise/ExerciseDescriptionEditor'
import { ExerciseAiGenerator } from '../../components/exercise/ExerciseAiGenerator'

// ─── Constants ───────────────────────────────────────────────────────────────

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'] as const
type Difficulty = (typeof DIFFICULTY_OPTIONS)[number]

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
}

const DEFAULT_STYLE_DISABLED_RULES = ['javadoc', 'line_length']

const STYLE_RULE_OPTIONS = [
  { id: 'indentation', label: 'Thụt lề', help: 'Kiểm tra level thụt lề chung.' },
  { id: 'indentation.method_def_modifier', label: 'Thụt lề khai báo phương thức', help: 'Ví dụ: method def modifier expected level.' },
  { id: 'indentation.method_def_child', label: 'Thụt lề nội dung phương thức', help: 'Ví dụ: method def child expected level.' },
  { id: 'whitespace', label: 'Khoảng trắng', help: 'Khoảng trắng trước/sau toán tử, dấu ngoặc, dấu phẩy.' },
  { id: 'imports', label: 'Import', help: 'Thứ tự import, import thừa hoặc wildcard.' },
  { id: 'braces', label: 'Dấu ngoặc và khối lệnh', help: 'Quy tắc dùng braces cho if/for/while và block.' },
  { id: 'naming', label: 'Đặt tên', help: 'Tên lớp, biến, phương thức theo convention Java.' },
  { id: 'javadoc', label: 'Javadoc', help: 'Yêu cầu comment Javadoc cho lớp/phương thức.' },
  { id: 'line_length', label: 'Độ dài dòng', help: 'Giới hạn độ dài dòng theo Google Java Style.' },
] as const

// ─── Types ─────────────────────────────────────────────────────────────────

interface TestCaseForm {
  inputData: string
  expectedOutput: string
  isVisible: boolean
  pointValue: number
  timeLimitSeconds?: number
}

interface FormErrors {
  title?: string
  description?: string
  difficulty?: string
  tags?: string
  testCases?: string
}

interface StylePolicyForm {
  enabled?: boolean
  profile?: string
  disabledRules?: string[]
  weightPercent?: number
  penaltyPerViolation?: number
  maxViolations?: number
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

function parseStylePolicy(value: unknown): StylePolicyForm {
  if (!value) {
    return {
      enabled: true,
      profile: 'uet-oop-basic',
      disabledRules: DEFAULT_STYLE_DISABLED_RULES,
      weightPercent: 10,
      penaltyPerViolation: 5,
      maxViolations: 20,
    }
  }

  const raw = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value)
        } catch {
          return {}
        }
      })()
    : value
  const policy = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    enabled: policy.enabled === undefined ? true : Boolean(policy.enabled),
    profile: typeof policy.profile === 'string' ? policy.profile : 'uet-oop-basic',
    disabledRules: Array.isArray(policy.disabledRules)
      ? policy.disabledRules.map(String)
      : Array.isArray(policy.disabled_rules)
        ? policy.disabled_rules.map(String)
        : DEFAULT_STYLE_DISABLED_RULES,
    weightPercent: Number(policy.weightPercent ?? policy.weight_percent ?? 10),
    penaltyPerViolation: Number(policy.penaltyPerViolation ?? policy.penalty_per_violation ?? 5),
    maxViolations: Number(policy.maxViolations ?? policy.max_penalized_violations ?? 20),
  }
}

const TEMPLATE_FORMAT = 'uet-oasis-oop-exercise-template'

interface ExerciseTemplateFile {
  format?: string
  version?: number
  title?: string
  description?: string
  difficulty?: Difficulty
  oop_tags?: string[]
  starter_code?: string
  is_library?: boolean
  style_check_enabled?: boolean
  style_policy?: StylePolicyForm
  test_cases?: Array<{
    input_data?: string
    expected_output?: string
    is_visible?: boolean
    point_value?: number
    time_limit_seconds?: number
  }>
}

const SAMPLE_TEMPLATE: ExerciseTemplateFile & { authoring_notes: string[] } = {
  format: TEMPLATE_FORMAT,
  version: 1,
  title: 'Student Management',
  description:
    'Viết lớp Student và StudentManagement. Mô tả rõ các lớp, thuộc tính, constructor, getter/setter và các hành vi cần kiểm tra.',
  difficulty: 'medium',
  oop_tags: ['classes and objects', 'encapsulation'],
  is_library: true,
  style_check_enabled: true,
  style_policy: {
    enabled: true,
    profile: 'uet-oop-basic',
    disabledRules: DEFAULT_STYLE_DISABLED_RULES,
    weightPercent: 10,
    penaltyPerViolation: 5,
    maxViolations: 20,
  },
  starter_code: JSON.stringify(
    {
      format: 'oop-java-files',
      version: 1,
      files: [
        {
          name: 'Student.java',
          content: 'public class Student {\n    // TODO: declare fields, constructor and methods\n}\n',
        },
        {
          name: 'StudentManagement.java',
          content: 'public class StudentManagement {\n    // TODO: manage students\n}\n',
        },
      ],
    },
    null,
    2
  ),
  test_cases: [
    {
      input_data: '__OOP_JAVA_TEST__\nMyTest.java',
      expected_output:
        'import org.junit.Test;\nimport static org.junit.Assert.*;\n\npublic class MyTest {\n    @Test\n    public void testStudentConstructor() {\n        Student s = new Student("Nguyen Van A", "24000001", 3.5);\n        assertEquals("Nguyen Van A", s.getName());\n        assertEquals("24000001", s.getStudentId());\n        assertEquals(3.5, s.getGpa(), 0.001);\n    }\n}\n',
      is_visible: true,
      point_value: 50,
      time_limit_seconds: 3,
    },
    {
      input_data: '__OOP_JAVA_TEST__\nHiddenTest.java',
      expected_output:
        'import org.junit.Test;\nimport static org.junit.Assert.*;\n\npublic class HiddenTest {\n    @Test\n    public void testValidation() {\n        assertThrows(IllegalArgumentException.class, () -> new Student("A", "1", -1.0));\n    }\n}\n',
      is_visible: false,
      point_value: 50,
      time_limit_seconds: 3,
    },
  ],
  authoring_notes: [
    'Có thể export file này rồi gửi cho AI sinh đề/test case theo đúng schema.',
    'Với JUnit, input_data dùng dạng __OOP_JAVA_TEST__ + tên file test; expected_output là toàn bộ nội dung file .java.',
    'is_visible=false là test ẩn; point_value nên cộng lại thành 100.',
  ],
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
  const [styleCheckEnabled, setStyleCheckEnabled] = useState(true)
  const [styleDisabledRules, setStyleDisabledRules] = useState<string[]>(DEFAULT_STYLE_DISABLED_RULES)
  const [styleWeightPercent, setStyleWeightPercent] = useState(10)
  const [stylePenaltyPerViolation, setStylePenaltyPerViolation] = useState(5)
  const [styleMaxViolations, setStyleMaxViolations] = useState(20)
  const [testCases, setTestCases] = useState<TestCaseForm[]>([emptyTestCase()])
  const [templateText, setTemplateText] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
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
      const response = await api.get(`/api/admin/exercises/${exerciseId}`)
      const ex = response.data
      setTitle(ex.title ?? '')
      setDescription(ex.description ?? '')
      setDifficulty((ex.difficulty as Difficulty) ?? 'easy')
      setTagsInput(parseOopTags(ex.oopTags ?? ex.oop_tags).join(', '))
      setStarterCode(ex.starterCode ?? ex.starter_code ?? '')
      setIsLibrary(ex.isLibrary === 1 || ex.isLibrary === true || ex.is_library === true)
      const loadedStylePolicy = parseStylePolicy(ex.stylePolicy ?? ex.style_policy)
      setStyleCheckEnabled(
        ex.styleCheckEnabled === 0 || ex.style_check_enabled === false
          ? false
          : loadedStylePolicy.enabled !== false
      )
      setStyleDisabledRules(loadedStylePolicy.disabledRules ?? DEFAULT_STYLE_DISABLED_RULES)
      setStyleWeightPercent(Number.isFinite(loadedStylePolicy.weightPercent) ? loadedStylePolicy.weightPercent ?? 10 : 10)
      setStylePenaltyPerViolation(
        Number.isFinite(loadedStylePolicy.penaltyPerViolation) ? loadedStylePolicy.penaltyPerViolation ?? 5 : 5
      )
      setStyleMaxViolations(Number.isFinite(loadedStylePolicy.maxViolations) ? loadedStylePolicy.maxViolations ?? 20 : 20)

      const loaded = Array.isArray(ex.testCases) ? ex.testCases : []
      if (loaded.length > 0) {
        setTestCases(
          loaded.map((tc: Record<string, unknown>) => ({
            inputData: (tc.inputData ?? tc.input_data ?? '') as string,
            expectedOutput: (tc.expectedOutput ?? tc.expected_output ?? '') as string,
            isVisible:
              tc.isVisible === 1 || tc.isVisible === true || tc.is_visible === true,
            pointValue: (tc.pointValue ?? tc.point_value ?? 10) as number,
            timeLimitSeconds: (tc.timeLimitSeconds ?? tc.time_limit_seconds) as number | undefined,
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

    const validTestCases = testCases.filter((tc) => tc.expectedOutput.trim() !== '')
    if (validTestCases.length < 1) {
      newErrors.testCases = 'Cần ít nhất 1 bộ test có kết quả mong đợi'
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
    value: string | boolean | number | undefined
  ) {
    setTestCases((prev) => prev.map((tc, i) => (i === index ? { ...tc, [field]: value } : tc)))
  }

  function buildStylePolicy(): StylePolicyForm {
    return {
      enabled: styleCheckEnabled,
      profile: 'uet-oop-basic',
      disabledRules: styleDisabledRules,
      weightPercent: styleWeightPercent,
      penaltyPerViolation: stylePenaltyPerViolation,
      maxViolations: styleMaxViolations,
    }
  }

  function toggleStyleRule(ruleId: string, enabled: boolean) {
    setStyleDisabledRules((prev) => {
      const next = new Set(prev)
      if (enabled) {
        next.delete(ruleId)
      } else {
        next.add(ruleId)
      }
      return [...next]
    })
  }

  function buildTemplateFromForm(): ExerciseTemplateFile {
    return {
      format: TEMPLATE_FORMAT,
      version: 1,
      title: title.trim() || 'Tên bài tập',
      description: description.trim() || 'Mô tả yêu cầu bài tập.',
      difficulty,
      oop_tags: splitTags(tagsInput).length > 0 ? splitTags(tagsInput) : ['classes and objects'],
      starter_code: starterCode,
      is_library: isLibrary,
      style_check_enabled: styleCheckEnabled,
      style_policy: buildStylePolicy(),
      test_cases: testCases.map((tc) => ({
        input_data: tc.inputData,
        expected_output: tc.expectedOutput,
        is_visible: tc.isVisible,
        point_value: tc.pointValue,
        ...(tc.timeLimitSeconds ? { time_limit_seconds: tc.timeLimitSeconds } : {}),
      })),
    }
  }

  function slugify(value: string) {
    return (
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'exercise'
    )
  }

  function downloadJson(fileName: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function normalizeTemplate(raw: ExerciseTemplateFile) {
    const normalizedTitle = String(raw.title ?? '').trim()
    const normalizedDescription = String(raw.description ?? '').trim()
    const normalizedDifficulty = raw.difficulty ?? 'easy'
    const normalizedTags = Array.isArray(raw.oop_tags) ? raw.oop_tags : []
    const normalizedTestCases = Array.isArray(raw.test_cases) ? raw.test_cases : []
    const normalizedStylePolicy = parseStylePolicy(raw.style_policy)

    if (!normalizedTitle) throw new Error('Template thiếu title.')
    if (!normalizedDescription) throw new Error('Template thiếu description.')
    if (!DIFFICULTY_OPTIONS.includes(normalizedDifficulty)) {
      throw new Error('difficulty phải là easy, medium hoặc hard.')
    }
    if (normalizedTags.length < 1 || normalizedTags.length > 5) {
      throw new Error('oop_tags cần từ 1 đến 5 thẻ.')
    }
    if (normalizedTestCases.length < 1 || normalizedTestCases.length > 50) {
      throw new Error('Template cần từ 1 đến 50 test case.')
    }

    return {
      title: normalizedTitle,
      description: normalizedDescription,
      difficulty: normalizedDifficulty,
      tags: normalizedTags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 5),
      starterCode: String(raw.starter_code ?? ''),
      isLibrary: Boolean(raw.is_library ?? true),
      styleCheckEnabled: raw.style_check_enabled === undefined
        ? normalizedStylePolicy.enabled !== false
        : Boolean(raw.style_check_enabled),
      stylePolicy: normalizedStylePolicy,
      testCases: normalizedTestCases.map((tc, index) => {
        const inputData = String(tc.input_data ?? '')
        const expectedOutput = String(tc.expected_output ?? '')
        const pointValue = Number(tc.point_value ?? 10)
        const timeLimit = tc.time_limit_seconds == null ? undefined : Number(tc.time_limit_seconds)

        if (!expectedOutput.trim()) throw new Error(`Test case #${index + 1} thiếu expected_output.`)
        if (!Number.isInteger(pointValue) || pointValue < 1 || pointValue > 100) {
          throw new Error(`point_value của test case #${index + 1} phải từ 1 đến 100.`)
        }
        if (timeLimit !== undefined && (!Number.isInteger(timeLimit) || timeLimit < 1)) {
          throw new Error(`time_limit_seconds của test case #${index + 1} phải là số nguyên dương.`)
        }

        return {
          inputData,
          expectedOutput,
          isVisible: Boolean(tc.is_visible ?? true),
          pointValue,
          ...(timeLimit ? { timeLimitSeconds: timeLimit } : {}),
        }
      }),
    }
  }

  function applyTemplate(raw: unknown) {
    try {
      const normalized = normalizeTemplate(raw as ExerciseTemplateFile)
      setTitle(normalized.title)
      setDescription(normalized.description)
      setDifficulty(normalized.difficulty)
      setTagsInput(normalized.tags.join(', '))
      setStarterCode(normalized.starterCode)
      setIsLibrary(normalized.isLibrary)
      setStyleCheckEnabled(normalized.styleCheckEnabled)
      setStyleDisabledRules(normalized.stylePolicy.disabledRules ?? DEFAULT_STYLE_DISABLED_RULES)
      setStyleWeightPercent(Number.isFinite(normalized.stylePolicy.weightPercent) ? normalized.stylePolicy.weightPercent ?? 10 : 10)
      setStylePenaltyPerViolation(
        Number.isFinite(normalized.stylePolicy.penaltyPerViolation)
          ? normalized.stylePolicy.penaltyPerViolation ?? 5
          : 5
      )
      setStyleMaxViolations(Number.isFinite(normalized.stylePolicy.maxViolations) ? normalized.stylePolicy.maxViolations ?? 20 : 20)
      setTestCases(normalized.testCases)
      setErrors({})
      setTemplateError(null)
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

  async function handleImportTemplateFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const content = await file.text()
      setTemplateText(content)
      setTemplateOpen(true)
      applyTemplate(JSON.parse(content))
    } catch {
      setTemplateError('Không đọc được file template JSON.')
      toast.error('Không đọc được file template JSON.')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!validate()) return

    setSubmitting(true)
    try {
      const tags = splitTags(tagsInput)
      const stylePolicy = buildStylePolicy()

      if (isEditing && id) {
        await api.put(`/api/admin/exercises/${id}`, {
          title: title.trim(),
          description: description.trim(),
          difficulty,
          oop_tags: tags,
          starter_code: starterCode,
          is_library: isLibrary,
          style_check_enabled: styleCheckEnabled,
          style_policy: stylePolicy,
          test_cases: testCases
            .filter((tc) => tc.expectedOutput.trim() !== '')
            .map((tc) => ({
              input_data: tc.inputData,
              expected_output: tc.expectedOutput,
              is_visible: tc.isVisible,
              point_value: tc.pointValue,
              time_limit_seconds: tc.timeLimitSeconds,
            })),
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
          style_check_enabled: styleCheckEnabled,
          style_policy: stylePolicy,
          test_cases: testCases
            .filter((tc) => tc.expectedOutput.trim() !== '')
            .map((tc) => ({
              input_data: tc.inputData,
              expected_output: tc.expectedOutput,
              is_visible: tc.isVisible,
              point_value: tc.pointValue,
              time_limit_seconds: tc.timeLimitSeconds,
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
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-800 text-lg shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span>{isEditing ? 'SỬA BÀI TẬP' : 'TẠO BÀI TẬP'}</span>
        </div>
        <button
          onClick={() => navigate('/admin/exercises')}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-4 py-2.5 rounded-lg transition-all active:scale-[0.97] shadow-sm cursor-pointer"
        >
          ← Quay lại danh sách
        </button>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6 p-6" noValidate>
        <section className="rounded-lg border border-slate-200 bg-slate-50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
                Template ra đề
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Dùng JSON để tự điền form, export bài hiện tại hoặc gửi cho AI sinh đề và test case.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ExerciseAiGenerator
                difficulty={difficulty}
                tags={splitTags(tagsInput)}
                template={buildTemplateFromForm()}
                onApply={applyTemplate}
              />
              <button
                type="button"
                onClick={() => downloadJson('uet-oasis-exercise-template.json', SAMPLE_TEMPLATE)}
                className="btn-secondary btn-sm"
              >
                Tải mẫu JSON
              </button>
              <button
                type="button"
                onClick={() => downloadJson(`${slugify(title || 'exercise')}-template.json`, buildTemplateFromForm())}
                className="btn-secondary btn-sm"
              >
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
                onClick={() => setTemplateOpen((value) => !value)}
                className="btn-ghost btn-sm"
              >
                {templateOpen ? 'Ẩn JSON' : 'Dán JSON'}
              </button>
            </div>
          </div>

          {templateOpen && (
            <div className="space-y-3 p-4">
              <textarea
                value={templateText}
                onChange={(event) => {
                  setTemplateText(event.target.value)
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
                <button
                  type="button"
                  onClick={() => {
                    setTemplateText(JSON.stringify(SAMPLE_TEMPLATE, null, 2))
                    setTemplateOpen(true)
                    setTemplateError(null)
                  }}
                  className="btn-ghost btn-sm"
                >
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
          <ExerciseDescriptionEditor
            value={description}
            onChange={setDescription}
            error={errors.description}
            maxLength={5000}
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

        {/* Style Policy */}
        <section className="rounded-lg border border-slate-200 bg-slate-50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
                Quy tắc lập trình
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Chọn các nhóm lỗi Checkstyle được tính vào điểm quy tắc lập trình của bài này.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={styleCheckEnabled}
                onChange={(event) => setStyleCheckEnabled(event.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              Chấm Checkstyle
            </label>
          </div>

          <div className={`space-y-4 p-4 ${styleCheckEnabled ? '' : 'opacity-60'}`}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Trọng số (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={styleWeightPercent}
                  disabled={!styleCheckEnabled}
                  onChange={(event) => setStyleWeightPercent(Math.max(0, Math.min(50, Number(event.target.value) || 0)))}
                  className="input text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Trừ mỗi lỗi
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={stylePenaltyPerViolation}
                  disabled={!styleCheckEnabled}
                  onChange={(event) => setStylePenaltyPerViolation(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                  className="input text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Số lỗi tối đa
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={styleMaxViolations}
                  disabled={!styleCheckEnabled}
                  onChange={(event) => setStyleMaxViolations(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                  className="input text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {STYLE_RULE_OPTIONS.map((rule) => {
                const checked = !styleDisabledRules.includes(rule.id)
                return (
                  <label
                    key={rule.id}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                    title={rule.help}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!styleCheckEnabled}
                      onChange={(event) => toggleStyleRule(rule.id, event.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span>
                      <span className="block text-sm font-bold text-slate-700">{rule.label}</span>
                      <span className="block text-xs font-medium text-slate-500">{rule.help}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        </section>

        {/* Test Cases */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="label mb-0">
              Bộ test <span className="text-danger-500">*</span>
              <span className="ml-1 font-normal text-gray-400">
                (cần ít nhất 1, có thể nhập bằng template)
              </span>
            </label>
            <button
              type="button"
              onClick={addTestCase}
              disabled={testCases.length >= 50}
              className="btn-ghost btn-sm"
            >
              + Thêm test case
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
                      value={tc.inputData}
                      onChange={(e) => updateTestCase(index, 'inputData', e.target.value)}
                      rows={3}
                      className="input font-mono text-xs"
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
                      value={tc.pointValue}
                      onChange={(e) =>
                        updateTestCase(index, 'pointValue', parseInt(e.target.value) || 1)
                      }
                      className="input w-16 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Giây:</label>
                    <input
                      type="number"
                      min={1}
                      value={tc.timeLimitSeconds ?? ''}
                      onChange={(e) =>
                        updateTestCase(
                          index,
                          'timeLimitSeconds',
                          e.target.value ? parseInt(e.target.value) || undefined : undefined
                        )
                      }
                      className="input w-20 text-xs"
                      placeholder="3"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={tc.isVisible}
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
