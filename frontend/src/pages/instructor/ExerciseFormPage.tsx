import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { ExerciseDescriptionEditor } from '../../components/exercise/ExerciseDescriptionEditor'
import { ExerciseAiGenerator } from '../../components/exercise/ExerciseAiGenerator'

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'] as const
type Difficulty = (typeof DIFFICULTY_OPTIONS)[number]
type ExerciseKind = 'coding' | 'project'

const REGULAR_DESCRIPTION_MAX_LENGTH = 5000
const PROJECT_DESCRIPTION_MAX_LENGTH = 12000
const PROJECT_TAGS = ['project', 'oop-design', 'teamwork']

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
  'project',
  'oop-design',
  'teamwork',
]

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
  is_library?: boolean
  test_cases?: Partial<TestCaseForm>[]
  exercise?: {
    title?: string
    description?: string
    difficulty?: Difficulty
    oop_tags?: string[]
    starter_code?: string
    is_library?: boolean
  }
  style_check_enabled?: boolean
  style_policy?: StylePolicyForm
}

const TEMPLATE_FORMAT = 'uet-oasis-oop-exercise-template'

interface StylePolicyForm {
  enabled?: boolean
  profile?: string
  disabledRules?: string[]
  weightPercent?: number
  penaltyPerViolation?: number
  maxViolations?: number
}

export const EMPTY_TEST_CASE: TestCaseForm = {
  input_data: '',
  expected_output: '',
  is_visible: true,
  point_value: 10,
}

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

function normalizeProjectMarker(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isProjectExerciseDraft(title: string, tags: string[]): boolean {
  const normalizedTitle = normalizeProjectMarker(title)
  if (
    normalizedTitle.includes('bai tap lon') ||
    normalizedTitle.includes('btl') ||
    normalizedTitle.includes('project')
  ) {
    return true
  }

  return tags.some((tag) => {
    const normalizedTag = normalizeProjectMarker(tag)
    return normalizedTag === 'project' || normalizedTag === 'btl' || normalizedTag === 'bai tap lon'
  })
}

function ensureProjectTitle(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'Bài tập lớn - Tên đề tài'
  return isProjectExerciseDraft(trimmed, []) ? trimmed : `Bài tập lớn - ${trimmed}`
}

function stripProjectTitlePrefix(value: string): string {
  const stripped = value
    .replace(/^\s*(bài tập lớn|btl|project)\s*[-:]\s*/i, '')
    .trim()
  return stripped || value
}

function mergeProjectTags(tags: string[]): string[] {
  const merged = [...PROJECT_TAGS, ...tags]
    .map((tag) => tag.trim())
    .filter(Boolean)
  return Array.from(new Set(merged)).slice(0, 5)
}

function removeProjectTags(tags: string[]): string[] {
  return tags.filter((tag) => {
    const normalizedTag = normalizeProjectMarker(tag)
    return normalizedTag !== 'project' && normalizedTag !== 'btl' && normalizedTag !== 'bai tap lon'
  })
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
  is_library: false,
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

export function ExerciseFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('')
  const [exerciseKind, setExerciseKind] = useState<ExerciseKind>('coding')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [starterCode, setStarterCode] = useState('')
  const [styleCheckEnabled, setStyleCheckEnabled] = useState(true)
  const [styleDisabledRules, setStyleDisabledRules] = useState<string[]>(DEFAULT_STYLE_DISABLED_RULES)
  const [styleWeightPercent, setStyleWeightPercent] = useState(10)
  const [stylePenaltyPerViolation, setStylePenaltyPerViolation] = useState(5)
  const [styleMaxViolations, setStyleMaxViolations] = useState(20)
  const [testCases, setTestCases] = useState<TestCaseForm[]>([
    EMPTY_TEST_CASE,
  ])
  const [templateText, setTemplateText] = useState('')
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const isProjectExercise = exerciseKind === 'project'
  const descriptionMaxLength = isProjectExercise ? PROJECT_DESCRIPTION_MAX_LENGTH : REGULAR_DESCRIPTION_MAX_LENGTH

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
      const loadedTags = parseOopTags(ex.oopTags ?? ex.oop_tags)
      setTitle(ex.title)
      setDescription(ex.description)
      setDifficulty(ex.difficulty)
      setSelectedTags(loadedTags)
      setExerciseKind(isProjectExerciseDraft(ex.title ?? '', loadedTags) ? 'project' : 'coding')
      setStarterCode(ex.starterCode ?? ex.starter_code ?? '')
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

      const loadedTestCases = testCasesRes.data
      if (loadedTestCases.length > 0) {
        setTestCases(
          loadedTestCases.map((tc: Record<string, unknown>) => ({
            input_data: String(tc.inputData ?? tc.input_data ?? ''),
            expected_output: String(tc.expectedOutput ?? tc.expected_output ?? ''),
            is_visible: tc.isVisible === undefined && tc.is_visible === undefined
              ? true
              : tc.isVisible === 1 || tc.isVisible === true || tc.is_visible === 1 || tc.is_visible === true,
            point_value: Number(tc.pointValue ?? tc.point_value ?? 10),
            time_limit_seconds: (tc.timeLimitSeconds ?? tc.time_limit_seconds) as number | undefined,
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
    } else if (description.length > descriptionMaxLength) {
      newErrors.description = `Mô tả tối đa ${descriptionMaxLength} ký tự`
    }

    if (!difficulty) {
      newErrors.difficulty = 'Độ khó là bắt buộc'
    }

    if (selectedTags.length < 1) {
      newErrors.tags = 'Cần ít nhất 1 thẻ'
    } else if (selectedTags.length > 5) {
      newErrors.tags = 'Tối đa 5 thẻ'
    }

    if (!isProjectExercise) {
      const validTestCases = testCases.filter((tc) => tc.expected_output.trim() !== '')
      if (validTestCases.length < 1) {
        newErrors.testCases = 'Cần ít nhất 1 bộ test có kết quả mong đợi'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleExerciseKindChange(kind: ExerciseKind) {
    setExerciseKind(kind)
    setErrors({})

    if (kind === 'project') {
      setTitle((value) => ensureProjectTitle(value))
      setDifficulty('hard')
      setSelectedTags((tags) => mergeProjectTags(tags))
      setStyleCheckEnabled(false)
    } else {
      setTitle((value) => stripProjectTitlePrefix(value))
      setSelectedTags((tags) => removeProjectTags(tags))
    }
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
    const projectTags = isProjectExercise ? mergeProjectTags(selectedTags) : selectedTags
    return {
      format: TEMPLATE_FORMAT,
      version: 1,
      title: isProjectExercise ? ensureProjectTitle(title) : title.trim() || 'Tên bài tập',
      description: description.trim() || 'Mô tả yêu cầu bài tập.',
      difficulty: difficulty || 'easy',
      oop_tags: projectTags.length > 0 ? projectTags : ['classes and objects'],
      starter_code: isProjectExercise ? '' : starterCode,
      is_library: false,
      style_check_enabled: isProjectExercise ? false : styleCheckEnabled,
      style_policy: { ...buildStylePolicy(), enabled: isProjectExercise ? false : styleCheckEnabled },
      test_cases: isProjectExercise ? [] : testCases.map((tc) => ({
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
    is_library: boolean
    style_check_enabled: boolean
    style_policy: StylePolicyForm
    test_cases: TestCaseForm[]
    exercise_kind: ExerciseKind
  } {
    const exercise = raw.exercise ?? {}
    const normalizedTitle = raw.title ?? exercise.title ?? ''
    const normalizedDescription = raw.description ?? exercise.description ?? ''
    const normalizedDifficulty = raw.difficulty ?? exercise.difficulty
    const normalizedTags = parseOopTags(raw.oop_tags ?? exercise.oop_tags ?? [])
    const normalizedStarterCode = raw.starter_code ?? exercise.starter_code ?? ''
    const normalizedIsLibrary = raw.is_library ?? exercise.is_library ?? false
    const normalizedTestCases = Array.isArray(raw.test_cases) ? raw.test_cases : []
    const normalizedStylePolicy = parseStylePolicy(raw.style_policy)
    const normalizedKind: ExerciseKind = isProjectExerciseDraft(normalizedTitle, normalizedTags)
      ? 'project'
      : 'coding'

    if (!normalizedTitle.trim()) throw new Error('Template thiếu title.')
    if (!normalizedDescription.trim()) throw new Error('Template thiếu description.')
    if (!normalizedDifficulty || !DIFFICULTY_OPTIONS.includes(normalizedDifficulty)) {
      throw new Error('difficulty phải là easy, medium hoặc hard.')
    }
    if (!Array.isArray(normalizedTags) || normalizedTags.length < 1 || normalizedTags.length > 5) {
      throw new Error('oop_tags cần từ 1 đến 5 thẻ.')
    }
    if (normalizedKind === 'coding' && normalizedTestCases.length < 1) {
      throw new Error('Template cần ít nhất 1 test case.')
    }
    if (normalizedTestCases.length > 50) throw new Error('Tối đa 50 test case.')

    const mappedTestCases = normalizedTestCases.map((tc, index) => {
      const pointValue = Number(tc.point_value ?? 10)
      const timeLimit = tc.time_limit_seconds == null ? undefined : Number(tc.time_limit_seconds)
      const inputData = String(tc.input_data ?? '')
      const expectedOutput = String(tc.expected_output ?? '')

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
      is_library: Boolean(normalizedIsLibrary),
      style_check_enabled: raw.style_check_enabled === undefined
        ? normalizedStylePolicy.enabled !== false
        : Boolean(raw.style_check_enabled),
      style_policy: normalizedStylePolicy,
      test_cases: mappedTestCases,
      exercise_kind: normalizedKind,
    }
  }

  function applyTemplate(raw: unknown) {
    try {
      const normalized = normalizeTemplate(raw as ExerciseTemplateFile)
      setTitle(normalized.exercise_kind === 'project' ? ensureProjectTitle(normalized.title) : normalized.title)
      setDescription(normalized.description)
      setDifficulty(normalized.difficulty)
      setExerciseKind(normalized.exercise_kind)
      setSelectedTags(normalized.exercise_kind === 'project' ? mergeProjectTags(normalized.oop_tags) : normalized.oop_tags)
      setStarterCode(normalized.exercise_kind === 'project' ? '' : normalized.starter_code)
      setStyleCheckEnabled(normalized.exercise_kind === 'project' ? false : normalized.style_check_enabled)
      setStyleDisabledRules(normalized.style_policy.disabledRules ?? DEFAULT_STYLE_DISABLED_RULES)
      setStyleWeightPercent(Number.isFinite(normalized.style_policy.weightPercent) ? normalized.style_policy.weightPercent ?? 10 : 10)
      setStylePenaltyPerViolation(
        Number.isFinite(normalized.style_policy.penaltyPerViolation)
          ? normalized.style_policy.penaltyPerViolation ?? 5
          : 5
      )
      setStyleMaxViolations(Number.isFinite(normalized.style_policy.maxViolations) ? normalized.style_policy.maxViolations ?? 20 : 20)
      setTestCases(normalized.test_cases.length > 0 ? normalized.test_cases : [EMPTY_TEST_CASE])
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
      const payloadTitle = isProjectExercise ? ensureProjectTitle(title) : title.trim()
      const payloadTags = isProjectExercise ? mergeProjectTags(selectedTags) : selectedTags
      const payloadStylePolicy = {
        ...buildStylePolicy(),
        enabled: isProjectExercise ? false : styleCheckEnabled,
      }
      const payload = {
        title: payloadTitle,
        description: description.trim(),
        difficulty,
        oop_tags: payloadTags,
        starter_code: isProjectExercise ? '' : starterCode,
        style_check_enabled: isProjectExercise ? false : styleCheckEnabled,
        style_policy: payloadStylePolicy,
        test_cases: isProjectExercise ? [] : testCases.filter((tc) => tc.expected_output.trim() !== ''),
      }

      if (isEditing && id) {
        await api.put(`/api/exercises/${id}`, payload)
        toast.success(isProjectExercise ? 'Đã cập nhật bài tập lớn.' : 'Đã cập nhật bài tập.')
      } else {
        await api.post('/api/exercises', payload)
        toast.success(isProjectExercise ? 'Đã tạo bài tập lớn.' : 'Đã tạo bài tập.')
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
              <ExerciseAiGenerator
                difficulty={difficulty || 'easy'}
                tags={selectedTags}
                template={buildTemplateFromForm()}
                onApply={applyTemplate}
              />
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

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="label">Loại bài tập</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleExerciseKindChange('coding')}
              className={`rounded-lg border p-4 text-left transition-colors ${
                exerciseKind === 'coding'
                  ? 'border-primary bg-primary-50 text-primary-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-primary-200'
              }`}
            >
              <span className="block text-sm font-bold">Bài tập lập trình</span>
              <span className="mt-1 block text-xs font-medium text-slate-500">
                Có editor, mã khởi tạo, Checkstyle và bộ test tự động.
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleExerciseKindChange('project')}
              className={`rounded-lg border p-4 text-left transition-colors ${
                exerciseKind === 'project'
                  ? 'border-primary bg-primary-50 text-primary-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-primary-200'
              }`}
            >
              <span className="block text-sm font-bold">Bài tập lớn</span>
              <span className="mt-1 block text-xs font-medium text-slate-500">
                Sinh viên lập nhóm, nhập thành viên và nộp URL GitHub.
              </span>
            </button>
          </div>
          {isProjectExercise && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Bài tập lớn không dùng starter code, Checkstyle hoặc test case trên executor. Nội dung chi tiết nên đặt trong mô tả và có thể chèn ảnh/biểu đồ lớp.
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
            maxLength={descriptionMaxLength}
          />
          <div className="mt-1 flex justify-between">
            {errors.description && <p className="text-xs text-danger-600">{errors.description}</p>}
            <p className="ml-auto text-xs text-gray-400">{description.length}/{descriptionMaxLength}</p>
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

        {isProjectExercise ? (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-900">
              Luồng nộp bài tập lớn
            </h2>
            <p className="mt-2 text-sm font-medium text-emerald-800">
              Sau khi giao bài cho lớp, sinh viên sẽ thấy trang Bài tập lớn riêng để thêm thành viên nhóm,
              nhập tên nhóm và nộp URL GitHub. Giảng viên có thể theo dõi danh sách nhóm, thống kê, lịch sử
              và thảo luận ở trang chi tiết BTL.
            </p>
          </section>
        ) : (
          <>
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
          </>
        )}

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
