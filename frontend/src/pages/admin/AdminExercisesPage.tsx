import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExerciseRow {
  id: string
  title: string
  difficulty: string
  oopTags?: string[] | string
  testCases?: unknown[]
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseOopTags(tags: string[] | string | undefined): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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


export function AdminExercisesPage() {
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'title' | 'difficulty' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  const filteredExercises = useMemo(() => {
    if (!search.trim()) return exercises
    const q = search.toLowerCase()
    return exercises.filter((ex) => ex.title.toLowerCase().includes(q))
  }, [exercises, search])

  const sortedExercises = useMemo(() => {
    if (!sortField) return filteredExercises
    return [...filteredExercises].sort((a, b) => {
      let valA = a[sortField] || ''
      let valB = b[sortField] || ''
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredExercises, sortField, sortOrder])

  const paginatedExercises = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE
    return sortedExercises.slice(startIndex, startIndex + PAGE_SIZE)
  }, [sortedExercises, currentPage])

  const totalPages = Math.ceil(sortedExercises.length / PAGE_SIZE)

  const toggleSort = (field: 'title' | 'difficulty') => {
    setCurrentPage(1)
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const fetchExercises = useCallback(async () => {
    setLoading(true)
    setCurrentPage(1)
    try {
      const response = await api.get('/api/admin/exercises')
      setExercises(response.data)
    } catch {
      toast.error('Không thể tải danh sách bài tập. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchExercises()
  }, [fetchExercises])

  async function handleDelete(exercise: ExerciseRow) {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa bài tập "${exercise.title}"?`))
      return
    setDeletingId(exercise.id)
    try {
      await api.delete(`/api/admin/exercises/${exercise.id}`)
      setExercises((prev) => prev.filter((e) => e.id !== exercise.id))
      toast.success('Đã xóa bài tập.')
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể xóa bài tập.')
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-800 text-lg shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <ExerciseIcon className="h-5 w-5" />
          </span>
          <span>QUẢN LÝ BÀI TẬP</span>
        </div>
        <Link
          to="/admin/exercises/new"
          className="bg-primary hover:bg-primary-700 text-white text-[11px] font-bold px-4 py-2.5 rounded-lg transition-all active:scale-[0.97] shadow-sm cursor-pointer"
        >
          Tạo bài tập
        </Link>
      </div>

      {/* Search filter */}
      {exercises.length > 0 && (
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="input max-w-sm"
            placeholder="Tìm theo tiêu đề bài tập..."
          />
        </div>
      )}

      {/* Table */}
      {loading ? (
        <PageLoader label="Đang tải danh sách bài tập..." />
      ) : exercises.length === 0 ? (
        <div className="card flex flex-col items-center justify-center border-dashed p-12 text-center border-slate-200">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <ExerciseIcon className="h-7 w-7" />
          </span>
          <p className="text-gray-500 font-medium">Chưa có bài tập nào.</p>
        </div>
      ) : filteredExercises.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center border-slate-200">
          <ExerciseIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500 font-medium">Không tìm thấy bài tập nào khớp với từ khóa tìm kiếm.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 select-none">
                <th className="table-th text-center w-16 select-none">STT</th>
                <th
                  onClick={() => toggleSort('title')}
                  className="table-th cursor-pointer hover:bg-slate-100 transition-colors select-none"
                >
                  Tiêu đề {sortField === 'title' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th
                  onClick={() => toggleSort('difficulty')}
                  className="table-th cursor-pointer hover:bg-slate-100 transition-colors select-none"
                >
                  Độ khó {sortField === 'difficulty' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th className="table-th select-none">Thẻ OOP</th>
                <th className="table-th text-center select-none">Số test case</th>
                <th className="table-th text-center w-16 select-none"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {paginatedExercises.map((exercise, index) => {
                const tags = parseOopTags(exercise.oopTags)
                const rowNum = index + 1 + (currentPage - 1) * PAGE_SIZE
                return (
                  <tr key={exercise.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-b-0">
                    <td className="table-td text-center text-slate-400 font-bold">
                      {rowNum}
                    </td>
                    <td className="table-td font-semibold text-slate-800">
                      <Link
                        to={`/admin/exercises/${exercise.id}/edit`}
                        className="text-sky-600 hover:underline"
                      >
                        {exercise.title}
                      </Link>
                    </td>
                    <td className="table-td">
                      <DifficultyBadge difficulty={exercise.difficulty} />
                    </td>
                    <td className="table-td">
                      {tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((tag) => (
                            <span key={tag} className="tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="table-td text-center text-slate-600 font-medium">
                      {Array.isArray(exercise.testCases)
                        ? exercise.testCases.length
                        : '—'}
                    </td>
                    <td className="table-td text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(exercise)}
                        disabled={deletingId === exercise.id}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-all active:scale-[0.95] cursor-pointer disabled:opacity-50 inline-flex items-center justify-center"
                        title="Xóa bài tập"
                      >
                        {deletingId === exercise.id ? (
                          <span className="text-[10px] font-bold">...</span>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex justify-between items-center text-xs text-slate-500 p-4 border-t border-slate-100 bg-white">
              <div>
                Hiển thị {Math.min(sortedExercises.length, (currentPage - 1) * PAGE_SIZE + 1)} đến{' '}
                {Math.min(sortedExercises.length, currentPage * PAGE_SIZE)} trong tổng số{' '}
                {sortedExercises.length} bài tập
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
      )}
    </div>
  )
}
