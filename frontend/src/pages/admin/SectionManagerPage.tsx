import { useState, useEffect, useCallback, useMemo } from 'react'
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
  instructors?: Array<Instructor & { isPrimary?: boolean }>
}

interface SectionFormData {
  name: string
  semester: string
  instructor_id: string | null
  instructor_ids: string[]
}

// ─── Component ───────────────────────────────────────────────────────────────

function getSectionInstructorText(section: Section) {
  const names =
    section.instructors?.map(
      (instructor) => instructor.fullName || instructor.username || instructor.email
    ) || []
  if (section.instructor) {
    names.push(section.instructor.fullName || section.instructor.username || section.instructor.email)
  }
  return names.join(' ')
}

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
    instructor_ids: [],
  })
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'name' | 'semester' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections
    const q = search.toLowerCase()
    return sections.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.semester.toLowerCase().includes(q) ||
        getSectionInstructorText(s).toLowerCase().includes(q) ||
        (s.instructor?.fullName || '').toLowerCase().includes(q) ||
        (s.instructor?.username || '').toLowerCase().includes(q)
    )
  }, [sections, search])

  const sortedSections = useMemo(() => {
    if (!sortField) return filteredSections
    return [...filteredSections].sort((a, b) => {
      let valA = a[sortField] || ''
      let valB = b[sortField] || ''
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredSections, sortField, sortOrder])

  const paginatedSections = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE
    return sortedSections.slice(startIndex, startIndex + PAGE_SIZE)
  }, [sortedSections, currentPage])

  const totalPages = Math.ceil(sortedSections.length / PAGE_SIZE)

  const toggleSort = (field: 'name' | 'semester') => {
    setCurrentPage(1)
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchSections = useCallback(async () => {
    setLoading(true)
    setCurrentPage(1)
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
    setFormData({ name: '', semester: '', instructor_id: null, instructor_ids: [] })
    setShowForm(true)
  }

  function openEditForm(section: Section) {
    const instructorIds =
      section.instructors && section.instructors.length > 0
        ? section.instructors.map((instructor) => instructor.id)
        : section.instructorId
          ? [section.instructorId]
          : []
    setEditingSection(section)
    setFormData({
      name: section.name,
      semester: section.semester,
      instructor_id: instructorIds[0] || null,
      instructor_ids: instructorIds,
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingSection(null)
    setFormData({ name: '', semester: '', instructor_id: null, instructor_ids: [] })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const payload = {
      ...formData,
      instructor_id: formData.instructor_ids[0] || null,
    }

    try {
      if (editingSection) {
        // Update
        const response = await api.put(
          `/api/admin/sections/${editingSection.id}`,
          payload
        )
        setSections((prev) =>
          prev.map((s) => (s.id === editingSection.id ? response.data : s))
        )
        toast.success('Cập nhật lớp thành công.')
      } else {
        // Create
        const response = await api.post('/api/admin/sections', payload)
        setSections((prev) => [...prev, response.data])
        toast.success('Tạo lớp thành công.')
      }
      closeForm()
      // Refresh to get full data with instructor relations
      fetchSections()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      const message =
        axiosErr.response?.data?.error?.message ||
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
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      const message =
        axiosErr.response?.data?.error?.message || 'Không thể xóa lớp.'
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
        { instructor_id: instructorId, instructor_ids: [instructorId] }
      )
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, ...response.data } : s))
      )
      toast.success('Đã phân công giảng viên.')
      // Refresh to get updated instructor relation data
      fetchSections()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      const message =
        axiosErr.response?.data?.error?.message || 'Không thể phân công giảng viên.'
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
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Nhập danh sách thất bại')
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

              {/* Instructors */}
              <div>
                <label htmlFor="section-instructor" className="label">
                  Giảng viên phụ trách
                </label>
                <select
                  id="section-instructor"
                  multiple
                  value={formData.instructor_ids}
                  onChange={(e) => {
                    const selectedIds = Array.from(
                      e.currentTarget.selectedOptions,
                      (option) => option.value
                    )
                    setFormData((prev) => ({
                      ...prev,
                      instructor_id: selectedIds[0] || null,
                      instructor_ids: selectedIds,
                    }))
                  }}
                  className="input min-h-32"
                >
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.fullName || instructor.username} ({instructor.email})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Có thể chọn nhiều giảng viên. Người đầu tiên trong danh sách được lưu làm giảng viên chính.
                </p>
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

      {/* Search filter */}
      {sections.length > 0 && (
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="input max-w-sm"
            placeholder="Tìm theo tên lớp, học kỳ, giảng viên..."
          />
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
      ) : filteredSections.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <SectionIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">Không tìm thấy lớp học phần nào khớp với từ khóa tìm kiếm.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th text-center w-16 select-none">STT</th>
                <th
                  onClick={() => toggleSort('name')}
                  className="table-th cursor-pointer hover:bg-gray-100 transition-colors select-none"
                >
                  Tên lớp {sortField === 'name' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th
                  onClick={() => toggleSort('semester')}
                  className="table-th cursor-pointer hover:bg-gray-100 transition-colors select-none"
                >
                  Học kỳ {sortField === 'semester' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th className="table-th">Giảng viên</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedSections.map((section: Section, index: number) => (
                <tr key={section.id} className="hover:bg-gray-50">
                  <td className="table-td text-center text-slate-500 font-bold">
                    {index + 1 + (currentPage - 1) * PAGE_SIZE}
                  </td>
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
                    {section.instructors && section.instructors.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {section.instructors.map((instructor) => (
                          <span
                            key={instructor.id}
                            className="inline-flex items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2 py-1 text-xs font-medium text-primary-800"
                          >
                            {instructor.fullName || instructor.username}
                            {instructor.isPrimary && (
                              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                                Chính
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : section.instructor ? (
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

          {totalPages > 1 && (
            <div className="flex justify-between items-center text-xs text-slate-500 p-4 border-t border-slate-100 bg-white">
              <div>
                Hiển thị {Math.min(sortedSections.length, (currentPage - 1) * PAGE_SIZE + 1)} đến{' '}
                {Math.min(sortedSections.length, currentPage * PAGE_SIZE)} trong tổng số{' '}
                {sortedSections.length} lớp học phần
              </div>
              <div className="flex gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent font-bold text-slate-600"
                >
                  Trước
                </button>
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`px-2.5 py-1 border rounded font-bold ${
                      currentPage === i + 1
                        ? 'bg-primary text-white border-primary'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent font-bold text-slate-600"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
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
