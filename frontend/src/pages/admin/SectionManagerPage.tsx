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
  const [instructorSearch, setInstructorSearch] = useState('')
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
    setInstructorSearch('')
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
    setInstructorSearch('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingSection(null)
    setFormData({ name: '', semester: '', instructor_id: null, instructor_ids: [] })
    setInstructorSearch('')
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
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-800 text-lg shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <SectionIcon className="h-5 w-5" />
          </span>
          <span>QUẢN LÝ LỚP HỌC PHẦN</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRosterImport(!showRosterImport)}
            className="bg-[#bdc3c7] hover:bg-[#95a5a6] text-white text-[11px] font-bold px-4 py-2.5 rounded-lg transition-all active:scale-[0.97] shadow-sm cursor-pointer"
          >
            📥 Import Danh sách lớp
          </button>
          <button
            onClick={openCreateForm}
            className="bg-primary hover:bg-primary-700 text-white text-[11px] font-bold px-4 py-2.5 rounded-lg transition-all active:scale-[0.97] shadow-sm cursor-pointer"
          >
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
              <div className="space-y-2">
                <label className="label">Giảng viên phụ trách</label>
                
                {/* Selected Instructors Chips */}
                {formData.instructor_ids && formData.instructor_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    {formData.instructor_ids.map((id, index) => {
                      const inst = instructors.find((i) => i.id === id);
                      if (!inst) return null;
                      return (
                        <div
                          key={id}
                          className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs shadow-sm font-semibold text-slate-700"
                        >
                          {index === 0 && (
                            <span className="bg-primary-50 text-primary text-[9px] font-extrabold px-1 py-0.5 rounded tracking-wide uppercase">
                              Chính
                            </span>
                          )}
                          <span>{inst.fullName || inst.username}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newIds = formData.instructor_ids.filter((x) => x !== id);
                              setFormData((prev) => ({
                                ...prev,
                                instructor_id: newIds[0] || null,
                                instructor_ids: newIds,
                              }));
                            }}
                            className="text-slate-400 hover:text-rose-600 transition-colors font-bold text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Search Input for Instructors */}
                <div className="relative">
                  <input
                    type="text"
                    value={instructorSearch}
                    onChange={(e) => setInstructorSearch(e.target.value)}
                    className="input text-xs py-2 px-3"
                    placeholder="Tìm kiếm giảng viên theo tên, email..."
                  />
                  {instructorSearch && (
                    <button
                      type="button"
                      onClick={() => setInstructorSearch('')}
                      className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                {/* Filtered Dropdown list of checkboxes */}
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  {instructors
                    .filter((inst) => {
                      const searchLower = instructorSearch.toLowerCase().trim();
                      if (!searchLower) return true;
                      return (
                        (inst.fullName || '').toLowerCase().includes(searchLower) ||
                        (inst.username || '').toLowerCase().includes(searchLower) ||
                        (inst.email || '').toLowerCase().includes(searchLower)
                      );
                    })
                    .map((inst) => {
                      const isChecked = formData.instructor_ids.includes(inst.id);
                      return (
                        <label
                          key={inst.id}
                          className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 transition-colors cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              let newIds: string[];
                              if (isChecked) {
                                newIds = formData.instructor_ids.filter((x) => x !== inst.id);
                              } else {
                                newIds = [...formData.instructor_ids, inst.id];
                              }
                              setFormData((prev) => ({
                                ...prev,
                                instructor_id: newIds[0] || null,
                                instructor_ids: newIds,
                              }));
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">
                              {inst.fullName || inst.username}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">{inst.email}</p>
                          </div>
                        </label>
                      );
                    })}
                  {instructors.filter((inst) => {
                    const searchLower = instructorSearch.toLowerCase().trim();
                    if (!searchLower) return true;
                    return (
                      (inst.fullName || '').toLowerCase().includes(searchLower) ||
                      (inst.username || '').toLowerCase().includes(searchLower) ||
                      (inst.email || '').toLowerCase().includes(searchLower)
                    );
                  }).length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Không tìm thấy giảng viên nào khớp với từ khóa.
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium italic">
                  * Người đầu tiên được chọn hoặc xuất hiện ở danh sách thẻ trên sẽ là Giảng viên chính của lớp học phần.
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase select-none">
                <th className="px-4 py-3 text-center w-16 text-slate-500 font-black">STT</th>
                <th
                  onClick={() => toggleSort('name')}
                  className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 font-black"
                >
                  Tên lớp {sortField === 'name' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th
                  onClick={() => toggleSort('semester')}
                  className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 font-black"
                >
                  Học kỳ {sortField === 'semester' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th className="px-4 py-3 text-left text-slate-500 font-black">Giảng viên</th>
                <th className="px-4 py-3 text-center w-56 text-slate-500 font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {paginatedSections.map((section: Section, index: number) => (
                <tr key={section.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2.5 text-center text-slate-400 font-bold">
                    {index + 1 + (currentPage - 1) * PAGE_SIZE}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">
                    <Link
                      to={`/admin/sections/${section.id}`}
                      className="text-primary hover:text-primary-700 hover:underline"
                    >
                      {section.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="badge-blue">{section.semester}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {section.instructors && section.instructors.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {section.instructors.map((instructor) => (
                          <span
                            key={instructor.id}
                            className="inline-flex items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-800"
                          >
                            {instructor.fullName || instructor.username}
                            {instructor.isPrimary && (
                              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-white scale-90">
                                Chính
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : section.instructor ? (
                      <span className="text-[12px] text-slate-700 font-medium">
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
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Link
                        to={`/admin/sections/${section.id}`}
                        className="bg-[#3498db] hover:bg-[#2980b9] text-white text-[11px] font-bold px-3 py-1.5 rounded transition-all active:scale-[0.97] cursor-pointer shadow-sm inline-block"
                      >
                        Chi tiết
                      </Link>
                      <button
                        onClick={() => openEditForm(section)}
                        className="bg-[#2ece71] hover:bg-[#27ae60] text-white text-[11px] font-bold px-3 py-1.5 rounded transition-all active:scale-[0.97] cursor-pointer shadow-sm inline-block"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDelete(section.id)}
                        disabled={deletingId === section.id}
                        className="bg-[#e67e22] hover:bg-[#d35400] text-white text-[11px] font-bold px-3 py-1.5 rounded transition-all active:scale-[0.97] cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {deletingId === section.id ? 'Đang xóa...' : 'Xóa'}
                      </button>
                    </div>
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
                  className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent font-bold text-slate-600 cursor-pointer"
                >
                  Trước
                </button>
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`px-2.5 py-1 border rounded font-bold cursor-pointer ${
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
                  className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent font-bold text-slate-600 cursor-pointer"
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
