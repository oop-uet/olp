import { useState, useEffect, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'

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
    try {
      const response = await api.get(`/api/exercises/${exerciseId}/testcases`)
      setTestCases(response.data)
    } catch {
      toast.error('Không thể tải bộ test. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  function validateForm(data: TestCaseFormData): FormErrors {
    const errors: FormErrors = {}

    if (data.input_data.length > MAX_FIELD_LENGTH) {
      errors.input_data = `Đầu vào tối đa ${MAX_FIELD_LENGTH} ký tự (10KB)`
    }

    if (!data.expected_output.trim()) {
      errors.expected_output = 'Kết quả mong đợi là bắt buộc'
    } else if (data.expected_output.length > MAX_FIELD_LENGTH) {
      errors.expected_output = `Kết quả mong đợi tối đa ${MAX_FIELD_LENGTH} ký tự (10KB)`
    }

    if (
      !Number.isInteger(data.point_value) ||
      data.point_value < MIN_POINTS ||
      data.point_value > MAX_POINTS
    ) {
      errors.point_value = `Điểm phải là số nguyên từ ${MIN_POINTS} đến ${MAX_POINTS}`
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
      toast.error(`Đã đạt tối đa ${MAX_TEST_CASES} bộ test cho mỗi bài tập.`)
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

    // Check max test cases limit (only when creating new)
    if (!editingId && testCases.length >= MAX_TEST_CASES) {
      toast.error(`Đã đạt tối đa ${MAX_TEST_CASES} bộ test cho mỗi bài tập.`)
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
        toast.success('Đã cập nhật bộ test.')
      } else {
        // Create new test case
        const response = await api.post(`/api/exercises/${exerciseId}/testcases`, formData)
        setTestCases((prev) => [...prev, response.data])
        toast.success('Đã tạo bộ test.')
      }

      handleCancelForm()
    } catch {
      toast.error(
        editingId
          ? 'Không thể cập nhật bộ test. Vui lòng thử lại.'
          : 'Không thể tạo bộ test. Vui lòng thử lại.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(testCaseId: string) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bộ test này?')) return

    setDeletingId(testCaseId)
    try {
      await api.delete(`/api/testcases/${testCaseId}`)
      setTestCases((prev) => prev.filter((tc) => tc.id !== testCaseId))
      toast.success('Đã xóa bộ test.')

      // If we were editing the deleted test case, close the form
      if (editingId === testCaseId) {
        handleCancelForm()
      }
    } catch {
      toast.error('Không thể xóa bộ test. Vui lòng thử lại.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải bộ test..." />
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Trình soạn bộ test</h1>
          <p className="mt-1 text-sm text-gray-500">
            {testCases.length}/{MAX_TEST_CASES} bộ test
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleNewTestCase}
            disabled={testCases.length >= MAX_TEST_CASES}
            className="btn-primary"
          >
            Thêm bộ test
          </button>
          <button
            onClick={() => navigate(`/instructor/exercises/${exerciseId}/edit`)}
            className="btn-ghost btn-sm"
          >
            ← Quay lại bài tập
          </button>
        </div>
      </div>

      {/* Inline form (create / edit) */}
      {showForm && (
        <div className="rounded-xl border border-primary-200 bg-primary-50/30 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            {editingId ? 'Sửa bộ test' : 'Bộ test mới'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Input Data */}
              <div>
                <label htmlFor="input_data" className="label">
                  Dữ liệu đầu vào
                </label>
                <textarea
                  id="input_data"
                  value={formData.input_data}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, input_data: e.target.value }))
                  }
                  rows={5}
                  className={`input font-mono ${formErrors.input_data ? 'input-error' : ''}`}
                  placeholder="Đầu vào (stdin)..."
                />
                <div className="mt-1 flex justify-between">
                  {formErrors.input_data && (
                    <p className="text-xs text-danger-600">{formErrors.input_data}</p>
                  )}
                  <p className="ml-auto text-xs text-gray-400">
                    {formData.input_data.length}/{MAX_FIELD_LENGTH}
                  </p>
                </div>
              </div>

              {/* Expected Output */}
              <div>
                <label htmlFor="expected_output" className="label">
                  Kết quả mong đợi <span className="text-danger-500">*</span>
                </label>
                <textarea
                  id="expected_output"
                  value={formData.expected_output}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, expected_output: e.target.value }))
                  }
                  rows={5}
                  className={`input font-mono ${formErrors.expected_output ? 'input-error' : ''}`}
                  placeholder="Kết quả mong đợi (stdout)..."
                />
                <div className="mt-1 flex justify-between">
                  {formErrors.expected_output && (
                    <p className="text-xs text-danger-600">{formErrors.expected_output}</p>
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
                <label htmlFor="point_value" className="label">
                  Điểm <span className="text-danger-500">*</span>
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
                  className={`input w-24 ${formErrors.point_value ? 'input-error' : ''}`}
                />
                {formErrors.point_value && (
                  <p className="mt-1 text-xs text-danger-600">{formErrors.point_value}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Khoảng: {MIN_POINTS}-{MAX_POINTS}
                </p>
              </div>

              <div className="pt-5">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.is_visible}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, is_visible: e.target.checked }))
                    }
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  Hiển thị cho sinh viên
                </label>
                <p className="mt-1 text-xs text-gray-400">
                  Bộ test ẩn chỉ dùng khi chấm điểm
                </p>
              </div>
            </div>

            {/* Form actions */}
            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting
                  ? editingId
                    ? 'Đang cập nhật...'
                    : 'Đang tạo...'
                  : editingId
                    ? 'Cập nhật bộ test'
                    : 'Tạo bộ test'}
              </button>
              <button type="button" onClick={handleCancelForm} className="btn-secondary">
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Test case list */}
      {testCases.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <p className="text-gray-500">Chưa có bộ test nào.</p>
          <button onClick={handleNewTestCase} className="btn-primary btn-sm mt-4">
            Thêm bộ test đầu tiên
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">#</th>
                <th className="table-th">Đầu vào (xem trước)</th>
                <th className="table-th">Kết quả mong đợi (xem trước)</th>
                <th className="table-th text-center">Điểm</th>
                <th className="table-th text-center">Hiển thị</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {testCases.map((tc, index) => (
                <tr
                  key={tc.id}
                  className={`hover:bg-gray-50 ${editingId === tc.id ? 'bg-primary-50/50' : ''}`}
                >
                  <td className="table-td text-gray-500">{index + 1}</td>
                  <td className="max-w-[200px] truncate px-5 py-3.5 font-mono text-xs text-gray-700">
                    {tc.input_data || <span className="italic text-gray-400">trống</span>}
                  </td>
                  <td className="max-w-[200px] truncate px-5 py-3.5 font-mono text-xs text-gray-700">
                    {tc.expected_output}
                  </td>
                  <td className="table-td text-center font-medium text-gray-900">
                    {tc.point_value}
                  </td>
                  <td className="table-td text-center">
                    <span className={tc.is_visible ? 'badge-green' : 'badge-gray'}>
                      {tc.is_visible ? 'Hiển thị' : 'Ẩn'}
                    </span>
                  </td>
                  <td className="table-td text-right">
                    <button onClick={() => handleEdit(tc)} className="btn-secondary btn-sm mr-2">
                      Sửa
                    </button>
                    <button
                      onClick={() => handleDelete(tc.id)}
                      disabled={deletingId === tc.id}
                      className="btn-danger btn-sm"
                    >
                      {deletingId === tc.id ? 'Đang xóa...' : 'Xóa'}
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
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              Tổng điểm:{' '}
              <span className="font-medium text-gray-900">
                {testCases.reduce((sum, tc) => sum + tc.point_value, 0)}
              </span>
            </span>
            <span>
              Hiển thị:{' '}
              <span className="font-medium">{testCases.filter((tc) => tc.is_visible).length}</span>{' '}
              / Ẩn:{' '}
              <span className="font-medium">{testCases.filter((tc) => !tc.is_visible).length}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
