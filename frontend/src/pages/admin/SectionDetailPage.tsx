import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner, SectionIcon, StudentsIcon, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SectionInstructor {
  id: string
  username: string
  fullName: string
  email: string
  isPrimary?: boolean
}

interface SectionInfo {
  id: string
  name: string
  semester: string
  instructor: SectionInstructor | null
  instructors?: SectionInstructor[]
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
  difficulty: string
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

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('vi-VN')
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  switch (difficulty) {
    case 'easy':
      return <span className="badge-green">Dễ</span>
    case 'medium':
      return <span className="badge-yellow">Trung bình</span>
    case 'hard':
      return <span className="badge-red">Khó</span>
    default:
      return <span className="badge-gray">{difficulty}</span>
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SectionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<SectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // ─── Assign exercise state ─────────────────────────────────────────────
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [availableExercises, setAvailableExercises] = useState<AvailableExercise[]>([])
  const [assignExerciseId, setAssignExerciseId] = useState('')
  const [assignDeadline, setAssignDeadline] = useState('')
  const [assignIsAssessment, setAssignIsAssessment] = useState(false)
  const [assignSubmitting, setAssignSubmitting] = useState(false)

  // Student list sorting, search, and pagination
  const [studentSearch, setStudentSearch] = useState('')
  const [studentSortField, setStudentSortField] = useState<'studentId' | 'fullName' | 'email' | ''>('')
  const [studentSortOrder, setStudentSortOrder] = useState<'asc' | 'desc'>('asc')
  const [studentCurrentPage, setStudentCurrentPage] = useState(1)
  const STUDENT_PAGE_SIZE = 10

  const filteredStudents = useMemo(() => {
    const raw = detail?.students ?? []
    if (!studentSearch.trim()) return raw
    const q = studentSearch.toLowerCase()
    return raw.filter(
      (s) =>
        (s.studentId || '').toLowerCase().includes(q) ||
        (s.fullName || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.username || '').toLowerCase().includes(q)
    )
  }, [detail?.students, studentSearch])

  const sortedStudents = useMemo(() => {
    if (!studentSortField) return filteredStudents
    return [...filteredStudents].sort((a, b) => {
      const valA = (a[studentSortField] || '').toLowerCase()
      const valB = (b[studentSortField] || '').toLowerCase()
      if (valA < valB) return studentSortOrder === 'asc' ? -1 : 1
      if (valA > valB) return studentSortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredStudents, studentSortField, studentSortOrder])

  const paginatedStudents = useMemo(() => {
    const startIndex = (studentCurrentPage - 1) * STUDENT_PAGE_SIZE
    return sortedStudents.slice(startIndex, startIndex + STUDENT_PAGE_SIZE)
  }, [sortedStudents, studentCurrentPage])

  const studentTotalPages = Math.ceil(sortedStudents.length / STUDENT_PAGE_SIZE)

  const toggleStudentSort = (field: 'studentId' | 'fullName' | 'email') => {
    setStudentCurrentPage(1)
    if (studentSortField === field) {
      setStudentSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setStudentSortField(field)
      setStudentSortOrder('asc')
    }
  }

  // Exercises list sorting, search, and pagination
  const [exSearch, setExSearch] = useState('')
  const [exSortField, setExSortField] = useState<'title' | 'difficulty' | 'deadline' | ''>('')
  const [exSortOrder, setExSortOrder] = useState<'asc' | 'desc'>('asc')
  const [exCurrentPage, setExCurrentPage] = useState(1)
  const EX_PAGE_SIZE = 10

  const filteredEx = useMemo(() => {
    const raw = detail?.exercises ?? []
    if (!exSearch.trim()) return raw
    const q = exSearch.toLowerCase()
    return raw.filter((e) => e.title.toLowerCase().includes(q))
  }, [detail?.exercises, exSearch])

  const sortedEx = useMemo(() => {
    if (!exSortField) return filteredEx
    return [...filteredEx].sort((a, b) => {
      let valA = a[exSortField] || ''
      let valB = b[exSortField] || ''
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return exSortOrder === 'asc' ? -1 : 1
      if (valA > valB) return exSortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredEx, exSortField, exSortOrder])

  const paginatedEx = useMemo(() => {
    const startIndex = (exCurrentPage - 1) * EX_PAGE_SIZE
    return sortedEx.slice(startIndex, startIndex + EX_PAGE_SIZE)
  }, [sortedEx, exCurrentPage])

  const exTotalPages = Math.ceil(sortedEx.length / EX_PAGE_SIZE)

  const toggleExSort = (field: 'title' | 'difficulty' | 'deadline') => {
    setExCurrentPage(1)
    if (exSortField === field) {
      setExSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setExSortField(field)
      setExSortOrder('asc')
    }
  }

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setStudentCurrentPage(1)
    setExCurrentPage(1)
    try {
      const response = await api.get(`/api/admin/sections/${id}/detail`)
      setDetail(response.data)
    } catch {
      toast.error('Không thể tải thông tin lớp. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  // ─── Actions ─────────────────────────────────────────────────────────────

  async function handleRemoveStudent(student: SectionStudent) {
    if (!id) return
    if (
      !window.confirm(
        `Gỡ sinh viên "${student.fullName || student.username}" khỏi lớp?`
      )
    )
      return
    setBusyKey(`student-${student.userId}`)
    try {
      await api.delete(`/api/admin/sections/${id}/students/${student.userId}`)
      toast.success('Đã gỡ sinh viên khỏi lớp.')
      await fetchDetail()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể gỡ sinh viên.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleRemoveExercise(exercise: SectionExercise) {
    if (!id) return
    if (!window.confirm(`Gỡ bài tập "${exercise.title}" khỏi lớp?`)) return
    setBusyKey(`exercise-${exercise.exerciseId}`)
    try {
      await api.delete(`/api/admin/sections/${id}/exercises/${exercise.exerciseId}`)
      toast.success('Đã gỡ bài tập khỏi lớp.')
      await fetchDetail()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể gỡ bài tập.')
    } finally {
      setBusyKey(null)
    }
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
      const response = await api.get('/api/admin/exercises')
      setAvailableExercises(response.data)
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(
        axiosErr.response?.data?.error?.message || 'Không thể tải danh sách bài tập.'
      )
    }
  }

  async function handleAssignExercise(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !assignExerciseId) return
    setAssignSubmitting(true)
    try {
      await api.post(`/api/admin/sections/${id}/assign-exercise`, {
        exercise_id: assignExerciseId,
        ...(assignDeadline ? { deadline: new Date(assignDeadline).toISOString() } : {}),
        is_assessment: assignIsAssessment,
      })
      toast.success('Đã gán bài tập.')
      setShowAssignForm(false)
      await fetchDetail()
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể gán bài tập.')
    } finally {
      setAssignSubmitting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return <PageLoader label="Đang tải thông tin lớp..." />
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Link to="/admin/sections" className="text-sm font-medium text-primary hover:text-primary-700">
          ← Quay lại danh sách lớp
        </Link>
        <div className="card flex flex-col items-center justify-center border-dashed p-12 text-center">
          <p className="text-gray-500">Không tìm thấy lớp học phần.</p>
        </div>
      </div>
    )
  }

  const { section, exercises, studentCount, exerciseCount } = detail

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/admin/sections"
        className="inline-flex text-sm font-medium text-primary hover:text-primary-700"
      >
        ← Quay lại danh sách lớp
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <SectionIcon className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-800">{section.name}</h1>
              <span className="badge-blue">{section.semester}</span>
            </div>
            <p className="text-sm text-gray-500">
              Giảng viên:{' '}
              {section.instructors && section.instructors.length > 0 ? (
                <span className="inline-flex flex-wrap gap-1.5 align-middle">
                  {section.instructors.map((instructor) => (
                    <span
                      key={instructor.id}
                      className="inline-flex items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-800"
                    >
                      {instructor.fullName || instructor.username}
                      {instructor.isPrimary && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                          Chính
                        </span>
                      )}
                    </span>
                  ))}
                </span>
              ) : section.instructor ? (
                <span className="font-medium text-gray-700">
                  {section.instructor.fullName || section.instructor.username}
                </span>
              ) : (
                <span className="italic text-gray-400">Chưa phân công</span>
              )}
            </p>
          </div>
        </div>
        <Link
          to={`/admin/sections/${section.id}/schedule`}
          className="btn-primary btn-sm inline-flex items-center gap-2"
        >
          <ExerciseIcon className="h-4 w-4" />
          Phân bài theo tuần
        </Link>
      </div>

      {/* Students */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between border-b border-gray-200 px-5 py-4 gap-4">
          <div className="flex items-center gap-2">
            <StudentsIcon className="h-5 w-5 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">
              Sinh viên ({studentCount})
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value)
                setStudentCurrentPage(1)
              }}
              className="input text-xs py-1.5 px-3 max-w-xs"
              placeholder="Tìm sinh viên..."
            />
          </div>
        </div>
        {filteredStudents.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            Không tìm thấy sinh viên nào.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase select-none">
                  <th className="px-4 py-3 text-center w-16 text-slate-500 font-black">STT</th>
                  <th
                    onClick={() => toggleStudentSort('studentId')}
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 font-black"
                  >
                    MSSV {studentSortField === 'studentId' ? (studentSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th
                    onClick={() => toggleStudentSort('fullName')}
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 font-black"
                  >
                    Họ tên {studentSortField === 'fullName' ? (studentSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th
                    onClick={() => toggleStudentSort('email')}
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 font-black"
                  >
                    Email {studentSortField === 'email' ? (studentSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th className="px-4 py-3 text-center w-36 text-slate-500 font-black">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {paginatedStudents.map((student: SectionStudent, index: number) => (
                  <tr key={student.enrollmentId} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-2.5 text-center text-slate-400 font-bold">
                      {index + 1 + (studentCurrentPage - 1) * STUDENT_PAGE_SIZE}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">
                      {student.studentId || student.username}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{student.fullName || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600 font-medium">{student.email}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => handleRemoveStudent(student)}
                        disabled={busyKey === `student-${student.userId}`}
                        className="bg-[#e67e22] hover:bg-[#d35400] text-white text-[11px] font-bold px-3 py-1.5 rounded transition-all active:scale-[0.97] cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        Gỡ khỏi lớp
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {studentTotalPages > 1 && (
          <div className="flex justify-between items-center text-xs text-slate-500 p-4 border-t border-slate-100 bg-white">
            <div>
              Hiển thị {Math.min(sortedStudents.length, (studentCurrentPage - 1) * STUDENT_PAGE_SIZE + 1)} đến{' '}
              {Math.min(sortedStudents.length, studentCurrentPage * STUDENT_PAGE_SIZE)} trong tổng số{' '}
              {sortedStudents.length} sinh viên
            </div>
            <div className="flex gap-1">
              <button
                disabled={studentCurrentPage === 1}
                onClick={() => setStudentCurrentPage(studentCurrentPage - 1)}
                className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent font-bold text-slate-600"
              >
                Trước
              </button>
              {[...Array(studentTotalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStudentCurrentPage(i + 1)}
                  className={`px-2.5 py-1 border rounded font-bold ${
                    studentCurrentPage === i + 1
                      ? 'bg-primary text-white border-primary'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={studentCurrentPage === studentTotalPages}
                onClick={() => setStudentCurrentPage(studentCurrentPage + 1)}
                className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent font-bold text-slate-600"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Exercises */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between border-b border-gray-200 px-5 py-4 gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <ExerciseIcon className="h-5 w-5 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-700">
                Bài tập đã gán ({exerciseCount})
              </h2>
            </div>
            <input
              type="text"
              value={exSearch}
              onChange={(e) => {
                setExSearch(e.target.value)
                setExCurrentPage(1)
              }}
              className="input text-xs py-1.5 px-3 max-w-xs"
              placeholder="Tìm bài tập..."
            />
          </div>
          <button onClick={toggleAssignForm} className="btn-primary btn-sm">
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
              <label htmlFor="assign-exercise" className="label">
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
                  .filter(
                    (ex) => !exercises.some((a) => a.exerciseId === ex.id)
                  )
                  .map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="assign-deadline" className="label">
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
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={assignIsAssessment}
                onChange={(e) => setAssignIsAssessment(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Bài đánh giá (chống gian lận)
            </label>
            <div className="flex justify-end gap-3">
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

        {filteredEx.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">
            Không tìm thấy bài tập nào.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase select-none">
                  <th className="px-4 py-3 text-center w-16 text-slate-500 font-black">STT</th>
                  <th
                    onClick={() => toggleExSort('title')}
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 font-black"
                  >
                    Tiêu đề {exSortField === 'title' ? (exSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th
                    onClick={() => toggleExSort('difficulty')}
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 font-black"
                  >
                    Độ khó {exSortField === 'difficulty' ? (exSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th
                    onClick={() => toggleExSort('deadline')}
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors text-slate-500 font-black"
                  >
                    Hạn nộp {exSortField === 'deadline' ? (exSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th className="px-4 py-3 text-center w-28 text-slate-500 font-black">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {paginatedEx.map((exercise: SectionExercise, index: number) => (
                  <tr key={exercise.assignmentId} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-2.5 text-center text-slate-400 font-bold">
                      {index + 1 + (exCurrentPage - 1) * EX_PAGE_SIZE}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{exercise.title}</span>
                        {exercise.isAssessment && (
                          <span className="badge-blue font-bold text-[10px]">Đánh giá</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <DifficultyBadge difficulty={exercise.difficulty} />
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 font-medium">
                      {formatDateTime(exercise.deadline)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => handleRemoveExercise(exercise)}
                        disabled={busyKey === `exercise-${exercise.exerciseId}`}
                        className="bg-[#e67e22] hover:bg-[#d35400] text-white text-[11px] font-bold px-3 py-1.5 rounded transition-all active:scale-[0.97] cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        Gỡ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {exTotalPages > 1 && (
          <div className="flex justify-between items-center text-xs text-slate-500 p-4 border-t border-slate-100 bg-white">
            <div>
              Hiển thị {Math.min(sortedEx.length, (exCurrentPage - 1) * EX_PAGE_SIZE + 1)} đến{' '}
              {Math.min(sortedEx.length, exCurrentPage * EX_PAGE_SIZE)} trong tổng số{' '}
              {sortedEx.length} bài tập
            </div>
            <div className="flex gap-1">
              <button
                disabled={exCurrentPage === 1}
                onClick={() => setExCurrentPage(exCurrentPage - 1)}
                className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent font-bold text-slate-600"
              >
                Trước
              </button>
              {[...Array(exTotalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setExCurrentPage(i + 1)}
                  className={`px-2.5 py-1 border rounded font-bold ${
                    exCurrentPage === i + 1
                      ? 'bg-primary text-white border-primary'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={exCurrentPage === exTotalPages}
                onClick={() => setExCurrentPage(exCurrentPage + 1)}
                className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent font-bold text-slate-600"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
