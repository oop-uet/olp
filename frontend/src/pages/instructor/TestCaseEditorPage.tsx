import { useState, useEffect, FormEvent, ChangeEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'

const MAX_FIELD_LENGTH = 10240 // 10KB
const MAX_JAVA_TEST_LENGTH = 65536 // 64KB
const MAX_TEST_CASES = 50
const MIN_POINTS = 1
const MAX_POINTS = 100
const JAVA_TEST_MARKER = '__OOP_JAVA_TEST__'

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

function javaTestInput(fileName: string) {
  return `${JAVA_TEST_MARKER}\n${fileName || 'MyTest.java'}`
}

function isJavaTestInput(input: string) {
  return input.startsWith(JAVA_TEST_MARKER)
}

function getJavaTestFileName(input: string) {
  if (!isJavaTestInput(input)) return 'MyTest.java'
  return input.split(/\r?\n/, 2)[1]?.trim() || 'MyTest.java'
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
    } else if (data.expected_output.length > MAX_JAVA_TEST_LENGTH) {
      errors.expected_output = `Nội dung tối đa ${MAX_JAVA_TEST_LENGTH} ký tự (64KB)`
    }

    if (isJavaTestInput(data.input_data) && !data.expected_output.includes('@Test')) {
      errors.expected_output = 'File test Java/JUnit cần có ít nhất một phương thức @Test'
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

  function applyJavaTestContent(content: string, fileName = 'MyTest.java') {
    const safeFileName = fileName.endsWith('.java') ? fileName : 'MyTest.java'
    setFormData((prev) => ({
      ...prev,
      input_data: javaTestInput(safeFileName),
      expected_output: content,
      is_visible: false,
    }))
    setFormErrors({})
  }

  async function handleJavaFileImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.name.endsWith('.java')) {
      toast.error('Chỉ hỗ trợ import file .java.')
      return
    }

    const content = await file.text()
    if (content.length > MAX_JAVA_TEST_LENGTH) {
      toast.error(`File test tối đa ${MAX_JAVA_TEST_LENGTH} ký tự (64KB).`)
      return
    }
    applyJavaTestContent(content, file.name)
    toast.success(`Đã nạp ${file.name}.`)
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
    <div className="space-y-6 animate-fade-in">
      
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 font-medium py-1 px-3 bg-slate-50 border-b border-slate-100 rounded flex gap-1.5 items-center">
        <span className="text-teal-600 cursor-default">Trang chủ</span>
        <span>/</span>
        <button onClick={() => navigate(`/instructor/exercises`)} className="text-teal-600 hover:underline">Quản lý bài tập</button>
        <span>/</span>
        <span className="text-slate-400">Trình soạn bộ test</span>
      </div>

      {/* Page header */}
      <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-sans">Trình Soạn Bộ Test</h1>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            Cấu hình bộ test case đầu vào đầu ra của bài tập ({testCases.length}/{MAX_TEST_CASES} bộ test).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewTestCase}
            disabled={testCases.length >= MAX_TEST_CASES}
            className="btn-primary px-3.5 py-2 text-xs font-bold"
          >
            Thêm bộ test
          </button>
          <button
            onClick={() => navigate(`/instructor/exercises`)}
            className="btn-secondary px-3.5 py-2 text-xs font-bold"
          >
            Quay lại bài tập
          </button>
        </div>
      </div>

      {/* Inline form (create / edit) */}
      {showForm && (
        <div className="rounded-xl border border-teal-500/20 bg-teal-50/5 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2">
            {editingId ? '✍️ Sửa bộ test case' : '➕ Thêm bộ test case mới'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    Test Java/JUnit kiểu OASIS
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Import file .java hoặc paste nội dung như MyTest.java. Hệ thống sẽ lưu thành bộ test ẩn.
                  </p>
                </div>
                <label className="btn-secondary h-9 cursor-pointer px-3 text-xs font-bold">
                  Import .java
                  <input type="file" accept=".java,text/x-java-source" onChange={handleJavaFileImport} className="sr-only" />
                </label>
              </div>

              {isJavaTestInput(formData.input_data) && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Đang dùng test Java/JUnit: {getJavaTestFileName(formData.input_data)}
                </div>
              )}

              <label htmlFor="java_test_source" className="label mt-3 text-slate-600">
                Dán nội dung file test Java/JUnit
              </label>
              <textarea
                id="java_test_source"
                value={isJavaTestInput(formData.input_data) ? formData.expected_output : ''}
                onChange={(e) => applyJavaTestContent(e.target.value, getJavaTestFileName(formData.input_data))}
                rows={8}
                className="input font-mono px-3.5 py-2.5 text-xs"
                placeholder="import org.junit.Assert;&#10;import org.junit.Test;&#10;&#10;public class MyTest { ... }"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Input Data */}
              <div>
                <label htmlFor="input_data" className="label text-slate-600">
                  {isJavaTestInput(formData.input_data) ? 'Metadata test Java/JUnit' : 'Dữ liệu đầu vào (stdin)'}
                </label>
                <textarea
                  id="input_data"
                  value={formData.input_data}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, input_data: e.target.value }))
                  }
                  rows={5}
                  readOnly={isJavaTestInput(formData.input_data)}
                  className={`input font-mono py-2.5 px-3.5 text-xs ${isJavaTestInput(formData.input_data) ? 'bg-slate-100 text-slate-500' : ''} ${formErrors.input_data ? 'input-error' : ''}`}
                  placeholder="Mỗi tham số trên một dòng (stdin)..."
                />
                <div className="mt-1 flex justify-between">
                  {formErrors.input_data && (
                    <p className="text-xs text-rose-600 font-semibold">{formErrors.input_data}</p>
                  )}
                  <p className="ml-auto text-xs text-slate-400">
                    {formData.input_data.length}/{MAX_FIELD_LENGTH}
                  </p>
                </div>
              </div>

              {/* Expected Output */}
              <div>
                <label htmlFor="expected_output" className="label text-slate-600">
                  {isJavaTestInput(formData.input_data) ? 'Nội dung file test Java/JUnit' : 'Kết quả mong đợi (stdout)'} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="expected_output"
                  value={formData.expected_output}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, expected_output: e.target.value }))
                  }
                  rows={5}
                  className={`input font-mono py-2.5 px-3.5 text-xs ${formErrors.expected_output ? 'input-error' : ''}`}
                  placeholder="Kết quả hiển thị mong đợi (stdout)..."
                />
                <div className="mt-1 flex justify-between">
                  {formErrors.expected_output && (
                    <p className="text-xs text-rose-600 font-semibold">{formErrors.expected_output}</p>
                  )}
                  <p className="ml-auto text-xs text-slate-400">
                    {formData.expected_output.length}/{MAX_JAVA_TEST_LENGTH}
                  </p>
                </div>
              </div>
            </div>

            {/* Point value + Visibility */}
            <div className="flex flex-wrap items-center gap-6 border-t border-slate-100 pt-3">
              <div>
                <label htmlFor="point_value" className="label text-slate-600">
                  Điểm thành phần <span className="text-rose-500">*</span>
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
                  className={`input w-24 py-1.5 px-3.5 text-xs ${formErrors.point_value ? 'input-error' : ''}`}
                />
                {formErrors.point_value && (
                  <p className="mt-1 text-xs text-rose-600 font-semibold">{formErrors.point_value}</p>
                )}
                <p className="mt-1 text-[10px] text-slate-400">
                  Khoảng: {MIN_POINTS}-{MAX_POINTS}
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_visible}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, is_visible: e.target.checked }))
                    }
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4.5 w-4.5"
                  />
                  Hiển thị bộ test cho sinh viên
                </label>
                <p className="mt-1 text-[10px] text-slate-400">
                  Bộ test ẩn chỉ hiển thị kết quả Đạt/Không đạt lúc nộp bài
                </p>
              </div>
            </div>

            {/* Form actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button type="submit" disabled={submitting} className="btn-primary px-3.5 py-2 text-xs font-bold">
                {submitting
                  ? editingId
                    ? 'Đang cập nhật...'
                    : 'Đang tạo...'
                  : editingId
                    ? 'Lưu cập nhật'
                    : 'Lưu bộ test'}
              </button>
              <button type="button" onClick={handleCancelForm} className="btn-secondary px-3.5 py-2 text-xs font-bold">
                Hủy bỏ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Test case list */}
      {testCases.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <p className="text-slate-500 font-medium">Chưa có bộ test case nào cho bài tập này.</p>
          <button onClick={handleNewTestCase} className="btn-primary btn-sm mt-4">
            Thêm bộ test đầu tiên
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden border border-slate-100 shadow-sm">
          {/* Header banner */}
          <div className="panel-header">
            <h3 className="panel-title">
              <span>☰</span>
              Danh Sách Các Bộ Test Cases
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase">
                  <th className="px-5 py-3 w-16">#</th>
                  <th className="px-5 py-3">Đầu vào (Preview)</th>
                  <th className="px-5 py-3">Đầu ra mong đợi (Preview)</th>
                  <th className="px-5 py-3 text-center w-24">Điểm số</th>
                  <th className="px-5 py-3 text-center w-32">Chế độ</th>
                  <th className="px-5 py-3 text-right w-36">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
                {testCases.map((tc, index) => (
                  <tr
                    key={tc.id}
                    className={`hover:bg-slate-50/50 transition-colors ${editingId === tc.id ? 'bg-teal-50/20' : ''}`}
                  >
                    <td className="px-5 py-3 text-slate-400 font-bold">{index + 1}</td>
                    <td className="max-w-[220px] truncate px-5 py-3 font-mono text-slate-600">
                      {tc.input_data || <span className="italic text-slate-400">Trống (Không đầu vào)</span>}
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-3 font-mono text-slate-600">
                      {tc.expected_output}
                    </td>
                    <td className="px-5 py-3 text-center font-bold text-slate-800">
                      {tc.point_value}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={tc.is_visible ? 'badge-green' : 'badge-gray'}>
                        {tc.is_visible ? 'Hiển thị' : 'Bộ test ẩn'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => handleEdit(tc)} className="btn-secondary btn-sm mr-1.5 font-bold text-teal-600">
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDelete(tc.id)}
                        disabled={deletingId === tc.id}
                        className="btn-danger btn-sm font-bold"
                      >
                        {deletingId === tc.id ? '...' : 'Xóa'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary report details */}
      {testCases.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 flex items-center justify-between text-xs font-bold text-slate-500 shadow-sm">
          <span>
            TỔNG ĐIỂM BỘ TEST:{' '}
            <span className="text-teal-600 text-sm">
              {testCases.reduce((sum, tc) => sum + tc.point_value, 0)} điểm
            </span>
          </span>
          <span>
            HIỂN THỊ:{' '}
            <span className="text-emerald-600">{testCases.filter((tc) => tc.is_visible).length}</span>{' '}
            · ẨN: <span className="text-slate-400">{testCases.filter((tc) => !tc.is_visible).length}</span>
          </span>
        </div>
      )}
    </div>
  )
}
