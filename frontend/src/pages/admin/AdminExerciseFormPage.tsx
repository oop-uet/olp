import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { ExerciseDescriptionEditor } from '../../components/exercise/ExerciseDescriptionEditor'
import { ExerciseAiGenerator } from '../../components/exercise/ExerciseAiGenerator'
import {
  DEFAULT_PROJECT_SUBMISSION_REQUIREMENTS,
  extractProjectSubmissionRequirements,
  mergeProjectDescriptionAndRequirements,
  stripProjectSubmissionNotes,
} from '../../utils/projectDescription'

// ─── Constants ───────────────────────────────────────────────────────────────

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
  submission_requirements?: string
  project_submission_requirements?: string
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
  const [projectSubmissionRequirements, setProjectSubmissionRequirements] = useState(DEFAULT_PROJECT_SUBMISSION_REQUIREMENTS)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [exerciseKind, setExerciseKind] = useState<ExerciseKind>('coding')
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
      const response = await api.get(`/api/admin/exercises/${exerciseId}`)
      const ex = response.data
      const loadedTags = parseOopTags(ex.oopTags ?? ex.oop_tags)
      const loadedDescription = String(ex.description ?? '')
      const loadedSubmissionRequirements = extractProjectSubmissionRequirements(loadedDescription)
      setTitle(ex.title ?? '')
      setDescription(stripProjectSubmissionNotes(loadedDescription))
      setProjectSubmissionRequirements(loadedSubmissionRequirements || DEFAULT_PROJECT_SUBMISSION_REQUIREMENTS)
      setDifficulty((ex.difficulty as Difficulty) ?? 'easy')
      setTagsInput(loadedTags.join(', '))
      setExerciseKind(isProjectExerciseDraft(ex.title ?? '', loadedTags) ? 'project' : 'coding')
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
              tc.isVisible === undefined && tc.is_visible === undefined
                ? true
                : tc.isVisible === 1 || tc.isVisible === true || tc.is_visible === 1 || tc.is_visible === true,
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
    } else if (description.length > descriptionMaxLength) {
      newErrors.description = `Mô tả tối đa ${descriptionMaxLength} ký tự`
    }

    if (isProjectExercise && !projectSubmissionRequirements.trim()) {
      newErrors.description = 'Yêu cầu nộp bài là bắt buộc với Bài tập lớn'
    } else if (
      isProjectExercise &&
      mergeProjectDescriptionAndRequirements(description, projectSubmissionRequirements).length > descriptionMaxLength
    ) {
      newErrors.description = `Mô tả và yêu cầu nộp bài tối đa ${descriptionMaxLength} ký tự`
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

    if (!isProjectExercise) {
      const validTestCases = testCases.filter((tc) => tc.expectedOutput.trim() !== '')
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
      setTagsInput((value) => mergeProjectTags(splitTags(value)).join(', '))
      setIsLibrary(true)
      setStyleCheckEnabled(false)
      setDescription((value) => stripProjectSubmissionNotes(value))
      setProjectSubmissionRequirements((value) => value.trim() || DEFAULT_PROJECT_SUBMISSION_REQUIREMENTS)
    } else {
      setTitle((value) => stripProjectTitlePrefix(value))
      setTagsInput((value) => removeProjectTags(splitTags(value)).join(', '))
    }
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
    const tags = isProjectExercise ? mergeProjectTags(splitTags(tagsInput)) : splitTags(tagsInput)
    return {
      format: TEMPLATE_FORMAT,
      version: 1,
      title: isProjectExercise ? ensureProjectTitle(title) : title.trim() || 'Tên bài tập',
      description: description.trim() || 'Mô tả yêu cầu bài tập.',
      ...(isProjectExercise ? { submission_requirements: projectSubmissionRequirements.trim() } : {}),
      difficulty,
      oop_tags: tags.length > 0 ? tags : ['classes and objects'],
      starter_code: isProjectExercise ? '' : starterCode,
      is_library: isLibrary,
      style_check_enabled: isProjectExercise ? false : styleCheckEnabled,
      style_policy: { ...buildStylePolicy(), enabled: isProjectExercise ? false : styleCheckEnabled },
      test_cases: isProjectExercise ? [] : testCases.map((tc) => ({
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
    const normalizedKind: ExerciseKind = isProjectExerciseDraft(normalizedTitle, normalizedTags)
      ? 'project'
      : 'coding'
    const rawSubmissionRequirements =
      typeof raw.submission_requirements === 'string'
        ? raw.submission_requirements
        : typeof raw.project_submission_requirements === 'string'
          ? raw.project_submission_requirements
          : ''
    const normalizedSubmissionRequirements =
      rawSubmissionRequirements.trim() || extractProjectSubmissionRequirements(normalizedDescription)

    if (!normalizedTitle) throw new Error('Template thiếu title.')
    if (!normalizedDescription) throw new Error('Template thiếu description.')
    if (!DIFFICULTY_OPTIONS.includes(normalizedDifficulty)) {
      throw new Error('difficulty phải là easy, medium hoặc hard.')
    }
    if (normalizedTags.length < 1 || normalizedTags.length > 5) {
      throw new Error('oop_tags cần từ 1 đến 5 thẻ.')
    }
    if (normalizedKind === 'coding' && normalizedTestCases.length < 1) {
      throw new Error('Template cần ít nhất 1 test case.')
    }
    if (normalizedTestCases.length > 50) {
      throw new Error('Tối đa 50 test case.')
    }

    return {
      title: normalizedTitle,
      description: normalizedDescription,
      difficulty: normalizedDifficulty,
      tags: normalizedTags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 5),
      starterCode: String(raw.starter_code ?? ''),
      isLibrary: Boolean(raw.is_library ?? true),
      submissionRequirements: normalizedSubmissionRequirements,
      styleCheckEnabled: raw.style_check_enabled === undefined
        ? normalizedStylePolicy.enabled !== false
        : Boolean(raw.style_check_enabled),
      stylePolicy: normalizedStylePolicy,
      exerciseKind: normalizedKind,
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
      setTitle(normalized.exerciseKind === 'project' ? ensureProjectTitle(normalized.title) : normalized.title)
      setDescription(stripProjectSubmissionNotes(normalized.description))
      setProjectSubmissionRequirements(
        normalized.exerciseKind === 'project'
          ? normalized.submissionRequirements || DEFAULT_PROJECT_SUBMISSION_REQUIREMENTS
          : DEFAULT_PROJECT_SUBMISSION_REQUIREMENTS
      )
      setDifficulty(normalized.difficulty)
      setExerciseKind(normalized.exerciseKind)
      setTagsInput(normalized.exerciseKind === 'project' ? mergeProjectTags(normalized.tags).join(', ') : normalized.tags.join(', '))
      setStarterCode(normalized.exerciseKind === 'project' ? '' : normalized.starterCode)
      setIsLibrary(normalized.isLibrary)
      setStyleCheckEnabled(normalized.exerciseKind === 'project' ? false : normalized.styleCheckEnabled)
      setStyleDisabledRules(normalized.stylePolicy.disabledRules ?? DEFAULT_STYLE_DISABLED_RULES)
      setStyleWeightPercent(Number.isFinite(normalized.stylePolicy.weightPercent) ? normalized.stylePolicy.weightPercent ?? 10 : 10)
      setStylePenaltyPerViolation(
        Number.isFinite(normalized.stylePolicy.penaltyPerViolation)
          ? normalized.stylePolicy.penaltyPerViolation ?? 5
          : 5
      )
      setStyleMaxViolations(Number.isFinite(normalized.stylePolicy.maxViolations) ? normalized.stylePolicy.maxViolations ?? 20 : 20)
      setTestCases(normalized.testCases.length > 0 ? normalized.testCases : [emptyTestCase()])
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
      const tags = isProjectExercise ? mergeProjectTags(splitTags(tagsInput)) : splitTags(tagsInput)
      const payloadTitle = isProjectExercise ? ensureProjectTitle(title) : title.trim()
      const stylePolicy = {
        ...buildStylePolicy(),
        enabled: isProjectExercise ? false : styleCheckEnabled,
      }
      const payloadTestCases = isProjectExercise
        ? []
        : testCases
          .filter((tc) => tc.expectedOutput.trim() !== '')
          .map((tc) => ({
            input_data: tc.inputData,
            expected_output: tc.expectedOutput,
            is_visible: tc.isVisible,
            point_value: tc.pointValue,
            time_limit_seconds: tc.timeLimitSeconds,
          }))
      const payloadDescription = isProjectExercise
        ? mergeProjectDescriptionAndRequirements(description, projectSubmissionRequirements)
        : description.trim()

      if (isEditing && id) {
        await api.put(`/api/admin/exercises/${id}`, {
          title: payloadTitle,
          description: payloadDescription,
          difficulty,
          oop_tags: tags,
          starter_code: isProjectExercise ? '' : starterCode,
          is_library: isLibrary,
          style_check_enabled: isProjectExercise ? false : styleCheckEnabled,
          style_policy: stylePolicy,
          test_cases: payloadTestCases,
        })
        toast.success(isProjectExercise ? 'Đã cập nhật bài tập lớn.' : 'Đã cập nhật bài tập.')
      } else {
        await api.post('/api/admin/exercises', {
          title: payloadTitle,
          description: payloadDescription,
          difficulty,
          oop_tags: tags,
          starter_code: isProjectExercise ? '' : starterCode || undefined,
          is_library: isLibrary,
          style_check_enabled: isProjectExercise ? false : styleCheckEnabled,
          style_policy: stylePolicy,
          test_cases: payloadTestCases,
        })
        toast.success(isProjectExercise ? 'Đã tạo bài tập lớn.' : 'Đã tạo bài tập.')
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
    <div className="mx-auto max-w-[1680px] space-y-5 px-2 pb-8 animate-fade-in sm:px-4">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isEditing ? 'Sửa bài tập' : 'Tạo bài tập'}
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Soạn nội dung, cấu hình chấm điểm và quản lý bài trong thư viện hệ thống.
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/exercises')}
          className="btn-ghost btn-sm"
        >
          ← Quay lại danh sách
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="card grid grid-cols-1 items-start gap-6 p-4 lg:p-6 xl:grid-cols-12"
        noValidate
      >
        {/* Top Section: Template & Exercise Kind */}
        <div className="grid grid-cols-1 gap-5 items-stretch xl:col-span-12 xl:grid-cols-12">
          {/* Template Ra Đề */}
          <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm xl:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Template ra đề</h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  JSON template dùng để tải mẫu, xuất bài hiện tại hoặc nhập nội dung do AI tạo.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ExerciseAiGenerator
                  difficulty={difficulty || 'easy'}
                  tags={splitTags(tagsInput)}
                  template={buildTemplateFromForm()}
                  onApply={applyTemplate}
                />
                <button
                  type="button"
                  onClick={() => downloadJson('uet-oasis-exercise-template.json', SAMPLE_TEMPLATE)}
                  className="btn-secondary btn-sm h-8 text-xs font-semibold"
                >
                  Tải mẫu JSON
                </button>
                <button
                  type="button"
                  onClick={() => downloadJson(`${slugify(title || 'exercise')}-template.json`, buildTemplateFromForm())}
                  className="btn-secondary btn-sm h-8 text-xs font-semibold"
                >
                  Xuất bài hiện tại
                </button>
                <label className="btn-secondary btn-sm h-8 text-xs font-semibold cursor-pointer">
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
                  className="btn-ghost btn-sm h-8 text-xs font-semibold"
                >
                  {templateOpen ? 'Ẩn JSON' : 'Dán JSON'}
                </button>
              </div>
            </div>

            {templateOpen && (
              <div className="space-y-3 p-4 bg-white border-t border-slate-200">
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

          {/* Loại Bài Tập */}
          <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm xl:col-span-5">
            <div className="border-b border-slate-200 bg-white px-4 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Loại bài tập</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Bài tập lập trình tự động chấm hoặc bài tập lớn nộp nhóm.
              </p>
            </div>
            <div className="p-4 space-y-3 flex-1 flex flex-col justify-center">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleExerciseKindChange('coding')}
                  className={`rounded-xl border p-3.5 text-left transition-all ${
                    exerciseKind === 'coding'
                      ? 'border-primary bg-primary-50 text-primary-800 ring-1 ring-primary shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-primary-200'
                  }`}
                >
                  <span className="block text-sm font-bold">💻 Bài tập lập trình</span>
                  <span className="mt-1 block text-xs text-slate-500">Tự động chấm bằng Executor</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExerciseKindChange('project')}
                  className={`rounded-xl border p-3.5 text-left transition-all ${
                    exerciseKind === 'project'
                      ? 'border-primary bg-primary-50 text-primary-800 ring-1 ring-primary shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-primary-200'
                  }`}
                >
                  <span className="block text-sm font-bold">👥 Bài tập lớn</span>
                  <span className="mt-1 block text-xs text-slate-500">Nộp nhóm & Repos GitHub</span>
                </button>
              </div>
              {isProjectExercise && (
                <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3.5 text-xs text-sky-950 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-sky-850">
                    <span>💡 Lưu ý cho Bài tập lớn</span>
                  </div>
                  <p className="font-semibold leading-relaxed">
                    • Bài tập lớn không dùng starter code, Checkstyle hoặc test case tự động. Nội dung chi tiết nên đặt trong phần Mô tả.
                  </p>
                  <p className="font-semibold leading-relaxed">
                    • Sinh viên sẽ tự lập nhóm, khai báo thành viên và nộp link GitHub trực tiếp.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Title & Difficulty Row */}
        <div className="grid grid-cols-1 gap-5 items-start xl:col-span-12 xl:grid-cols-12">
          <div className="xl:col-span-9">
            <label htmlFor="title" className="label text-slate-800 font-bold">
              Tiêu đề bài tập <span className="text-danger-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className={`input h-11 text-sm ${errors.title ? 'input-error' : ''}`}
              placeholder="Nhập tiêu đề bài tập (VD: Tuần 1 - Hello World)"
            />
            <div className="mt-1 flex justify-between">
              {errors.title && <p className="text-xs text-danger-600 font-semibold">{errors.title}</p>}
              <p className="ml-auto text-xs text-gray-400 font-medium">{title.length}/200</p>
            </div>
          </div>

          <div className="xl:col-span-3">
            <label htmlFor="difficulty" className="label text-slate-800 font-bold">
              Độ khó <span className="text-danger-500">*</span>
            </label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className={`input h-11 text-sm font-semibold text-slate-700 ${errors.difficulty ? 'input-error' : ''}`}
            >
              {DIFFICULTY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {DIFFICULTY_LABELS[opt]}
                </option>
              ))}
            </select>
            {errors.difficulty && <p className="mt-1 text-xs text-danger-600 font-semibold">{errors.difficulty}</p>}
          </div>
        </div>

        {/* Description */}
        <div className="xl:col-span-12">
          <label htmlFor="description" className="label text-slate-800 font-bold">
            Mô tả đề bài <span className="text-danger-500">*</span>
          </label>
          <ExerciseDescriptionEditor
            value={description}
            onChange={setDescription}
            error={errors.description}
            maxLength={descriptionMaxLength}
          />
          <div className="mt-1 flex justify-between">
            {errors.description && <p className="text-xs text-danger-600 font-semibold">{errors.description}</p>}
            <p className="ml-auto text-xs text-gray-400 font-medium">{description.length}/{descriptionMaxLength}</p>
          </div>
        </div>

        {isProjectExercise && (
          <div className="xl:col-span-12">
            <label htmlFor="project-submission-requirements" className="label text-slate-800 font-bold">
              Yêu cầu nộp bài tập lớn <span className="text-danger-500">*</span>
            </label>
            <textarea
              id="project-submission-requirements"
              value={projectSubmissionRequirements}
              onChange={(event) => setProjectSubmissionRequirements(event.target.value)}
              rows={5}
              className="input font-mono text-sm leading-6"
              placeholder={DEFAULT_PROJECT_SUBMISSION_REQUIREMENTS}
            />
            <p className="mt-1 text-xs font-medium text-slate-500">
              Dùng cặp dấu `...` để nhấn mạnh tài khoản, thư mục hoặc file, ví dụ `oasis-uet`, `.idea`, `target`, `out`.
            </p>
          </div>
        )}

        {/* OOP Tags & Is Library Row */}
        <div className="grid grid-cols-1 gap-5 items-end xl:col-span-12 xl:grid-cols-12">
          <div className="xl:col-span-9">
            <label htmlFor="oop-tags" className="label text-slate-800 font-bold">
              Thẻ OOP <span className="text-danger-500">*</span>
              <span className="ml-1 font-normal text-slate-500">(phân tách bằng dấu phẩy, 1-5 thẻ)</span>
            </label>
            <input
              id="oop-tags"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className={`input h-11 text-sm ${errors.tags ? 'input-error' : ''}`}
              placeholder="inheritance, polymorphism, abstraction"
            />
            {errors.tags && <p className="mt-1 text-xs text-danger-600 font-semibold">{errors.tags}</p>}
          </div>

          <div className="xl:col-span-3">
            <label className="flex h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-4 text-xs font-bold text-slate-700 cursor-pointer hover:border-slate-300">
              <input
                type="checkbox"
                checked={isLibrary}
                onChange={(e) => setIsLibrary(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Thêm vào thư viện bài tập
            </label>
          </div>
        </div>

        {/* Coding Exercise Sections: Starter Code & Checkstyle Rules */}
        {!isProjectExercise && (
          <div className="grid grid-cols-1 gap-5 items-stretch xl:col-span-12 xl:grid-cols-12">
            {/* Starter Code */}
            <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm xl:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
                    Mã khởi tạo (Starter Code)
                  </h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    Mã mẫu Java cung cấp sẵn cho sinh viên khi bắt đầu làm bài.
                  </p>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <textarea
                  id="starter-code"
                  value={starterCode}
                  onChange={(e) => setStarterCode(e.target.value)}
                  className="input flex-1 min-h-[300px] font-mono text-xs leading-6"
                  placeholder="// Mã khởi tạo cho sinh viên (VD: public class Main { ... })"
                />
              </div>
            </section>

            {/* Checkstyle Rules */}
            <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm xl:col-span-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
                    Quy tắc lập trình (Checkstyle)
                  </h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    Chọn các nhóm lỗi Checkstyle được tính vào điểm quy tắc.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={styleCheckEnabled}
                    onChange={(event) => setStyleCheckEnabled(event.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  Chấm Checkstyle
                </label>
              </div>

              <div className={`flex-1 space-y-4 p-4 ${styleCheckEnabled ? '' : 'opacity-60 pointer-events-none'}`}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Trọng số (%)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={styleWeightPercent}
                      disabled={!styleCheckEnabled}
                      onChange={(event) => setStyleWeightPercent(Math.max(0, Math.min(50, Number(event.target.value) || 0)))}
                      className="input h-9 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Trừ mỗi lỗi
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={stylePenaltyPerViolation}
                      disabled={!styleCheckEnabled}
                      onChange={(event) => setStylePenaltyPerViolation(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                      className="input h-9 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Lỗi tối đa
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={styleMaxViolations}
                      disabled={!styleCheckEnabled}
                      onChange={(event) => setStyleMaxViolations(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                      className="input h-9 text-xs"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {STYLE_RULE_OPTIONS.map((rule) => {
                    const checked = !styleDisabledRules.includes(rule.id)
                    return (
                      <label
                        key={rule.id}
                        className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-slate-300 cursor-pointer"
                        title={rule.help}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!styleCheckEnabled}
                          onChange={(event) => toggleStyleRule(rule.id, event.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="truncate">{rule.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Test Cases Section */}
        {!isProjectExercise && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm xl:col-span-12">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
                  Bộ test case chấm điểm <span className="text-danger-500">*</span>
                </h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  Cung cấp các bộ test tự động để chấm điểm bài nộp của sinh viên.
                </p>
              </div>
              <button
                type="button"
                onClick={addTestCase}
                disabled={testCases.length >= 50}
                className="btn-primary btn-sm h-8 px-3.5 text-xs font-bold"
              >
                + Thêm bộ test
              </button>
            </div>

            <div className="p-4 space-y-4">
              {errors.testCases && <p className="text-xs font-semibold text-danger-600">{errors.testCases}</p>}

              {testCases.map((tc, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-600">
                        {index + 1}
                      </span>
                      Bộ test #{index + 1}
                    </span>
                    {testCases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTestCase(index)}
                        className="text-xs font-bold text-danger-600 hover:text-danger-700 hover:underline"
                      >
                        Xóa bộ test
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">Đầu vào (Input)</label>
                      <textarea
                        value={tc.inputData}
                        onChange={(e) => updateTestCase(index, 'inputData', e.target.value)}
                        rows={3}
                        className="input font-mono text-xs leading-5"
                        placeholder="Dữ liệu đầu vào..."
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">
                        Kết quả mong đợi (Expected Output) {!isEditing && <span className="text-danger-500">*</span>}
                      </label>
                      <textarea
                        value={tc.expectedOutput}
                        onChange={(e) => updateTestCase(index, 'expectedOutput', e.target.value)}
                        rows={3}
                        className="input font-mono text-xs leading-5"
                        placeholder="Kết quả mong đợi..."
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-600">Điểm:</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={tc.pointValue}
                        onChange={(e) => updateTestCase(index, 'pointValue', parseInt(e.target.value) || 1)}
                        className="input h-8 w-20 text-xs text-center font-bold"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-600">Thời hạn (Giây):</label>
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
                        className="input h-8 w-28 text-xs text-center"
                        placeholder="3"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
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
          </section>
        )}

        {/* Submit Action Bar */}
        <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-5 py-3.5 shadow-xl backdrop-blur xl:col-span-12">
          <p className="text-xs font-medium text-slate-500 hidden sm:block">
            Nhấn <strong className="text-slate-700">{isEditing ? 'Cập nhật' : 'Tạo'}</strong> để lưu lại các thay đổi của bài tập.
          </p>
          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={() => navigate('/admin/exercises')}
              className="btn-secondary btn-md"
            >
              Hủy
            </button>
            <button type="submit" disabled={submitting} className="btn-primary btn-md px-6">
              {submitting
                ? isEditing
                  ? 'Đang cập nhật...'
                  : 'Đang tạo...'
                : isEditing
                  ? 'Cập nhật bài tập'
                  : 'Tạo bài tập'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
