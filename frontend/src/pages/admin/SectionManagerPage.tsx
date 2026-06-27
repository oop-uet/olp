import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner, SectionIcon, CheckCircleIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Instructor {
  id: string
  username: string
  email: string
  role: string
  fullName?: string | null
}

interface Section {
  id: string
  name: string
  semester: string
  instructorId: string | null
  createdAt: string
  instructor?: Instructor | null
}

interface SectionFormData {
  name: string
  semester: string
  instructor_id: string | null
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SectionManagerPage() {
  const [sections, setSections] = useState<Section[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSection, setEditingSection] = useState<Section | null>(null)
  const [formData, setFormData] = useState<SectionFormData>({
    name: '',
    semester: '',
    instructor_id: null,
  })
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchSections = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/admin/sections')
      setSections(response.data)
    } catch {
      toast.error('Không thể tải danh sách lớp. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchInstructors = useCallback(async () => {
    try {
      const response = await api.get('/api/admin/users', { params: { role: 'instructor' } })
      setInstructors(response.data)
    } catch {
      // Silently handle - instructor list is optional for the form
    }
  }, [])

  useEffect(() => {
    fetchSections()
    fetchInstructors()
  }, [fetchSections, fetchInstructors])

  // ─── Form Handlers ─────────────────────────────────────────────────────

  function openCreateForm() {
    setEditingSection(null)
    setFormData({ name: '', semester: '', instructor_id: null })
    setShowForm(true)
  }

  function openEditForm(section: Section) {
    setEditingSection(section)
    setFormData({
      name: section.name,
      semester: section.semester,
      instructor_id: section.instructorId,
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingSection(null)
    setFormData({ name: '', semester: '', instructor_id: null })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      if (editingSection) {
        // Update
        const response = await api.put(
          `/api/admin/sections/${editingSection.id}`,
          formData
        )
        setSections((prev) =>
          prev.map((s) => (s.id === editingSection.id ? response.data : s))
        )
        toast.success('Cập nhật lớp thành công.')
      } else {
        // Create
        const response = await api.post('/api/admin/sections', formData)
        setSections((prev) => [...prev, response.data])
        toast.success('Tạo lớp thành công.')
      }
      closeForm()
      // Refresh to get full data with instructor relations
      fetchSections()
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message ||
        `Không thể ${editingSection ? 'cập nhật' : 'tạo'} lớp.`
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete Handler ────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa lớp này?')) return

    setDeletingId(id)
    try {
      await api.delete(`/api/admin/sections/${id}`)
      setSections((prev) => prev.filter((s) => s.id !== id))
      toast.success('Đã xóa lớp.')
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || 'Không thể xóa lớp.'
      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Instructor Assignment Handler ─────────────────────────────────────

  async function handleAssignInstructor(
    sectionId: string,
    instructorId: string
  ) {
    try {
      const response = await api.put(
        `/api/admin/sections/${sectionId}/instructor`,
        { instructor_id: instructorId }
      )
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, ...response.data } : s))
      )
      toast.success('Đã phân công giảng viên.')
      // Refresh to get updated instructor relation data
      fetchSections()
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || 'Không thể phân công giảng viên.'
      toast.error(message)
    }
  }

  // ─── Roster Import State ───────────────────────────────────────────────
  const [showRosterImport, setShowRosterImport] = useState(false)
  const [rosterFile, setRosterFile] = useState<File | null>(null)
  const [rosterImporting, setRosterImporting] = useState(false)
  const [rosterResult, setRosterResult] = useState<{
    section: { id: string; name: string; semester: string };
    imported: number;
    skipped: Array<{ row: number; studentId?: string; reason: string }>;
    total: number;
    instructor: { id: string; name: string; matched: boolean } | null;
  } | null>(null)

  async function handleRosterImport() {
    if (!rosterFile) return
    setRosterImporting(true)
    setRosterResult(null)

    try {
      const base64 = await fileToBase64(rosterFile)
      const response = await api.post('/api/admin/import-roster', {
        data: base64,
        filename: rosterFile.name,
      })
      setRosterResult(response.data)
      setRosterFile(null)
      toast.success('Nhập danh sách lớp thành công.')
      // Refresh sections list
      fetchSections()
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Nhập danh sách thất bại')
    } finally {
      setRosterImporting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <SectionIcon className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-semibold text-gray-800">
            Quản lý lớp học phần
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRosterImport(!showRosterImport)}
            className="btn-secondary"
          >
            📥 Import Danh sách lớp
          </button>
          <button onClick={openCreateForm} className="btn-primary">
            Tạo lớp
          </button>
        </div>
      </div>

      {/* Roster Import Panel */}
      {showRosterImport && (
        <div className="card border-primary-200 bg-primary-50/30 p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            Import Danh sách lớp (.xls / .xlsx)
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Tải lên file danh sách lớp (định dạng UET-VNU). Hệ thống sẽ tự tạo lớp, tạo tài khoản sinh viên (tên đăng nhập = mật khẩu = MSSV), và yêu cầu đổi mật khẩu khi đăng nhập lần đầu.
          </p>

          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".xls,.xlsx"
              onChange={(e) => setRosterFile(e.target.files?.[0] || null)}
              className="block text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-700"
            />
            <button
              onClick={handleRosterImport}
              disabled={!rosterFile || rosterImporting}
              className="btn-success"
            >
              {rosterImporting ? (
                <>
                  <Spinner /> Đang nhập...
                </>
              ) : (
                'Nhập'
              )}
            </button>
          </div>

          {/* Import Result */}
          {rosterResult && (
            <div className="mt-4 rounded-lg border border-success-100 bg-success-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-success-700">
                <CheckCircleIcon className="h-5 w-5" /> Nhập thành công!
              </p>
              <ul className="mt-2 space-y-1 text-xs text-success-700">
                <li>Lớp: <strong>{rosterResult.section.name}</strong> ({rosterResult.section.semester})</li>
                <li>Đã nhập: <strong>{rosterResult.imported}</strong> / {rosterResult.total} sinh viên</li>
                {rosterResult.instructor && (
                  <li className="flex flex-wrap items-center gap-2">
                    <span>
                      Giảng viên: <strong>{rosterResult.instructor.name}</strong>
                    </span>
                    {rosterResult.instructor.matched ? (
                      <span className="badge-green">đã khớp</span>
                    ) : (
                      <span className="badge-yellow">
                        dùng mặc định (không tìm thấy trong hệ thống)
                      </span>
                    )}
                  </li>
                )}
                {rosterResult.skipped.length > 0 && (
                  <li className="text-warning-700">
                    Bỏ qua: {rosterResult.skipped.length} (
                    {rosterResult.skipped.slice(0, 3).map(s => s.reason).join(', ')}
                    {rosterResult.skipped.length > 3 && '...'}
                    )
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Section Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">
              {editingSection ? 'Chỉnh sửa lớp' : 'Tạo lớp'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="section-name" className="label">
                  Tên lớp
                </label>
                <input
                  id="section-name"
                  type="text"
                  required
                  maxLength={100}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="input"
                  placeholder="VD: OOP - INT2204 - K68"
                />
              </div>

              {/* Semester */}
              <div>
                <label htmlFor="section-semester" className="label">
                  Học kỳ
                </label>
                <input
                  id="section-semester"
                  type="text"
                  required
                  maxLength={20}
                  value={formData.semester}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      semester: e.target.value,
                    }))
                  }
                  className="input"
                  placeholder="VD: 2024-1"
                />
              </div>

              {/* Instructor */}
              <div>
                <label htmlFor="section-instructor" className="label">
                  Giảng viên
                </label>
                <select
                  id="section-instructor"
                  value={formData.instructor_id || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      instructor_id: e.target.value || null,
                    }))
                  }
                  className="input"
                >
                  <option value="">-- Chưa có giảng viên --</option>
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.fullName || instructor.username} ({instructor.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="btn-secondary"
                >
                  Hủy
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? (
                    <>
                      <Spinner /> Đang lưu...
                    </>
                  ) : editingSection ? (
                    'Cập nhật'
                  ) : (
                    'Tạo'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Section Table */}
      {loading ? (
        <PageLoader label="Đang tải danh sách lớp..." />
      ) : sections.length === 0 ? (
        <div className="card flex flex-col items-center justify-center border-dashed p-12 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <SectionIcon className="h-7 w-7" />
          </span>
          <p className="text-gray-500">Chưa có lớp học phần nào.</p>
          <button
            onClick={openCreateForm}
            className="mt-3 text-sm font-medium text-primary hover:text-primary-700"
          >
            Tạo lớp đầu tiên
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Tên lớp</th>
                <th className="table-th">Học kỳ</th>
                <th className="table-th">Giảng viên</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sections.map((section) => (
                <tr key={section.id} className="hover:bg-gray-50">
                  <td className="table-td">
                    <Link
                      to={`/admin/sections/${section.id}`}
                      className="font-medium text-primary hover:text-primary-700"
                    >
                      {section.name}
                    </Link>
                  </td>
                  <td className="table-td">
                    <span className="badge-blue">{section.semester}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {section.instructor ? (
                      <span className="text-sm text-gray-700">
                        {section.instructor.fullName || section.instructor.username}
                      </span>
                    ) : instructors.length > 0 ? (
                      <select
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 focus:border-primary focus:outline-none"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssignInstructor(section.id, e.target.value)
                          }
                        }}
                      >
                        <option value="">Phân công giảng viên...</option>
                        {instructors.map((instructor) => (
                          <option key={instructor.id} value={instructor.id}>
                            {instructor.fullName || instructor.username}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs italic text-gray-400">
                        Chưa phân công
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      to={`/admin/sections/${section.id}`}
                      className="mr-3 text-sm font-medium text-primary hover:text-primary-700"
                    >
                      Chi tiết
                    </Link>
                    <button
                      onClick={() => openEditForm(section)}
                      className="mr-3 text-sm font-medium text-primary hover:text-primary-700"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => handleDelete(section.id)}
                      disabled={deletingId === section.id}
                      className="text-sm font-medium text-danger-600 hover:text-danger-700 disabled:opacity-50"
                    >
                      {deletingId === section.id ? 'Đang xóa...' : 'Xóa'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Helper to convert a File to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
