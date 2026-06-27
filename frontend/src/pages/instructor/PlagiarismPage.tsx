import { useEffect, useState } from 'react'
import { AxiosError } from 'axios'
import { api } from '../../lib/api'
import { toast } from '../../stores/toast.store'
import { PageLoader, Spinner, SubmissionIcon, XCircleIcon } from '../../components/ui'

// --- Types ---

interface ExerciseOption {
  id: string
  title: string
}

interface SectionOption {
  id: string
  name: string
  semester: string
}

interface PlagiarismPair {
  studentAId: string
  studentAName: string
  studentBId: string
  studentBName: string
  submissionAId: string
  submissionBId: string
  similarity: number
}

interface PlagiarismReport {
  exerciseId: string
  totalSubmissions: number
  comparedPairs: number
  threshold: number
  pairs: PlagiarismPair[]
}

interface SubmissionDetail {
  id: string
  code: string
  student?: { id: string; username: string; fullName?: string | null } | null
  submittedAt: string
}

// --- Helpers ---

function similarityBadgeClass(similarity: number): string {
  if (similarity >= 0.8) return 'badge-red'
  if (similarity >= 0.6) return 'badge-yellow'
  return 'badge-gray'
}

function formatPercent(similarity: number): string {
  return `${(similarity * 100).toFixed(1)}%`
}

// --- Component ---

export function PlagiarismPage() {
  const [exercises, setExercises] = useState<ExerciseOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)

  const [selectedExerciseId, setSelectedExerciseId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')

  const [checking, setChecking] = useState(false)
  const [report, setReport] = useState<PlagiarismReport | null>(null)

  // Comparison modal
  const [modalOpen, setModalOpen] = useState(false)
  const [loadingModal, setLoadingModal] = useState(false)
  const [comparison, setComparison] = useState<{
    pair: PlagiarismPair
    submissionA: SubmissionDetail
    submissionB: SubmissionDetail
  } | null>(null)

  useEffect(() => {
    fetchOptions()
  }, [])

  async function fetchOptions() {
    setLoadingOptions(true)
    try {
      const [exercisesRes, sectionsRes] = await Promise.all([
        api.get('/api/exercises'),
        api.get('/api/instructor/sections').catch(() => ({ data: [] })),
      ])
      setExercises(
        (exercisesRes.data as ExerciseOption[]).map((e) => ({ id: e.id, title: e.title }))
      )
      setSections(
        (sectionsRes.data as SectionOption[]).map((s) => ({
          id: s.id,
          name: s.name,
          semester: s.semester,
        }))
      )
    } catch {
      toast.error('Không thể tải danh sách bài tập. Vui lòng thử lại.')
    } finally {
      setLoadingOptions(false)
    }
  }

  async function handleCheck() {
    if (!selectedExerciseId) {
      toast.warning('Vui lòng chọn một bài tập để kiểm tra.')
      return
    }

    setChecking(true)
    setReport(null)
    try {
      const params: Record<string, string> = {}
      if (selectedSectionId) params.section_id = selectedSectionId

      const response = await api.get(
        `/api/exercises/${selectedExerciseId}/plagiarism`,
        { params }
      )
      setReport(response.data)
    } catch (error) {
      const message =
        (error as AxiosError<{ error?: { message?: string } }>)?.response?.data?.error?.message ||
        'Không thể kiểm tra mã nguồn. Vui lòng thử lại.'
      toast.error(message)
    } finally {
      setChecking(false)
    }
  }

  async function handleViewComparison(pair: PlagiarismPair) {
    setModalOpen(true)
    setLoadingModal(true)
    setComparison(null)
    try {
      const [aRes, bRes] = await Promise.all([
        api.get(`/api/submissions/${pair.submissionAId}`),
        api.get(`/api/submissions/${pair.submissionBId}`),
      ])
      setComparison({
        pair,
        submissionA: aRes.data,
        submissionB: bRes.data,
      })
    } catch {
      toast.error('Không thể tải mã nguồn để so sánh.')
      setModalOpen(false)
    } finally {
      setLoadingModal(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setComparison(null)
  }

  if (loadingOptions) {
    return <PageLoader label="Đang tải dữ liệu..." />
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Kiểm tra mã nguồn</h1>
        <p className="mt-1 text-sm text-gray-500">
          Phát hiện các bài nộp có mã nguồn giống nhau bất thường.
        </p>
      </div>

      {/* Controls */}
      <div className="card p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="exercise-select" className="label">
              Bài tập
            </label>
            <select
              id="exercise-select"
              value={selectedExerciseId}
              onChange={(e) => setSelectedExerciseId(e.target.value)}
              className="input"
            >
              <option value="">-- Chọn bài tập --</option>
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="section-select" className="label">
              Lớp (tùy chọn)
            </label>
            <select
              id="section-select"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="input"
            >
              <option value="">Tất cả các lớp</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.semester})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleCheck}
            disabled={checking || !selectedExerciseId}
            className="btn-primary"
          >
            {checking ? (
              <>
                <Spinner /> Đang kiểm tra...
              </>
            ) : (
              'Kiểm tra'
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {checking ? (
        <PageLoader label="Đang phân tích các bài nộp..." />
      ) : report ? (
        <div className="space-y-4">
          {/* Metadata */}
          <div className="flex flex-wrap gap-3">
            <div className="card flex-1 min-w-[200px] p-4">
              <p className="text-xs text-gray-500">Số bài nộp đã so sánh</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {report.totalSubmissions}
              </p>
            </div>
            <div className="card flex-1 min-w-[200px] p-4">
              <p className="text-xs text-gray-500">Số cặp nghi vấn</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {report.pairs.length}
              </p>
            </div>
          </div>

          {report.pairs.length === 0 ? (
            <div className="card flex flex-col items-center justify-center p-12 text-center">
              <SubmissionIcon className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-gray-500">
                Không phát hiện cặp bài nào giống nhau đáng kể.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-th">Sinh viên A</th>
                    <th className="table-th">Sinh viên B</th>
                    <th className="table-th">Mức độ giống nhau</th>
                    <th className="table-th text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {report.pairs.map((pair) => (
                    <tr
                      key={`${pair.submissionAId}-${pair.submissionBId}`}
                      className="hover:bg-gray-50"
                    >
                      <td className="table-td font-medium text-gray-900">
                        {pair.studentAName}
                      </td>
                      <td className="table-td font-medium text-gray-900">
                        {pair.studentBName}
                      </td>
                      <td className="table-td">
                        <span className={similarityBadgeClass(pair.similarity)}>
                          {formatPercent(pair.similarity)}
                        </span>
                      </td>
                      <td className="table-td text-right">
                        <button
                          onClick={() => handleViewComparison(pair)}
                          className="btn-secondary btn-sm"
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Comparison modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[85vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                So sánh mã nguồn
                {comparison && (
                  <span className={`ml-3 ${similarityBadgeClass(comparison.pair.similarity)}`}>
                    {formatPercent(comparison.pair.similarity)}
                  </span>
                )}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 transition-colors hover:text-gray-600"
                aria-label="Đóng"
              >
                <XCircleIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-hidden p-5">
              {loadingModal ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner />
                  <span className="ml-2 text-sm text-gray-500">Đang tải mã nguồn...</span>
                </div>
              ) : comparison ? (
                <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex h-full flex-col">
                    <p className="mb-2 text-sm font-medium text-gray-700">
                      {comparison.pair.studentAName}
                    </p>
                    <pre className="flex-1 overflow-auto rounded-md bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
                      <code>{comparison.submissionA.code}</code>
                    </pre>
                  </div>
                  <div className="flex h-full flex-col">
                    <p className="mb-2 text-sm font-medium text-gray-700">
                      {comparison.pair.studentBName}
                    </p>
                    <pre className="flex-1 overflow-auto rounded-md bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
                      <code>{comparison.submissionB.code}</code>
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
