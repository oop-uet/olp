import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { formatSemesterDisplayName, normalizePreviewSectionName } from '../../utils/semester'
import { compareByVietnameseName } from '../../lib/sortUtils'

interface InstructorInfo {
  id: string
  fullName?: string | null
  username?: string | null
  email?: string | null
}

interface SectionInfo {
  id: string
  name: string
  semester: string
  instructor: InstructorInfo | null
  createdAt: string
}

interface SectionStudent {
  enrollmentId: string
  userId: string
  studentId: string
  username: string
  fullName: string
  email: string
  enrolledAt: string
}

interface SectionExercise {
  assignmentId: string
  exerciseId: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  deadline: string | null
  isAssessment: boolean
  assignedAt: string
}

interface SectionDetail {
  section: SectionInfo
  students: SectionStudent[]
  exercises: SectionExercise[]
  studentCount: number
  exerciseCount: number
}
interface StudentProgress {
  completedExercises: number
  averageScore: number
  rank: number | null
}

interface StudentLookupEnrollment {
  enrollmentId: string
  sectionId: string
  sectionName: string
  semester: string
  isCurrentSection: boolean
  instructors: Array<{ id: string; name: string }>
}

interface StudentLookupResult {
  exists: boolean
  student: {
    id: string
    username: string
    email: string
    fullName: string | null
  } | null
  enrollments: StudentLookupEnrollment[]
}

export function InstructorSectionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<SectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)

  const [sections, setSections] = useState<any[]>([])
  const [sectionsDropdownOpen, setSectionsDropdownOpen] = useState(false)
  const sectionsDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchSections()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sectionsDropdownRef.current && !sectionsDropdownRef.current.contains(e.target as Node)) {
        setSectionsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchSections() {
    try {
      const response = await api.get('/api/instructor/sections')
      setSections(response.data ?? [])
    } catch {}
  }

  // ─── Search & Pagination states ─────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(30)
  const [currentPage, setCurrentPage] = useState(1)

  // ─── Modal & Action states ──────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false)
  const [newStudentId, setNewStudentId] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [studentLookup, setStudentLookup] = useState<StudentLookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const lookupSeqRef = useRef(0)

  const [showEditModal, setShowEditModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState<SectionStudent | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null)
  const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [showImportConfirmModal, setShowImportConfirmModal] = useState(false)
  const [importOverwrite, setImportOverwrite] = useState(false)
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Student progress view states ────────────────────────────────────────
  const [progressStudent, setProgressStudent] = useState<SectionStudent | null>(null)
  const [progressData, setProgressData] = useState<StudentProgress | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(false)

  useEffect(() => {
    if (id) {
      fetchDetail()
    }
  }, [id])

  useEffect(() => {
    if (!showAddModal) {
      setStudentLookup(null)
      setLookupLoading(false)
      return
    }

    const studentId = newStudentId.trim()
    if (studentId.length < 4) {
      setStudentLookup(null)
      setLookupLoading(false)
      return
    }

    const seq = ++lookupSeqRef.current
    setLookupLoading(true)
    const timer = setTimeout(async () => {
      try {
        const response = await api.get(`/api/instructor/sections/${id}/students/lookup/${encodeURIComponent(studentId)}`)
        if (lookupSeqRef.current !== seq) return
        const result: StudentLookupResult = response.data
        setStudentLookup(result)
        if (result.student?.fullName) {
          setNewFullName((current) => current.trim() ? current : result.student?.fullName ?? current)
        }
      } catch {
        if (lookupSeqRef.current === seq) {
          setStudentLookup(null)
        }
      } finally {
        if (lookupSeqRef.current === seq) {
          setLookupLoading(false)
        }
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [id, newStudentId, showAddModal])

  async function fetchDetail() {
    setLoading(true)
    setAccessError(null)
    try {
      const response = await api.get(`/api/instructor/sections/${id}/detail`)
      setDetail(response.data)
    } catch (error) {
      const status = (error as AxiosError)?.response?.status
      if (status === 403) {
        setAccessError('Bạn không có quyền truy cập lớp này.')
      } else if (status === 404) {
        setAccessError('Không tìm thấy lớp học này.')
      } else {
        toast.error('Không thể tải thông tin lớp. Vui lòng thử lại.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ─── Student Roster Management Handlers ──────────────────────────────────

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    const studentId = newStudentId.trim()
    const fullName = newFullName.trim()
    if (!studentId || !fullName) return
    const shouldTransferStudent = studentLookup?.enrollments.some((enrollment) => !enrollment.isCurrentSection) ?? false
    setAddLoading(true)
    try {
      await api.post(`/api/instructor/sections/${id}/students`, {
        studentId,
        fullName,
        email: `${studentId}@vnu.edu.vn`,
        transferExisting: shouldTransferStudent,
      })
      toast.success(shouldTransferStudent ? 'Đã chuyển lớp và ghi danh sinh viên.' : 'Đã ghi danh sinh viên mới.')
      setShowAddModal(false)
      setNewStudentId('')
      setNewFullName('')
      setStudentLookup(null)
      await fetchDetail()
    } catch (err) {
      const msg = (err as AxiosError<{ error?: { message?: string } }>)?.response?.data?.error?.message || 'Không thể thêm sinh viên.'
      toast.error(msg)
    } finally {
      setAddLoading(false)
    }
  }

  function openEditModal(student: SectionStudent) {
    setEditingStudent(student)
    setEditFullName(student.fullName || '')
    setEditEmail(student.email || '')
    setShowEditModal(true)
  }

  async function handleEditStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!editingStudent) return
    setEditLoading(true)
    try {
      await api.put(`/api/instructor/sections/${id}/students/${editingStudent.userId}`, {
        fullName: editFullName,
        email: editEmail,
      })
      toast.success('Đã cập nhật thông tin sinh viên.')
      setShowEditModal(false)
      setEditingStudent(null)
      await fetchDetail()
    } catch {
      toast.error('Không thể cập nhật thông tin sinh viên.')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleResetPassword(student: SectionStudent) {
    if (!window.confirm(`Đặt lại mật khẩu cho sinh viên "${student.fullName || student.studentId}" về mặc định (Mã SV)?`)) return
    setResettingPasswordId(student.userId)
    try {
      await api.post(`/api/instructor/sections/${id}/students/${student.userId}/reset-password`)
      toast.success('Đặt lại mật khẩu thành công. Mật khẩu mới là Mã SV.')
    } catch {
      toast.error('Không thể đặt lại mật khẩu.')
    } finally {
      setResettingPasswordId(null)
    }
  }

  async function handleRemoveStudent(student: SectionStudent) {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa sinh viên "${student.fullName || student.username}" khỏi lớp này?`)) return

    setRemovingStudentId(student.userId)
    try {
      await api.delete(`/api/instructor/sections/${id}/students/${student.userId}`)
      toast.success('Đã xóa sinh viên khỏi lớp.')
      await fetchDetail()
    } catch {
      toast.error('Không thể xóa sinh viên. Vui lòng thử lại.')
    } finally {
      setRemovingStudentId(null)
    }
  }

  async function handleExportRoster() {
    try {
      const response = await api.get(`/api/instructor/sections/${id}/export-students`, {
        responseType: 'blob',
      })
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `danh_sach_sinh_vien_${detail?.section.name || 'lop'}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Xuất file thành công.')
    } catch {
      toast.error('Không thể xuất danh sách sinh viên.')
    }
  }

  function triggerExcelImport() {
    fileInputRef.current?.click()
  }

  function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setPendingImportFile(file)
    setImportOverwrite(false)
    setShowImportConfirmModal(true)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function executeExcelImport() {
    if (!pendingImportFile) return

    setImporting(true)
    setShowImportConfirmModal(false)

    const file = pendingImportFile
    setPendingImportFile(null)

    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64Content = event.target?.result?.toString().split(',')[1]
      if (!base64Content) {
        toast.error('Lỗi đọc file.')
        setImporting(false)
        return
      }

      try {
        const response = await api.post(`/api/instructor/sections/${id}/import-students`, {
          data: base64Content,
          filename: file.name,
          overwrite: importOverwrite,
        })
        const report = response.data
        toast.success(`Đã nhập dữ liệu! Thành công: ${report.imported}, Bỏ qua: ${report.skipped.length}`)
        await fetchDetail()
      } catch {
        toast.error('Lỗi khi tải lên tệp import.')
      } finally {
        setImporting(false)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleViewProgress(student: SectionStudent) {
    setProgressStudent(student)
    setProgressData(null)
    setLoadingProgress(true)
    try {
      const response = await api.get(
        `/api/instructor/sections/${id}/students/${student.userId}/progress`
      )
      setProgressData(response.data)
    } catch {
      toast.error('Không thể tải tiến độ sinh viên.')
      setProgressStudent(null)
    } finally {
      setLoadingProgress(false)
    }
  }

  function closeProgress() {
    setProgressStudent(null)
    setProgressData(null)
  }



  const [sortField, setSortField] = useState<'studentId' | 'fullName' | 'email' | ''>('fullName')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const students = detail?.students ?? []
  const section = detail?.section

  // ─── Client Filter, Search & Sort ──────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    const list = students.filter((s) => {
      const q = searchQuery.toLowerCase().trim()
      if (!q) return true
      return (
        s.studentId.toLowerCase().includes(q) ||
        (s.fullName && s.fullName.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q))
      )
    })
    if (!sortField || sortField === 'fullName') {
      const direction = sortOrder === 'asc' ? 1 : -1
      return [...list].sort((a, b) => compareByVietnameseName(a.fullName, b.fullName) * direction)
    }
    return [...list].sort((a, b) => {
      const valA = (a[sortField] || '').toLowerCase()
      const valB = (b[sortField] || '').toLowerCase()
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [students, searchQuery, sortField, sortOrder])

  const toggleSort = (field: 'studentId' | 'fullName' | 'email') => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // Pagination
  const totalPages = Math.ceil(filteredStudents.length / pageSize)
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  if (loading) {
    return <PageLoader label="Đang tải thông tin lớp..." />
  }

  if (accessError) {
    return (
      <div className="card flex flex-col items-center justify-center p-12 text-center">
        <p className="text-gray-600">{accessError}</p>
        <Link to="/instructor/classes" className="btn-secondary btn-sm mt-4">
          ← Quay lại danh sách lớp
        </Link>
      </div>
    )
  }

  if (!detail || !section) {
    return null
  }

  const lookupHasCurrentSection = studentLookup?.enrollments.some((enrollment) => enrollment.isCurrentSection) ?? false
  const lookupHasOtherSection = studentLookup?.enrollments.some((enrollment) => !enrollment.isCurrentSection) ?? false

  return (
    <div className="space-y-6">
      
      {/* Page Header Bar */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 p-6 text-white shadow-md border-b-4 border-secondary flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="text-shadow-md">
          <h1 className="text-2xl font-black font-sans uppercase tracking-wide">{normalizePreviewSectionName(section.name, section.semester)}</h1>
          <p className="text-xs text-white/90 mt-1.5 font-bold">Quản lý thành viên lớp học phần</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/instructor/classes/${section.id}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            {/* Book Icon */}
            <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Xem bài tập tuần
          </Link>
          <Link 
            to="/instructor/leaderboard" 
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-xs font-bold text-white hover:bg-white/25 transition-colors"
          >
            {/* Trophy Icon */}
            <svg className="h-4 w-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5a2 2 0 10-2 2h2zm0 0h4m-4 0H8m12 0a2 2 0 10-2-2v2h2zm-2 0V6a2 2 0 10-2-2v2h2zm-8-2v2h2v-2H8zm-2 0v2h2v-2H6zm0 0a2 2 0 11-2-2v2h2zm-2 0V6a2 2 0 10-2-2v2h2z" />
            </svg>
            Bảng xếp hạng
          </Link>
        </div>
      </div>

      {/* Hidden file input for Excel imports */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleExcelImport}
        accept=".xlsx,.xls,.csv"
        className="hidden"
      />

      {/* Students Card - Styled exactly as UET OASIS green/teal banner */}
      <div className="card overflow-hidden">
        {/* Banner header */}
        <div className="panel-header">
          <h2 className="panel-title uppercase">
            <span>☰</span>
            Danh Sách Sinh Viên ({students.length})
            <div className="relative inline-block text-left" ref={sectionsDropdownRef}>
              <button
                type="button"
                onClick={() => setSectionsDropdownOpen((o) => !o)}
                className="badge-blue hover:bg-sky-700/80 active:scale-95 ml-2 font-bold normal-case inline-flex items-center gap-1 transition-all select-none border-0 cursor-pointer"
              >
                <span>{normalizePreviewSectionName(section.name, section.semester)}</span>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {sectionsDropdownOpen && (
                <div className="absolute left-2 z-50 mt-1 max-h-60 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-slate-700 shadow-xl ring-1 ring-black/5 animate-fade-in normal-case text-xs font-semibold">
                  {sections.length === 0 ? (
                    <div className="px-4 py-2 text-slate-400 italic">Đang tải danh sách...</div>
                  ) : (
                    sections.map((sec) => (
                      <button
                        key={sec.id}
                        onClick={() => {
                          setSectionsDropdownOpen(false)
                          navigate(`/instructor/classes/${sec.id}/students`)
                        }}
                        className={`flex w-full items-center px-4 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                          sec.id === id
                            ? 'bg-slate-50 font-bold text-primary'
                            : 'text-slate-700 font-medium'
                        }`}
                      >
                        {normalizePreviewSectionName(sec.name, sec.semester)}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-2 sm:mt-0">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-primary hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm"
            >
              Thêm Sinh Viên
            </button>
            <button
              onClick={triggerExcelImport}
              disabled={importing}
              className="bg-primary hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50 shadow-sm"
            >
              {importing ? 'Đang import...' : 'Import từ Excel'}
            </button>
            <button
              onClick={handleExportRoster}
              className="bg-primary hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm"
            >
              Xuất ra Excel
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Table Controls (Show Entries & Search) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-medium">
            <div className="flex items-center gap-1.5">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={999999}>Tất cả</option>
              </select>
              <span>dòng</span>
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <span>Tìm kiếm:</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Tìm tên, mã sinh viên, email..."
                className="border border-slate-200 rounded px-2.5 py-1.5 w-full sm:w-60 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Roster table */}
          {students.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Chưa có sinh viên nào trong danh sách lớp.</p>
          ) : filteredStudents.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Không tìm thấy sinh viên phù hợp.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase select-none">
                    <th className="px-4 py-3 text-center w-12 text-slate-500 font-black">#</th>
                    <th
                      onClick={() => toggleSort('studentId')}
                      className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 font-black"
                    >
                      MSSV {sortField === 'studentId' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th
                      onClick={() => toggleSort('fullName')}
                      className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 font-black"
                    >
                      Sinh viên {sortField === 'fullName' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th className="px-4 py-3 text-left text-slate-500 font-black">Lớp học phần</th>
                    <th className="px-4 py-3 text-center w-64 text-slate-500 font-black">Chức năng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {paginatedStudents.map((student, idx) => {
                    const rowNum = (currentPage - 1) * pageSize + idx + 1
                    return (
                      <tr key={student.enrollmentId} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-2.5 text-center text-slate-400 font-semibold">{rowNum}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => handleViewProgress(student)}
                            className="font-bold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer"
                          >
                            {student.studentId}
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => handleViewProgress(student)}
                            className="font-semibold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer"
                          >
                            {student.fullName || student.username}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 font-medium">{normalizePreviewSectionName(section.name, section.semester)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {/* Sửa button (green) */}
                            <button
                              onClick={() => openEditModal(student)}
                              className="bg-[#2ece71] hover:bg-[#27ae60] text-white text-[11px] font-bold px-3 py-1.5 rounded transition-all active:scale-[0.97] cursor-pointer shadow-sm"
                            >
                              Sửa
                            </button>
                            {/* Reset Mật Khẩu (gray) */}
                            <button
                              onClick={() => handleResetPassword(student)}
                              disabled={resettingPasswordId === student.userId}
                              className="bg-[#bdc3c7] hover:bg-[#95a5a6] disabled:bg-[#eaeded] disabled:text-[#95a5a6] text-white text-[11px] font-bold px-3 py-1.5 rounded transition-all active:scale-[0.97] cursor-pointer shadow-sm"
                            >
                              {resettingPasswordId === student.userId ? 'Đang reset...' : 'reset mật khẩu'}
                            </button>
                            {/* Xóa button (orange) */}
                            <button
                              onClick={() => handleRemoveStudent(student)}
                              disabled={removingStudentId === student.userId}
                              className="bg-[#e67e22] hover:bg-[#d35400] disabled:bg-[#eaeded] disabled:text-[#95a5a6] text-white text-[11px] font-bold px-3 py-1.5 rounded transition-all active:scale-[0.97] cursor-pointer shadow-sm"
                            >
                              {removingStudentId === student.userId ? 'Đang xóa...' : 'Xóa'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Table Pagination footer */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center text-xs text-slate-500 pt-3 border-t border-slate-100">
              <div>
                Hiển thị {Math.min(filteredStudents.length, (currentPage - 1) * pageSize + 1)} đến{' '}
                {Math.min(filteredStudents.length, currentPage * pageSize)} trong tổng số{' '}
                {filteredStudents.length} sinh viên
              </div>
              <div className="flex gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="btn btn-secondary btn-sm select-none"
                >
                  Trước
                </button>
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`btn btn-sm select-none ${
                      currentPage === i + 1
                        ? 'btn-primary'
                        : 'btn-secondary'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="btn btn-secondary btn-sm select-none"
                >
                  Sau
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ─── ADD STUDENT MODAL ────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-lg border border-slate-100 w-full max-w-md overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5 border-l-4 border-primary">
              <h3 className="font-bold text-xs uppercase tracking-wide text-slate-700">Thêm Sinh Viên Thủ Công</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>
            <form onSubmit={handleAddStudent} className="p-5 space-y-4">
              <div>
                <label className="label text-slate-600" htmlFor="new-student-id">Mã số sinh viên (MSSV)</label>
                <input
                  id="new-student-id"
                  type="text"
                  required
                  value={newStudentId}
                  onChange={(e) => setNewStudentId(e.target.value.trim())}
                  placeholder="Ví dụ: 20021287"
                  className="input"
                />
              </div>
              <div>
                <label className="label text-slate-600" htmlFor="new-full-name">Họ và Tên</label>
                <input
                  id="new-full-name"
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="input"
                />
              </div>
              {newStudentId.trim() && (
                <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  Email sẽ được tạo tự động: <span className="text-primary">{newStudentId.trim()}@vnu.edu.vn</span>
                </p>
              )}
              {lookupLoading && (
                <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                  <Spinner /> Đang kiểm tra sinh viên trong CSDL...
                </div>
              )}
              {!lookupLoading && studentLookup?.student && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p className="font-bold text-slate-700">Đã tìm thấy tài khoản sinh viên.</p>
                  <p className="mt-1">
                    {studentLookup.student.fullName || studentLookup.student.username} · {studentLookup.student.email}
                  </p>
                </div>
              )}
              {!lookupLoading && studentLookup?.enrollments && studentLookup.enrollments.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                  {studentLookup.enrollments.some((enrollment) => enrollment.isCurrentSection) ? (
                    <p>Sinh viên này đã được ghi danh trong lớp học phần hiện tại.</p>
                  ) : (
                    <p>Sinh viên này đang được ghi danh ở lớp học phần khác. Hãy cân nhắc trước khi chuyển lớp.</p>
                  )}
                  <ul className="mt-2 space-y-1.5">
                    {studentLookup.enrollments.map((enrollment) => {
                      const instructorNames = enrollment.instructors.map((instructor) => instructor.name).join(', ')
                      return (
                        <li key={enrollment.enrollmentId}>
                          <span className="font-bold">{normalizePreviewSectionName(enrollment.sectionName, enrollment.semester)}</span>
                          <span> · {formatSemesterDisplayName(enrollment.semester)}</span>
                          {instructorNames && <span> · GV: {instructorNames}</span>}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary btn-sm">Hủy</button>
                <button type="submit" disabled={addLoading || lookupHasCurrentSection} className="btn-primary btn-sm">
                  {addLoading ? <Spinner /> : lookupHasOtherSection ? 'Chuyển lớp' : 'Thêm ghi danh'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── EDIT STUDENT MODAL ───────────────────────────────────────────── */}
      {showEditModal && editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-lg border border-slate-100 w-full max-w-md overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5 border-l-4 border-primary">
              <h3 className="font-bold text-xs uppercase tracking-wide text-slate-700">Cập Nhật Thông Tin Sinh Viên</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>
            <form onSubmit={handleEditStudent} className="p-5 space-y-4">
              <div>
                <label className="label text-slate-600">Mã số sinh viên (MSSV)</label>
                <input
                  type="text"
                  disabled
                  value={editingStudent.studentId}
                  className="input bg-slate-50 cursor-not-allowed text-slate-400"
                />
              </div>
              <div>
                <label className="label text-slate-600" htmlFor="edit-full-name">Họ và Tên</label>
                <input
                  id="edit-full-name"
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label text-slate-600" htmlFor="edit-email">Email</label>
                <input
                  id="edit-email"
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="input"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary btn-sm">Hủy</button>
                <button type="submit" disabled={editLoading} className="btn-primary btn-sm">
                  {editLoading ? <Spinner /> : 'Cập nhật'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── STUDENT PROGRESS MODAL ───────────────────────────────────────── */}
      {progressStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeProgress}
        >
          <div
            className="bg-white rounded-xl shadow-lg border border-slate-100 w-full max-w-md overflow-hidden animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5 border-l-4 border-primary">
              <h3 className="font-bold text-xs uppercase tracking-wide text-slate-700">
                Tiến độ — {progressStudent.fullName || progressStudent.username} ({progressStudent.studentId})
              </h3>
              <button onClick={closeProgress} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>
            <div className="p-5">
              {loadingProgress ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                  <Spinner /> Đang tải tiến độ...
                </div>
              ) : progressData ? (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-2xl font-bold text-primary">
                      {progressData.completedExercises}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 font-semibold uppercase">Bài hoàn thành</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-2xl font-bold text-slate-800">
                      {progressData.averageScore.toFixed(1)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 font-semibold uppercase">Điểm trung bình</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-2xl font-bold text-amber-500">
                      {progressData.rank != null ? `#${progressData.rank}` : '—'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 font-semibold uppercase">Xếp hạng lớp</p>
                  </div>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-gray-500">Không có dữ liệu tiến độ.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── IMPORT CONFIRM MODAL ────────────────────────────────────────── */}
      {showImportConfirmModal && pendingImportFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-lg border border-slate-100 w-full max-w-md overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5 border-l-4 border-primary">
              <h3 className="font-bold text-xs uppercase tracking-wide text-slate-700">Tùy Chọn Nhập Dữ Liệu</h3>
              <button onClick={() => setShowImportConfirmModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>
            <div className="p-5 space-y-4 text-xs text-slate-600 font-medium">
              <p className="text-[13px] text-slate-800 font-bold">
                Tệp đã chọn: <span className="text-[#22a6b3]">{pendingImportFile.name}</span>
              </p>
              
              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                  <input
                    type="radio"
                    name="importMode"
                    checked={!importOverwrite}
                    onChange={() => setImportOverwrite(false)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-slate-700 block">Chỉ thêm mới sinh viên</span>
                    <span className="text-[11px] text-slate-400">Giữ nguyên danh sách sinh viên hiện tại trong lớp, chỉ bổ sung những sinh viên mới từ tệp Excel.</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-lg border border-red-100/50 hover:bg-red-50/20 transition-colors">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importOverwrite}
                    onChange={() => setImportOverwrite(true)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-red-600 block">Ghi đè toàn bộ danh sách lớp</span>
                    <span className="text-[11px] text-slate-400">Đồng bộ danh sách lớp khớp hoàn toàn với tệp Excel: sinh viên mới sẽ được thêm vào, sinh viên hiện có không nằm trong tệp Excel sẽ bị XÓA khỏi lớp học này.</span>
                  </div>
                </label>
              </div>

              {importOverwrite && (
                <div className="bg-red-50 border border-red-100 text-red-700 px-3.5 py-2.5 rounded-lg text-[11px] font-bold leading-normal">
                  ⚠️ Cảnh báo: Việc ghi đè sẽ hủy ghi danh bất kỳ sinh viên nào hiện tại KHÔNG có tên trong tệp Excel của bạn!
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowImportConfirmModal(false)} className="btn-secondary btn-sm">Hủy</button>
                <button type="button" onClick={executeExcelImport} className="bg-primary hover:bg-primary-700 text-white btn-sm font-bold rounded">
                  Xác nhận Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
