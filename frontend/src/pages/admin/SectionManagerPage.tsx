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

function getSemesterDisplayName(semId: string): string {
  const match = semId.match(/^(\d{4})-(\d{4})-HK(\d)$/);
  if (!match) return semId;
  const hkNum = parseInt(match[3]);
  const hk = hkNum === 1 ? "I" : hkNum === 2 ? "II" : hkNum === 3 ? "III" : match[3];
  return `Học kỳ ${hk} năm học ${match[1]}-${match[2]}`;
}

function parseSemester(sem: string) {
  const m1 = sem.match(/^(\d{4})-(\d{4})-HK(\d)$/);
  if (m1) {
    return { startYear: parseInt(m1[1]), hk: parseInt(m1[3]) };
  }
  const m2 = sem.match(/Học kỳ (I|II|III) (?:\w+ )?(\d{4})-(\d{4})/i);
  if (m2) {
    const hkVal = m2[1].toUpperCase();
    const hk = hkVal === 'I' ? 1 : hkVal === 'II' ? 2 : 3;
    return { startYear: parseInt(m2[2]), hk };
  }
  const m3 = sem.match(/Học kỳ (I|II|III) (\d{4})/i);
  if (m3) {
    const hkVal = m3[1].toUpperCase();
    const hk = hkVal === 'I' ? 1 : hkVal === 'II' ? 2 : 3;
    return { startYear: parseInt(m3[2]), hk };
  }
  return null;
}

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

  const [selectedSemester, setSelectedSemester] = useState<string>(() => {
    return localStorage.getItem('admin_selected_semester') || '2025-2026-HK2'
  })
  const [customSemesters, setCustomSemesters] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('admin_semesters') || '[]')
    } catch {
      return []
    }
  })

  const semesters = useMemo(() => {
    const dbSemesters = sections.map((s) => s.semester).filter(Boolean)
    const set = new Set(['2025-2026-HK2', ...dbSemesters, ...customSemesters])
    return [...set].sort((a, b) => {
      const parsedA = parseSemester(a)
      const parsedB = parseSemester(b)
      if (!parsedA || !parsedB) return a.localeCompare(b)
      const yearDiff = parsedA.startYear - parsedB.startYear
      if (yearDiff !== 0) return yearDiff
      return parsedA.hk - parsedB.hk
    })
  }, [sections, customSemesters])

  const handleAddSemester = () => {
    // Find the latest valid semester we can parse
    const parseable = semesters.map(s => ({ raw: s, parsed: parseSemester(s) })).filter(x => x.parsed !== null)
    const latestObj = parseable[parseable.length - 1]
    
    let nextVal: string
    if (latestObj && latestObj.parsed) {
      const { startYear, hk } = latestObj.parsed
      if (hk === 1) {
        nextVal = `${startYear}-${startYear + 1}-HK2`
      } else {
        nextVal = `${startYear + 1}-${startYear + 2}-HK1`
      }
    } else {
      nextVal = '2025-2026-HK2'
    }

    const newCustom = [...customSemesters]
    if (!newCustom.includes(nextVal)) {
      newCustom.push(nextVal)
      setCustomSemesters(newCustom)
      localStorage.setItem('admin_semesters', JSON.stringify(newCustom))
    }
    setSelectedSemester(nextVal)
    localStorage.setItem('admin_selected_semester', nextVal)
    toast.success(`Đã thêm học kỳ ${getSemesterDisplayName(nextVal)}`)
  }

  const handleDeleteSemester = (semId: string) => {
    if (!window.confirm(`Bạn có chắc muốn xóa học kỳ ${getSemesterDisplayName(semId)}?`)) return
    const newCustom = customSemesters.filter((s) => s !== semId)
    setCustomSemesters(newCustom)
    localStorage.setItem('admin_semesters', JSON.stringify(newCustom))
    
    if (selectedSemester === semId) {
      const remaining = semesters.filter((s) => s !== semId)
      const nextSelect = remaining[remaining.length - 1] || '2025-2026-HK2'
      setSelectedSemester(nextSelect)
      localStorage.setItem('admin_selected_semester', nextSelect)
    }
    toast.success(`Đã xóa học kỳ ${getSemesterDisplayName(semId)}`)
  }

  const filteredSections = useMemo(() => {
    let list = sections
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.semester.toLowerCase().includes(q) ||
        getSectionInstructorText(s).toLowerCase().includes(q) ||
        (s.instructor?.fullName || '').toLowerCase().includes(q) ||
        (s.instructor?.username || '').toLowerCase().includes(q)
    )
  }, [sections, search])

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
    const defaultSem = selectedSemester === 'ALL' 
      ? (semesters[semesters.length - 1] || '2025-2026-HK2') 
      : selectedSemester
    setFormData({ name: '', semester: defaultSem, instructor_id: null, instructor_ids: [] })
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

    const targetSemester = selectedSemester === 'ALL'
      ? (semesters[semesters.length - 1] || '2025-2026-HK2')
      : selectedSemester;

    try {
      const base64 = await fileToBase64(rosterFile)
      const response = await api.post('/api/admin/import-roster', {
        data: base64,
        filename: rosterFile.name,
        semester: targetSemester,
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
      </div>

      {/* Roster Import Panel */}
      {showRosterImport && (
        <div className="card border-primary-200 bg-primary-50/30 p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            Import Danh sách lớp (.xls / .xlsx)
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Tải lên file danh sách lớp (định dạng UET-VNU). Lớp sẽ được tạo thuộc học kỳ{' '}
            <strong className="text-primary-700">{getSemesterDisplayName(selectedSemester === 'ALL' ? (semesters[semesters.length - 1] || '2025-2026-HK2') : selectedSemester)}</strong>. 
            Mã lớp sẽ tự động được gán mã tiền tố tương ứng (Ví dụ: II2526).
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
              }}
              className="input max-w-sm"
              placeholder="Tìm theo tên lớp, học kỳ, giảng viên..."
            />
          </div>
        </div>
      )}

      {/* Semester Grouped Cards */}
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
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                Học kỳ đang chọn để thao tác:
              </span>
              <span className="badge-blue text-xs font-bold py-1 px-2.5 rounded-full">
                {getSemesterDisplayName(
                  selectedSemester === 'ALL'
                    ? semesters[semesters.length - 1] || '2025-2026-HK2'
                    : selectedSemester
                )}
              </span>
            </div>
            <button
              onClick={handleAddSemester}
              className="bg-primary hover:bg-primary-700 text-white text-[11px] font-bold px-4 py-2.5 rounded-lg transition-all active:scale-[0.97] shadow-sm cursor-pointer"
            >
              ➕ Thêm học kỳ mới
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {[...semesters].reverse().map((sem) => {
              const sectionsInSem = filteredSections.filter((s) => s.semester === sem)
              const isSelected = selectedSemester === sem

              return (
                <div
                  key={sem}
                  onClick={() => {
                    setSelectedSemester(sem)
                    localStorage.setItem('admin_selected_semester', sem)
                  }}
                  className={`card p-0 transition-all border overflow-hidden cursor-pointer ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/30 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 shadow-sm bg-white'
                  }`}
                >
                  {/* Semester Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3 select-none">
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${
                          isSelected
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-primary-50 hover:text-primary'
                        }`}
                      >
                        {getSemesterDisplayName(sem).toUpperCase()}
                      </span>
                      {isSelected && (
                        <span className="badge-blue text-[9px] font-extrabold tracking-wide uppercase select-none">
                          Đang chọn
                        </span>
                      )}
                      {customSemesters.includes(sem) && sections.filter(s => s.semester === sem).length === 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteSemester(sem)
                          }}
                          className="inline-flex items-center justify-center rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 px-2.5 py-1.5 text-[10px] font-bold transition-all border border-rose-200/55 cursor-pointer"
                          title="Xóa học kỳ này"
                        >
                          🗑️ Xóa học kỳ
                        </button>
                      )}
                    </div>

                    {isSelected && (
                      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setShowRosterImport(!showRosterImport)}
                          className="bg-[#bdc3c7] hover:bg-[#95a5a6] text-white text-[10px] font-bold px-3 py-1.5 rounded-md transition-all active:scale-[0.97] shadow-sm cursor-pointer"
                        >
                          📥 Import Danh sách lớp
                        </button>
                        <button
                          onClick={openCreateForm}
                          className="bg-primary hover:bg-primary-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-md transition-all active:scale-[0.97] shadow-sm cursor-pointer"
                        >
                          Tạo lớp
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Semester Body */}
                  <div className="space-y-2.5 p-4 bg-slate-50/10 rounded-b-xl">
                    {sectionsInSem.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs font-semibold italic bg-white rounded-xl border border-slate-200 border-dashed">
                        {search.trim() !== ''
                          ? 'Không tìm thấy lớp học phần nào khớp với từ khóa tìm kiếm.'
                          : 'Chưa có lớp học phần nào trong học kỳ này.'}
                      </div>
                    ) : (
                      <div className="space-y-2.5" onClick={(e) => e.stopPropagation()}>
                        {sectionsInSem.map((section: Section) => (
                          <div
                            key={section.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm hover:shadow hover:border-slate-300 transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary">
                                <SectionIcon className="h-5 w-5" />
                              </span>
                              <div>
                                <Link
                                  to={`/admin/sections/${section.id}`}
                                  className="font-bold text-slate-800 hover:text-primary hover:underline text-sm block"
                                >
                                  {section.name}
                                </Link>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {section.instructors && section.instructors.length > 0 ? (
                                    section.instructors.map((instructor) => (
                                      <span
                                        key={instructor.id}
                                        className="inline-flex items-center gap-1 rounded-full border border-primary-50 bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-800"
                                      >
                                        {instructor.fullName || instructor.username}
                                        {instructor.isPrimary && (
                                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-bold uppercase text-white scale-90">
                                            Chính
                                          </span>
                                        )}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium italic">Chưa phân công giảng viên</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {(!section.instructors || section.instructors.length === 0) && instructors.length > 0 && (
                                <select
                                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 bg-white focus:border-primary focus:outline-none cursor-pointer"
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
                              )}
                              <Link
                                to={`/admin/sections/${section.id}`}
                                className="bg-primary hover:bg-primary-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-[0.97] cursor-pointer shadow-sm"
                              >
                                Chi tiết
                              </Link>
                              <button
                                onClick={() => openEditForm(section)}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-[0.97] cursor-pointer"
                              >
                                Sửa
                              </button>
                              <button
                                onClick={() => handleDelete(section.id)}
                                disabled={deletingId === section.id}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50"
                              >
                                {deletingId === section.id ? 'Đang xóa...' : 'Xóa'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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
