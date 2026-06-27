import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
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

export function ExerciseManagerPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('my-exercises')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const navigate = useNavigate()

  useEffect(() => {
    if (activeTab === 'my-exercises') {
      fetchExercises()
    }
  }, [activeTab])

  async function fetchExercises() {
    setLoading(true)
    try {
      const response = await api.get('/api/exercises')
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
            <div className="card overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-th">Tiêu đề</th>
                    <th className="table-th">Độ khó</th>
                    <th className="table-th">Thẻ</th>
                    <th className="table-th text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {exercises.map((exercise) => {
                    const badge = getDifficultyBadge(exercise.difficulty)
                    return (
                      <tr key={exercise.id} className="hover:bg-gray-50">
                        <td className="table-td font-medium text-gray-900">{exercise.title}</td>
                        <td className="table-td">
                          <span className={badge.className}>{badge.label}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {parseOopTags(exercise.oop_tags ?? (exercise as unknown as Record<string, unknown>).oopTags).map((tag) => (
                              <span key={tag} className="badge-blue">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="table-td text-right">
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
            </div>
          )}
        </>
      )}

      {activeTab === 'library' && <ExerciseLibrary />}
    </div>
  )
}
