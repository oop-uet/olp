import { useState, useEffect, useCallback } from 'react'
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

  const fetchExercises = useCallback(async () => {
    setLoading(true)
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
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể xóa bài tập.')
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <ExerciseIcon className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-semibold text-gray-800">Quản lý bài tập</h1>
        </div>
        <Link to="/admin/exercises/new" className="btn-primary btn-sm">
          Tạo bài tập
        </Link>
      </div>

      {/* Table */}
      {loading ? (
        <PageLoader label="Đang tải danh sách bài tập..." />
      ) : exercises.length === 0 ? (
        <div className="card flex flex-col items-center justify-center border-dashed p-12 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <ExerciseIcon className="h-7 w-7" />
          </span>
          <p className="text-gray-500">Chưa có bài tập nào.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Tiêu đề</th>
                <th className="table-th">Độ khó</th>
                <th className="table-th">Thẻ OOP</th>
                <th className="table-th">Số test case</th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {exercises.map((exercise) => {
                const tags = parseOopTags(exercise.oopTags)
                return (
                  <tr key={exercise.id} className="hover:bg-gray-50">
                    <td className="table-td font-medium text-gray-900">
                      {exercise.title}
                    </td>
                    <td className="table-td">
                      <DifficultyBadge difficulty={exercise.difficulty} />
                    </td>
                    <td className="table-td">
                      {tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <span key={tag} className="badge-gray">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="table-td text-gray-700">
                      {Array.isArray(exercise.testCases)
                        ? exercise.testCases.length
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-3">
                        <Link
                          to={`/admin/exercises/${exercise.id}/edit`}
                          className="text-sm font-medium text-primary hover:text-primary-600"
                        >
                          Sửa
                        </Link>
                        <button
                          onClick={() => handleDelete(exercise)}
                          disabled={deletingId === exercise.id}
                          className="text-sm font-medium text-danger-600 hover:text-danger-700 disabled:opacity-50"
                        >
                          {deletingId === exercise.id ? 'Đang xóa...' : 'Xóa'}
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
    </div>
  )
}
