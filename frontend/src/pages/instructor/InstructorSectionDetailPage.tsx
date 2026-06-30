import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AxiosError } from 'axios'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'

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

interface AvailableExercise {
  id: string
  title: string
  difficulty: string
  oopTags?: string[] | string
}

interface StudentProgress {
  completedExercises: number
  averageScore: number
  rank: number | null
}

const DIFFICULTY_BADGE: Record<string, { className: string; label: string }> = {
  easy: { className: 'badge-green', label: 'Dễ' },
  medium: { className: 'badge-yellow', label: 'Trung bình' },
  hard: { className: 'badge-red', label: 'Khó' },
}

function getDifficultyBadge(difficulty: string) {
  return DIFFICULTY_BADGE[difficulty] ?? { className: 'badge-gray', label: difficulty }
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Không có hạn'
  const date = new Date(deadline)
  if (Number.isNaN(date.getTime())) return 'Không có hạn'
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function InstructorSectionDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [detail, setDetail] = useState<SectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // ─── Search & Pagination states ─────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(30)
  const [currentPage, setCurrentPage] = useState(1)

  // ─── Modal & Action states ──────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false)
  const [newStudentId, setNewStudentId] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const [showEditModal, setShowEditModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState<SectionStudent | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null)
  const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Student progress view states ────────────────────────────────────────
  const [progressStudent, setProgressStudent] = useState<SectionStudent | null>(null)
  const [progressData, setProgressData] = useState<StudentProgress | null>(null)
  const [loadingProgress, setLoadingProgress] = useState(false)

  // ─── Assign exercise state ─────────────────────────────────────────────
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [availableExercises, setAvailableExercises] = useState<AvailableExercise[]>([])
  const [assignExerciseId, setAssignExerciseId] = useState('')
  const [assignDeadline, setAssignDeadline] = useState('')
  const [assignIsAssessment, setAssignIsAssessment] = useState(false)
  const [assignSubmitting, setAssignSubmitting] = useState(false)

  useEffect(() => {
    if (id) {
      fetchDetail()
    }
  }, [id])

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

  async function handleRemoveExercise(exerciseId: string, title: string) {
    if (!window.confirm(`Bạn có chắc chắn muốn gỡ bài tập "${title}" khỏi lớp này?`)) return

    setRemovingId(exerciseId)
    try {
      await api.delete(`/api/instructor/sections/${id}/exercises/${exerciseId}`)
      toast.success('Đã gỡ bài tập khỏi lớp.')
      await fetchDetail()
    } catch {
      toast.error('Không thể gỡ bài tập. Vui lòng thử lại.')
    } finally {
      setRemovingId(null)
    }
  }

  // ─── Student Roster Management Handlers ──────────────────────────────────

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!newStudentId || !newFullName || !newEmail) return
    setAddLoading(true)
    try {
      await api.post(`/api/instructor/sections/${id}/students`, {
        studentId: newStudentId,
        fullName: newFullName,
        email: newEmail,
      })
      toast.success('Đã ghi danh sinh viên mới.')
      setShowAddModal(false)
      setNewStudentId('')
      setNewFullName('')
      setNewEmail('')
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

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
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
        })
        const report = response.data
        toast.success(`Đã nhập dữ liệu! Thành công: ${report.imported}, Bỏ qua: ${report.skipped.length}`)
        await fetchDetail()
      } catch (err) {
        toast.error('Lỗi khi tải lên tệp import.')
      } finally {
        setImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
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

  // ─── Assign exercise handlers ──────────────────────────────────────────

  async function toggleAssignForm() {
    if (showAssignForm) {
      setShowAssignForm(false)
      return
    }
    setShowAssignForm(true)
    setAssignExerciseId('')
    setAssignDeadline('')
    setAssignIsAssessment(false)
    try {
      const response = await api.get('/api/exercises')
      setAvailableExercises(response.data)
    } catch {
      toast.error('Không thể tải danh sách bài tập.')
    }
  }

  async function handleAssignExercise(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !assignExerciseId) return
    setAssignSubmitting(true)
    try {
      await api.post(`/api/exercises/${assignExerciseId}/assign`, {
        section_id: id,
        ...(assignDeadline ? { deadline: new Date(assignDeadline).toISOString() } : {}),
        is_assessment: assignIsAssessment,
      })
      toast.success('Đã gán bài tập.')
      setShowAssignForm(false)
      await fetchDetail()
    } catch (error) {
      const message =
        (error as AxiosError<{ error?: { message?: string } }>)?.response?.data?.error
          ?.message || 'Không thể gán bài tập.'
      toast.error(message)
    } finally {
      setAssignSubmitting(false)
    }
  }

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

  if (!detail) {
    return null
  }

  const { section, students, exercises, studentCount, exerciseCount } = detail

  // ─── Client Filter & Search ──────────────────────────────────────────────
  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      s.studentId.toLowerCase().includes(q) ||
      (s.fullName && s.fullName.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q))
    )
  })

  // Pagination
  const totalPages = Math.ceil(filteredStudents.length / pageSize)
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="space-y-6">
      
      {/* Authentic UET Breadcrumb Navigation */}
      <div className="text-xs text-slate-500 font-medium py-1 px-3 bg-[#fafafa] border-b border-slate-100 rounded flex gap-1.5 items-center">
        <Link to="/instructor/classes" className="text-[#17a2b8] hover:underline">Trang chủ</Link>
        <span>/</span>
        <span className="text-slate-400">Quản lý lớp học</span>
      </div>

      {/* Page Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-800">{section.name}</h1>
          <span className="bg-[#4f81bd] text-white text-xs px-2.5 py-0.5 rounded font-bold">{section.semester}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/instructor/classes/${section.id}/schedule`}
            className="btn bg-[#4f81bd] text-white hover:bg-[#3d6594] btn-sm inline-flex items-center gap-1.5"
          >
            {/* Calendar Icon */}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Phân bài theo tuần
          </Link>
          <Link to="/instructor/leaderboard" className="btn-secondary btn-sm inline-flex items-center gap-1.5">
            {/* Trophy Icon */}
            <svg className="h-4 w-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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
        <div className="flex flex-wrap items-center justify-between bg-[#17a2b8] text-white px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">☰</span>
            <h2 className="font-bold text-sm tracking-wide uppercase">Danh Sách Sinh Viên ({studentCount})</h2>
            <span className="bg-[#4f81bd] text-white text-[11px] font-bold px-2 py-0.5 rounded ml-2">
              {section.name}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2 sm:mt-0">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-[#00868b] hover:bg-[#007075] text-white text-xs font-bold px-3 py-1.5 rounded transition-all active:scale-95"
            >
              Thêm Sinh Viên
            </button>
            <button
              onClick={triggerExcelImport}
              disabled={importing}
              className="bg-[#00868b] hover:bg-[#007075] text-white text-xs font-bold px-3 py-1.5 rounded transition-all active:scale-95 disabled:opacity-50"
            >
              {importing ? 'Đang import...' : 'Import từ Excel'}
            </button>
            <button
              onClick={handleExportRoster}
              className="bg-[#00868b] hover:bg-[#007075] text-white text-xs font-bold px-3 py-1.5 rounded transition-all active:scale-95"
            >
              Xuất ra Excel
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Table Controls (Show Entries & Search) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-medium">
            <div className="flex items-center gap-1.5">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#17a2b8]"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
              <span>entries</span>
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <span>Search:</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Tìm tên, mã sinh viên, email..."
                className="border border-slate-200 rounded px-2.5 py-1.5 w-full sm:w-60 focus:outline-none focus:ring-1 focus:ring-[#17a2b8]"
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
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase">
                    <th className="px-4 py-3 text-center w-12">#</th>
                    <th className="px-4 py-3 text-left">MSSV</th>
                    <th className="px-4 py-3 text-left">Sinh viên</th>
                    <th className="px-4 py-3 text-left">Lớp học phần</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-center w-60">Chức năng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {paginatedStudents.map((student, idx) => {
                    const rowNum = (currentPage - 1) * pageSize + idx + 1
                    return (
                      <tr key={student.enrollmentId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 text-center text-slate-400 font-semibold">{rowNum}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => handleViewProgress(student)}
                            className="font-bold text-[#00bcd4] hover:underline hover:text-[#4f81bd]"
                          >
                            {student.studentId}
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => handleViewProgress(student)}
                            className="font-semibold text-[#00bcd4] hover:underline hover:text-[#4f81bd]"
                          >
                            {student.fullName || student.username}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 font-medium">{section.name}</td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono">{student.email}</td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Sửa button (green) */}
                            <button
                              onClick={() => openEditModal(student)}
                              className="btn-success btn-sm font-bold text-white px-2.5 py-1 rounded"
                            >
                              Sửa
                            </button>
                            {/* Reset Mật Khẩu (gray) */}
                            <button
                              onClick={() => handleResetPassword(student)}
                              disabled={resettingPasswordId === student.userId}
                              className="btn-gray btn-sm font-bold px-2 py-1 rounded disabled:opacity-5"
                            >
                              {resettingPasswordId === student.userId ? 'Đang reset...' : 'reset mật khẩu'}
                            </button>
                            {/* Xóa button (orange) */}
                            <button
                              onClick={() => handleRemoveStudent(student)}
                              disabled={removingStudentId === student.userId}
                              className="btn-danger btn-sm font-bold text-white px-2 py-1 rounded"
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
                        ? 'bg-[#17a2b8] text-white border-[#17a2b8]'
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
      </div>

      {/* Exercises Card - Styled as UET teal banner */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between bg-[#17a2b8] text-white px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-lg">☰</span>
            <h2 className="font-bold text-sm tracking-wide uppercase">Danh Sách Bài Tập Đã Gán ({exerciseCount})</h2>
          </div>
          <button
            onClick={toggleAssignForm}
            className="bg-[#00868b] hover:bg-[#007075] text-white text-xs font-bold px-3 py-1.5 rounded transition-all active:scale-95"
          >
            {showAssignForm ? 'Đóng' : 'Gán bài tập'}
          </button>
        </div>

        {/* Assign form */}
        {showAssignForm && (
          <form
            onSubmit={handleAssignExercise}
            className="space-y-4 border-b border-gray-200 bg-gray-50 px-5 py-4"
          >
            <div>
              <label htmlFor="assign-exercise" className="label text-slate-600">
                Bài tập
              </label>
              <select
                id="assign-exercise"
                required
                value={assignExerciseId}
                onChange={(e) => setAssignExerciseId(e.target.value)}
                className="input"
              >
                <option value="">-- Chọn bài tập --</option>
                {availableExercises
                  .filter((ex) => !exercises.some((a) => a.exerciseId === ex.id))
                  .map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="assign-deadline" className="label text-slate-600">
                Hạn nộp (tùy chọn)
              </label>
              <input
                id="assign-deadline"
                type="datetime-local"
                value={assignDeadline}
                onChange={(e) => setAssignDeadline(e.target.value)}
                className="input"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase">
              <input
                type="checkbox"
                checked={assignIsAssessment}
                onChange={(e) => setAssignIsAssessment(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-[#17a2b8]"
              />
              Bài kiểm tra (Bắt buộc chạy Fullscreen chống gian lận)
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAssignForm(false)}
                className="btn-secondary btn-sm"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={assignSubmitting || !assignExerciseId}
                className="btn-primary btn-sm"
              >
                {assignSubmitting ? (
                  <>
                    <Spinner /> Đang gán...
                  </>
                ) : (
                  'Gán'
                )}
              </button>
            </div>
          </form>
        )}

        {exercises.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">Chưa có bài tập nào được gán cho lớp.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase">
                  <th className="px-5 py-3 text-left">Tiêu đề</th>
                  <th className="px-5 py-3 text-left">Độ khó</th>
                  <th className="px-5 py-3 text-left">Hạn nộp</th>
                  <th className="px-5 py-3 text-left">Loại bài tập</th>
                  <th className="px-5 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {exercises.map((exercise) => {
                  const badge = getDifficultyBadge(exercise.difficulty)
                  return (
                    <tr key={exercise.assignmentId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-800">{exercise.title}</td>
                      <td className="px-5 py-3">
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 font-medium">{formatDeadline(exercise.deadline)}</td>
                      <td className="px-5 py-3">
                        {exercise.isAssessment ? (
                          <span className="badge-yellow">Kiểm tra (Fullscreen)</span>
                        ) : (
                          <span className="badge-gray">Luyện tập</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleRemoveExercise(exercise.exerciseId, exercise.title)}
                          disabled={removingId === exercise.exerciseId}
                          className="btn-danger btn-sm text-white px-2 py-1 rounded"
                        >
                          {removingId === exercise.exerciseId ? 'Đang gỡ...' : 'Gỡ'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── ADD STUDENT MODAL ────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-lg border border-slate-100 w-full max-w-md overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between bg-[#17a2b8] text-white px-5 py-3.5">
              <h3 className="font-bold text-sm uppercase tracking-wide">Thêm Sinh Viên Thủ Công</h3>
              <button onClick={() => setShowAddModal(false)} className="text-white hover:text-slate-200 font-bold text-sm">✕</button>
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
              <div>
                <label className="label text-slate-600" htmlFor="new-email">Email</label>
                <input
                  id="new-email"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value.trim())}
                  placeholder="Ví dụ: mssv@vnu.edu.vn"
                  className="input"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary btn-sm">Hủy</button>
                <button type="submit" disabled={addLoading} className="btn-primary btn-sm">
                  {addLoading ? <Spinner /> : 'Thêm ghi danh'}
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
            <div className="flex items-center justify-between bg-[#17a2b8] text-white px-5 py-3.5">
              <h3 className="font-bold text-sm uppercase tracking-wide">Cập Nhật Thông Tin Sinh Viên</h3>
              <button onClick={() => setShowEditModal(false)} className="text-white hover:text-slate-200 font-bold text-sm">✕</button>
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
            <div className="flex items-center justify-between bg-[#17a2b8] text-white px-5 py-3.5">
              <h3 className="font-bold text-sm uppercase tracking-wide">
                Tiến độ — {progressStudent.fullName || progressStudent.username} ({progressStudent.studentId})
              </h3>
              <button onClick={closeProgress} className="text-white hover:text-slate-200 font-bold text-sm">✕</button>
            </div>
            <div className="p-5">
              {loadingProgress ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                  <Spinner /> Đang tải tiến độ...
                </div>
              ) : progressData ? (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-2xl font-bold text-[#17a2b8]">
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

    </div>
  )
}
