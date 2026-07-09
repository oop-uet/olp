import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, cachedGet } from '../../lib/api'
import { PageLoader, ExerciseIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { ExerciseLibrary } from '../../components/instructor/ExerciseLibrary'

export interface Exercise {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  oop_tags: string[]
  starter_code: string
  creator?: {
    id: string
    username: string
  } | null
  created_at: string
  updated_at: string
}

type Tab = 'my-exercises' | 'library'

const DIFFICULTY_BADGE: Record<string, { className: string; label: string }> = {
  easy: { className: 'badge-green', label: 'Dễ' },
  medium: { className: 'badge-yellow', label: 'Trung bình' },
  hard: { className: 'badge-red', label: 'Khó' },
}

function parseOopTags(tags: unknown): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags as string[]
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function CreatorBadge({ username }: { username?: string | null }) {
  if (!username) return null
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
      @{username}
    </span>
  )
}

export function ExerciseManagerPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('my-exercises')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'title' | 'difficulty' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const navigate = useNavigate()

  useEffect(() => {
    if (activeTab === 'my-exercises') {
      fetchExercises()
    }
  }, [activeTab])

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
    const startIndex = (currentPage - 1) * pageSize
    return sortedExercises.slice(startIndex, startIndex + pageSize)
  }, [sortedExercises, currentPage, pageSize])

  const totalPages = Math.ceil(sortedExercises.length / pageSize)

  const toggleSort = (field: 'title' | 'difficulty') => {
    setCurrentPage(1)
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  async function fetchExercises() {
    setLoading(true)
    setCurrentPage(1)
    try {
      const response = await cachedGet('/api/exercises', undefined, { ttlMs: 60_000 })
      setExercises(response.data)
    } catch {
      toast.error('Không thể tải danh sách bài tập. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bài tập này?')) return

    setDeletingId(id)
    try {
      await api.delete(`/api/exercises/${id}`)
      setExercises((prev) => prev.filter((ex) => ex.id !== id))
      toast.success('Đã xóa bài tập.')
    } catch {
      toast.error('Không thể xóa bài tập. Vui lòng thử lại.')
    } finally {
      setDeletingId(null)
    }
  }

  function getDifficultyBadge(difficulty: string) {
    return DIFFICULTY_BADGE[difficulty] ?? { className: 'badge-gray', label: difficulty }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Quản lý bài tập</h1>
        {activeTab === 'my-exercises' && (
          <button onClick={() => navigate('/instructor/exercises/new')} className="btn-primary">
            Tạo bài tập
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('my-exercises')}
            className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'my-exercises'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Bài tập của tôi
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'library'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Thư viện bài tập
          </button>
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'my-exercises' && (
        <>
          {loading ? (
            <PageLoader label="Đang tải bài tập..." />
          ) : exercises.length === 0 ? (
            <div className="card flex flex-col items-center justify-center p-12 text-center">
              <ExerciseIcon className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-gray-500">Chưa có bài tập nào được tạo.</p>
              <button
                onClick={() => navigate('/instructor/exercises/new')}
                className="btn-primary btn-sm mt-4"
              >
                Tạo bài tập đầu tiên
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
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

              {filteredExercises.length === 0 ? (
                <div className="card flex flex-col items-center justify-center p-12 text-center">
                  <ExerciseIcon className="mb-3 h-10 w-10 text-gray-300" />
                  <p className="text-gray-500">Không tìm thấy bài tập nào.</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="table-th text-center w-16 select-none">STT</th>
                        <th
                          onClick={() => toggleSort('title')}
                          className="table-th cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        >
                          Tiêu đề {sortField === 'title' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                        </th>
                        <th
                          onClick={() => toggleSort('difficulty')}
                          className="table-th cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        >
                          Độ khó {sortField === 'difficulty' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                        </th>
                        <th className="table-th">Thẻ</th>
                        <th className="table-th text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {paginatedExercises.map((exercise: Exercise, index: number) => {
                        const badge = getDifficultyBadge(exercise.difficulty)
                        return (
                          <tr key={exercise.id} className="hover:bg-gray-50">
                            <td className="table-td text-center text-slate-500 font-bold">
                              {index + 1 + (currentPage - 1) * pageSize}
                            </td>
                            <td className="table-td font-medium text-gray-900">
                              <div className="flex flex-col items-start gap-1">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/instructor/exercises/${exercise.id}`)}
                                  className="text-left font-bold text-sky-600 hover:underline"
                                >
                                  {exercise.title}
                                </button>
                                <CreatorBadge username={exercise.creator?.username} />
                              </div>
                            </td>
                            <td className="table-td">
                              <span className={badge.className}>{badge.label}</span>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {parseOopTags(exercise.oop_tags ?? (exercise as unknown as Record<string, unknown>).oopTags).map((tag) => (
                                  <span key={tag} className="tag">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="table-td text-right">
                              <button
                                onClick={() => navigate(`/instructor/exercises/${exercise.id}`)}
                                className="btn-ghost btn-sm mr-2"
                              >
                                Xem
                              </button>
                              <button
                                onClick={() => navigate(`/instructor/exercises/${exercise.id}/testcases`)}
                                className="btn-ghost btn-sm mr-2"
                              >
                                Bộ test
                              </button>
                              <button
                                onClick={() => navigate(`/instructor/exercises/${exercise.id}/edit`)}
                                className="btn-secondary btn-sm mr-2"
                              >
                                Sửa
                              </button>
                              <button
                                onClick={() => handleDelete(exercise.id)}
                                disabled={deletingId === exercise.id}
                                className="btn-danger btn-sm"
                              >
                                {deletingId === exercise.id ? 'Đang xóa...' : 'Xóa'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {sortedExercises.length > 0 && (
                    <div className="flex justify-between items-center text-xs text-slate-500 p-4 border-t border-slate-100 bg-white flex-wrap gap-3">
                      <div>
                        Hiển thị {Math.min(sortedExercises.length, (currentPage - 1) * pageSize + 1)} đến{' '}
                        {Math.min(sortedExercises.length, currentPage * pageSize)} trong tổng số{' '}
                        {sortedExercises.length} bài tập
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
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'library' && <ExerciseLibrary />}
    </div>
  )
}
