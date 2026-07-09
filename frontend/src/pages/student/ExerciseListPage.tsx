import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName } from '../../utils/semester'

interface Exercise {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  oopTags: string[]
  sectionId: string
  sectionName: string
  deadline: string | null
  isAssessment: boolean
  bestScore: number | null
  attemptCount: number
  maxSubmissions: number
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue'
}

const difficultyConfig: Record<Exercise['difficulty'], { label: string; className: string }> = {
  easy: { label: 'Dễ', className: 'badge-green' },
  medium: { label: 'Trung bình', className: 'badge-yellow' },
  hard: { label: 'Khó', className: 'badge-red' },
}

const statusConfig: Record<Exercise['status'], { label: string; className: string }> = {
  not_started: { label: 'Chưa làm', className: 'badge-gray' },
  in_progress: { label: 'Đang làm', className: 'badge-yellow' },
  completed: { label: 'Hoàn thành', className: 'badge-green' },
  overdue: { label: 'Quá hạn', className: 'badge-red' },
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Không có'
  return new Date(deadline).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ExerciseListPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'title' | 'difficulty' | 'deadline' | 'bestScore' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filteredEx = useMemo(() => {
    if (!search.trim()) return exercises
    const q = search.toLowerCase()
    return exercises.filter(
      (ex) =>
        ex.title.toLowerCase().includes(q) ||
        ex.sectionName.toLowerCase().includes(q)
    )
  }, [exercises, search])

  const sortedEx = useMemo(() => {
    if (!sortField) return filteredEx
    return [...filteredEx].sort((a, b) => {
      let valA = a[sortField] ?? ''
      let valB = b[sortField] ?? ''
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredEx, sortField, sortOrder])

  const paginatedEx = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedEx.slice(startIndex, startIndex + pageSize)
  }, [sortedEx, currentPage, pageSize])

  const totalPages = Math.ceil(sortedEx.length / pageSize)

  const toggleSort = (field: 'title' | 'difficulty' | 'deadline' | 'bestScore') => {
    setCurrentPage(1)
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  useEffect(() => {
    fetchExercises()
  }, [])

  async function fetchExercises() {
    try {
      setLoading(true)
      setError(null)
      setCurrentPage(1)
      const response = await api.get('/api/students/exercises')
      setExercises(response.data.exercises ?? [])
    } catch {
      setError('Không thể tải danh sách bài tập. Vui lòng thử lại.')
      toast.error('Không thể tải danh sách bài tập. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải bài tập..." />
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bài tập</h1>
        </div>
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <ExerciseIcon className="h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">{error}</p>
          <button onClick={fetchExercises} className="btn-primary mt-2">
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  if (exercises.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bài tập</h1>
        </div>
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-center">
          <ExerciseIcon className="h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">Chưa có bài tập nào được giao</p>
          <p className="text-sm text-gray-500">Hãy quay lại sau để xem các bài tập mới.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bài tập</h1>
          <p className="mt-1 text-sm text-gray-600">
            {filteredEx.length} bài tập được tìm thấy trong tổng số {exercises.length} bài tập được giao
          </p>
        </div>
        <div>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="input text-xs py-2 px-3 min-w-[280px] bg-white border-slate-200"
            placeholder="Tìm kiếm bài tập..."
          />
        </div>
      </div>

      {/* Exercise table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          {filteredEx.length === 0 ? (
            <p className="text-center text-slate-500 py-8 text-xs font-medium bg-white">
              Không tìm thấy bài tập nào khớp với từ khóa.
            </p>
          ) : (
            <>
              <table className="min-w-full divide-y divide-gray-200 bg-white">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-th text-center w-16 select-none">STT</th>
                    <th
                      onClick={() => toggleSort('title')}
                      className="table-th cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                    >
                      Bài tập {sortField === 'title' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th
                      onClick={() => toggleSort('difficulty')}
                      className="table-th cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                    >
                      Độ khó {sortField === 'difficulty' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th className="table-th">Lớp</th>
                    <th
                      onClick={() => toggleSort('deadline')}
                      className="table-th cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                    >
                      Hạn nộp {sortField === 'deadline' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th className="table-th">Trạng thái</th>
                    <th
                      onClick={() => toggleSort('bestScore')}
                      className="table-th text-right cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                    >
                      Điểm cao nhất {sortField === 'bestScore' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                    <th className="table-th text-right">Lần nộp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedEx.map((exercise: Exercise, index: number) => (
                    <tr key={`${exercise.id}-${exercise.sectionId}`} className="hover:bg-gray-50">
                      <td className="table-td text-center text-slate-500 font-bold">
                        {index + 1 + (currentPage - 1) * pageSize}
                      </td>
                      <td className="table-td">
                        <Link
                          to={`/student/exercises/${exercise.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {exercise.title}
                        </Link>
                        {exercise.oopTags && exercise.oopTags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {exercise.oopTags.map((tag) => (
                              <span key={tag} className="tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="table-td">
                        <span className={difficultyConfig[exercise.difficulty].className}>
                          {difficultyConfig[exercise.difficulty].label}
                        </span>
                      </td>
                      <td className="table-td text-gray-700">{formatSectionDisplayName(exercise.sectionName)}</td>
                      <td className="table-td text-gray-700">{formatDeadline(exercise.deadline)}</td>
                      <td className="table-td">
                        <span className={statusConfig[exercise.status].className}>
                          {statusConfig[exercise.status].label}
                        </span>
                      </td>
                      <td className="table-td text-right font-medium text-gray-900">
                        {exercise.bestScore === null ? '—' : `${exercise.bestScore}%`}
                      </td>
                      <td className="table-td text-right text-gray-700">
                        {exercise.attemptCount}/{exercise.maxSubmissions}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {sortedEx.length > 0 && (
                <div className="flex justify-between items-center text-xs text-slate-500 p-4 border-t border-slate-100 bg-white flex-wrap gap-3">
                  <div>
                    Hiển thị {Math.min(sortedEx.length, (currentPage - 1) * pageSize + 1)} đến{' '}
                    {Math.min(sortedEx.length, currentPage * pageSize)} trong tổng số{' '}
                    {sortedEx.length} bài tập
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {totalPages > 1 && (
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
                    )}

                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <span>Số dòng hiển thị:</span>
                      <select
                        value={pageSize === 999999 ? 'all' : pageSize}
                        onChange={(e) => {
                          const val = e.target.value
                          setPageSize(val === 'all' ? 999999 : Number(val))
                          setCurrentPage(1)
                        }}
                        className="h-8 rounded border border-slate-200 bg-white px-2 outline-none cursor-pointer text-slate-700 font-semibold"
                      >
                        <option value="5">5</option>
                        <option value="10">10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                        <option value="all">Tất cả</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
