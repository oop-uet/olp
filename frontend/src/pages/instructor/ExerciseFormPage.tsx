import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui/LoadingIndicator'

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'] as const
type Difficulty = (typeof DIFFICULTY_OPTIONS)[number]

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
}

interface FormErrors {
  title?: string
  description?: string
  difficulty?: string
  tags?: string
  testCases?: string
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
    { input_data: '', expected_output: '', is_visible: true, point_value: 10 },
  ])

  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

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
            is_visible: tc.is_visible ?? true,
            point_value: tc.point_value || 10,
          }))
        )
      }
    } catch {
      setSubmitError('Failed to load exercise data.')
    } finally {
      setLoading(false)
    }
  }

  function validate(): boolean {
    const newErrors: FormErrors = {}

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    } else if (title.length > 200) {
      newErrors.title = 'Title must be 200 characters or less'
    }

    if (!description.trim()) {
      newErrors.description = 'Description is required'
    } else if (description.length > 5000) {
      newErrors.description = 'Description must be 5000 characters or less'
    }

    if (!difficulty) {
      newErrors.difficulty = 'Difficulty level is required'
    }

    if (selectedTags.length < 1) {
      newErrors.tags = 'At least 1 tag is required'
    } else if (selectedTags.length > 5) {
      newErrors.tags = 'Maximum 5 tags allowed'
    }

    const validTestCases = testCases.filter(
      (tc) => tc.expected_output.trim() !== ''
    )
    if (validTestCases.length < 1) {
      newErrors.testCases = 'At least 1 test case with expected output is required'
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
      { input_data: '', expected_output: '', is_visible: true, point_value: 10 },
    ])
  }

  function removeTestCase(index: number) {
    if (testCases.length <= 1) return
    setTestCases((prev) => prev.filter((_, i) => i !== index))
  }

  function updateTestCase(index: number, field: keyof TestCaseForm, value: string | boolean | number) {
    setTestCases((prev) =>
      prev.map((tc, i) => (i === index ? { ...tc, [field]: value } : tc))
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    if (!validate()) return

    setSubmitting(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        difficulty,
        oop_tags: selectedTags,
        starter_code: starterCode,
        test_cases: testCases.filter((tc) => tc.expected_output.trim() !== ''),
      }

      if (isEditing && id) {
        await api.put(`/api/exercises/${id}`, payload)
      } else {
        await api.post('/api/exercises', payload)
      }

      navigate('/instructor/exercises')
    } catch {
      setSubmitError(
        isEditing
          ? 'Failed to update exercise. Please try again.'
          : 'Failed to create exercise. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <LoadingIndicator label="Loading exercise..." />
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">
          {isEditing ? 'Edit Exercise' : 'Create Exercise'}
        </h1>
        <button
          onClick={() => navigate('/instructor/exercises')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to exercises
        </button>
      </div>

      {submitError && (
        <div
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Title */}
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium text-gray-700">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className={`w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors.title
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-primary focus:ring-primary'
            }`}
            placeholder="Exercise title"
          />
          <div className="mt-1 flex justify-between">
            {errors.title && <p className="text-xs text-red-600">{errors.title}</p>}
            <p className="ml-auto text-xs text-gray-400">{title.length}/200</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={6}
            className={`w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors.description
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-primary focus:ring-primary'
            }`}
            placeholder="Describe the exercise requirements..."
          />
          <div className="mt-1 flex justify-between">
            {errors.description && (
              <p className="text-xs text-red-600">{errors.description}</p>
            )}
            <p className="ml-auto text-xs text-gray-400">{description.length}/5000</p>
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <label htmlFor="difficulty" className="mb-1 block text-sm font-medium text-gray-700">
            Difficulty <span className="text-red-500">*</span>
          </label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className={`w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors.difficulty
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-primary focus:ring-primary'
            }`}
          >
            <option value="">Select difficulty</option>
            {DIFFICULTY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </option>
            ))}
          </select>
          {errors.difficulty && (
            <p className="mt-1 text-xs text-red-600">{errors.difficulty}</p>
          )}
        </div>

        {/* OOP Tags */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            OOP Tags <span className="text-red-500">*</span>
            <span className="ml-1 font-normal text-gray-400">(select 1-5)</span>
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
          {errors.tags && <p className="mt-1 text-xs text-red-600">{errors.tags}</p>}
        </div>

        {/* Starter Code */}
        <div>
          <label htmlFor="starter-code" className="mb-1 block text-sm font-medium text-gray-700">
            Starter Code Template
          </label>
          <textarea
            id="starter-code"
            value={starterCode}
            onChange={(e) => setStarterCode(e.target.value)}
            rows={8}
            className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="// Starter code template for students..."
          />
        </div>

        {/* Test Cases */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              Test Cases <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-gray-400">(at least 1 required)</span>
            </label>
            <button
              type="button"
              onClick={addTestCase}
              disabled={testCases.length >= 50}
              className="text-sm font-medium text-primary hover:text-primary-600 disabled:opacity-50"
            >
              + Add Test Case
            </button>
          </div>

          {errors.testCases && (
            <p className="mb-2 text-xs text-red-600">{errors.testCases}</p>
          )}

          <div className="space-y-4">
            {testCases.map((tc, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">
                    Test Case #{index + 1}
                  </span>
                  {testCases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTestCase(index)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">Input</label>
                    <textarea
                      value={tc.input_data}
                      onChange={(e) => updateTestCase(index, 'input_data', e.target.value)}
                      rows={3}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Test input..."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">
                      Expected Output <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={tc.expected_output}
                      onChange={(e) => updateTestCase(index, 'expected_output', e.target.value)}
                      rows={3}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Expected output..."
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Points:</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={tc.point_value}
                      onChange={(e) =>
                        updateTestCase(index, 'point_value', parseInt(e.target.value) || 1)
                      }
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={tc.is_visible}
                      onChange={(e) => updateTestCase(index, 'is_visible', e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    Visible to students
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 border-t border-gray-200 pt-6">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
          >
            {submitting
              ? isEditing
                ? 'Updating...'
                : 'Creating...'
              : isEditing
                ? 'Update Exercise'
                : 'Create Exercise'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/instructor/exercises')}
            className="rounded border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
