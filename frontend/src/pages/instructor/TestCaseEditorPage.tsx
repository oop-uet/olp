import { useState, useEffect, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui/LoadingIndicator'

const MAX_FIELD_LENGTH = 10240 // 10KB
const MAX_TEST_CASES = 50
const MIN_POINTS = 1
const MAX_POINTS = 100

interface TestCase {
  id: string
  exercise_id: string
  input_data: string
  expected_output: string
  is_visible: boolean
  point_value: number
  created_at: string
}

interface TestCaseFormData {
  input_data: string
  expected_output: string
  is_visible: boolean
  point_value: number
}

interface FormErrors {
  input_data?: string
  expected_output?: string
  point_value?: string
  general?: string
}

const emptyForm: TestCaseFormData = {
  input_data: '',
  expected_output: '',
  is_visible: true,
  point_value: 10,
}

export function TestCaseEditorPage() {
  const { id: exerciseId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState<TestCaseFormData>(emptyForm)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (exerciseId) {
      fetchTestCases()
    }
  }, [exerciseId])

  async function fetchTestCases() {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get(`/api/exercises/${exerciseId}/testcases`)
      setTestCases(response.data)
    } catch {
      setError('Failed to load test cases. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function validateForm(data: TestCaseFormData): FormErrors {
    const errors: FormErrors = {}

    if (data.input_data.length > MAX_FIELD_LENGTH) {
      errors.input_data = `Input data must be ${MAX_FIELD_LENGTH} characters or less (10KB)`
    }

    if (!data.expected_output.trim()) {
      errors.expected_output = 'Expected output is required'
    } else if (data.expected_output.length > MAX_FIELD_LENGTH) {
      errors.expected_output = `Expected output must be ${MAX_FIELD_LENGTH} characters or less (10KB)`
    }

    if (
      !Number.isInteger(data.point_value) ||
      data.point_value < MIN_POINTS ||
      data.point_value > MAX_POINTS
    ) {
      errors.point_value = `Point value must be an integer between ${MIN_POINTS} and ${MAX_POINTS}`
    }

    // Check max test cases limit (only when creating new)
    if (!editingId && testCases.length >= MAX_TEST_CASES) {
      errors.general = `Maximum of ${MAX_TEST_CASES} test cases per exercise reached`
    }

    return errors
  }

  function handleEdit(testCase: TestCase) {
    setEditingId(testCase.id)
    setFormData({
      input_data: testCase.input_data,
      expected_output: testCase.expected_output,
      is_visible: testCase.is_visible,
      point_value: testCase.point_value,
    })
    setFormErrors({})
    setShowForm(true)
  }

  function handleCancelForm() {
    setEditingId(null)
    setFormData(emptyForm)
    setFormErrors({})
    setShowForm(false)
  }

  function handleNewTestCase() {
    if (testCases.length >= MAX_TEST_CASES) {
      setError(`Maximum of ${MAX_TEST_CASES} test cases per exercise reached.`)
      return
    }
    setEditingId(null)
    setFormData(emptyForm)
    setFormErrors({})
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const errors = validateForm(formData)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setSubmitting(true)
    setFormErrors({})

    try {
      if (editingId) {
        // Update existing test case
        const response = await api.put(`/api/testcases/${editingId}`, formData)
        setTestCases((prev) =>
          prev.map((tc) => (tc.id === editingId ? { ...tc, ...response.data } : tc))
        )
      } else {
        // Create new test case
        const response = await api.post(
          `/api/exercises/${exerciseId}/testcases`,
          formData
        )
        setTestCases((prev) => [...prev, response.data])
      }

      handleCancelForm()
    } catch (err: unknown) {
      const errorMsg = editingId
        ? 'Failed to update test case. Please try again.'
        : 'Failed to create test case. Please try again.'
      setFormErrors({ general: errorMsg })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(testCaseId: string) {
    if (!window.confirm('Are you sure you want to delete this test case?')) return

    setDeletingId(testCaseId)
    try {
      await api.delete(`/api/testcases/${testCaseId}`)
      setTestCases((prev) => prev.filter((tc) => tc.id !== testCaseId))

      // If we were editing the deleted test case, close the form
      if (editingId === testCaseId) {
        handleCancelForm()
      }
    } catch {
      setError('Failed to delete test case. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <LoadingIndicator label="Loading test cases..." />
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Test Case Editor</h1>
          <p className="mt-1 text-sm text-gray-500">
            {testCases.length}/{MAX_TEST_CASES} test cases
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleNewTestCase}
            disabled={testCases.length >= MAX_TEST_CASES}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            Add Test Case
          </button>
          <button
            onClick={() => navigate(`/instructor/exercises/${exerciseId}/edit`)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to exercise
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
          <button
            onClick={() => {
              setError(null)
              fetchTestCases()
            }}
            className="ml-2 font-medium underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* Inline form (create / edit) */}
      {showForm && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/30 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            {editingId ? 'Edit Test Case' : 'New Test Case'}
          </h2>

          {formErrors.general && (
            <div
              className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {formErrors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Input Data */}
              <div>
                <label
                  htmlFor="input_data"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Input Data
                </label>
                <textarea
                  id="input_data"
                  value={formData.input_data}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, input_data: e.target.value }))
                  }
                  rows={5}
                  className={`w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 ${
                    formErrors.input_data
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:border-primary focus:ring-primary'
                  }`}
                  placeholder="Test input (stdin)..."
                />
                <div className="mt-1 flex justify-between">
                  {formErrors.input_data && (
                    <p className="text-xs text-red-600">{formErrors.input_data}</p>
                  )}
                  <p className="ml-auto text-xs text-gray-400">
                    {formData.input_data.length}/{MAX_FIELD_LENGTH}
                  </p>
                </div>
              </div>

              {/* Expected Output */}
              <div>
                <label
                  htmlFor="expected_output"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Expected Output <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="expected_output"
                  value={formData.expected_output}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      expected_output: e.target.value,
                    }))
                  }
                  rows={5}
                  className={`w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 ${
                    formErrors.expected_output
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:border-primary focus:ring-primary'
                  }`}
                  placeholder="Expected output (stdout)..."
                />
                <div className="mt-1 flex justify-between">
                  {formErrors.expected_output && (
                    <p className="text-xs text-red-600">{formErrors.expected_output}</p>
                  )}
                  <p className="ml-auto text-xs text-gray-400">
                    {formData.expected_output.length}/{MAX_FIELD_LENGTH}
                  </p>
                </div>
              </div>
            </div>

            {/* Point value + Visibility */}
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <label
                  htmlFor="point_value"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Point Value <span className="text-red-500">*</span>
                </label>
                <input
                  id="point_value"
                  type="number"
                  min={MIN_POINTS}
                  max={MAX_POINTS}
                  value={formData.point_value}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      point_value: parseInt(e.target.value) || MIN_POINTS,
                    }))
                  }
                  className={`w-24 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                    formErrors.point_value
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:border-primary focus:ring-primary'
                  }`}
                />
                {formErrors.point_value && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.point_value}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Range: {MIN_POINTS}-{MAX_POINTS}
                </p>
              </div>

              <div className="pt-5">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.is_visible}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        is_visible: e.target.checked,
                      }))
                    }
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  Visible to students
                </label>
                <p className="mt-1 text-xs text-gray-400">
                  Hidden test cases are only used during evaluation
                </p>
              </div>
            </div>

            {/* Form actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
              >
                {submitting
                  ? editingId
                    ? 'Updating...'
                    : 'Creating...'
                  : editingId
                    ? 'Update Test Case'
                    : 'Create Test Case'}
              </button>
              <button
                type="button"
                onClick={handleCancelForm}
                className="rounded border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Test case list */}
      {testCases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No test cases defined yet.</p>
          <button
            onClick={handleNewTestCase}
            className="mt-3 text-sm font-medium text-primary hover:text-primary-600"
          >
            Add your first test case
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Input (preview)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Expected Output (preview)
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Points
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Visibility
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {testCases.map((tc, index) => (
                <tr
                  key={tc.id}
                  className={`hover:bg-gray-50 ${editingId === tc.id ? 'bg-primary-50/50' : ''}`}
                >
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {index + 1}
                  </td>
                  <td className="max-w-[200px] truncate px-6 py-4 font-mono text-xs text-gray-700">
                    {tc.input_data || <span className="italic text-gray-400">empty</span>}
                  </td>
                  <td className="max-w-[200px] truncate px-6 py-4 font-mono text-xs text-gray-700">
                    {tc.expected_output}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-center text-sm font-medium text-gray-900">
                    {tc.point_value}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-center">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        tc.is_visible
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {tc.is_visible ? 'Visible' : 'Hidden'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <button
                      onClick={() => handleEdit(tc)}
                      className="mr-3 text-sm font-medium text-primary hover:text-primary-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tc.id)}
                      disabled={deletingId === tc.id}
                      className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      {deletingId === tc.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {testCases.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              Total points:{' '}
              <span className="font-medium text-gray-900">
                {testCases.reduce((sum, tc) => sum + tc.point_value, 0)}
              </span>
            </span>
            <span>
              Visible:{' '}
              <span className="font-medium">
                {testCases.filter((tc) => tc.is_visible).length}
              </span>{' '}
              / Hidden:{' '}
              <span className="font-medium">
                {testCases.filter((tc) => !tc.is_visible).length}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
