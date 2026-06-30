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
    <div className="space-y-6 animate-fade-in">
      
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 font-medium py-1 px-3 bg-[#fafafa] border-b border-slate-100 rounded flex gap-1.5 items-center">
        <span className="text-teal-600 cursor-default">Trang chủ</span>
        <span>/</span>
        <span className="text-slate-400">Kiểm tra mã nguồn</span>
      </div>

      {/* Page header */}
      <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-800 font-sans">Kiểm tra mã nguồn</h1>
        <p className="mt-1 text-xs font-semibold text-slate-400">
          Phát hiện các bài nộp có mức độ tương đồng mã nguồn bất thường (chống gian lận).
        </p>
      </div>

      {/* Controls Form */}
      <div className="card p-5 bg-white border border-slate-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="exercise-select" className="label text-slate-600">
              Bài tập thực hành
            </label>
            <select
              id="exercise-select"
              value={selectedExerciseId}
              onChange={(e) => setSelectedExerciseId(e.target.value)}
              className="input py-2 px-3 text-xs font-semibold"
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
            <label htmlFor="section-select" className="label text-slate-600">
              Lớp học phần (Tùy chọn)
            </label>
            <select
              id="section-select"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="input py-2 px-3 text-xs font-semibold"
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

        <div className="flex justify-end pt-2 border-t border-slate-50">
          <button
            onClick={handleCheck}
            disabled={checking || !selectedExerciseId}
            className="btn-primary px-4 py-2 text-xs font-bold"
          >
            {checking ? (
              <>
                <Spinner /> Đang quét trùng lặp...
              </>
            ) : (
              'Bắt đầu kiểm tra'
            )}
          </button>
        </div>
      </div>

      {/* Checking Loader */}
      {checking && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
          <Spinner /> Đang phân tích mã nguồn hệ thống...
        </div>
      )}

      {/* Results details */}
      {!checking && report && (
        <div className="space-y-6">
          
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5 bg-white border border-slate-100 shadow-sm flex flex-col justify-between">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Số bài nộp đã so sánh</p>
              <h2 className="text-3xl font-bold text-slate-800 mt-2">{report.totalSubmissions}</h2>
            </div>
            
            <div className="card p-5 bg-white border border-slate-100 shadow-sm flex flex-col justify-between">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Số cặp trùng lặp nghi vấn</p>
              <h2 className="text-3xl font-bold text-rose-600 mt-2">{report.pairs.length}</h2>
            </div>

            <div className="card p-5 bg-white border border-slate-100 shadow-sm flex flex-col justify-between">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Ngưỡng tương đồng (Threshold)</p>
              <h2 className="text-3xl font-bold text-teal-600 mt-2">{(report.threshold * 100).toFixed(0)}%</h2>
            </div>
          </div>

          {/* List of Plagiarised Pairs */}
          {report.pairs.length === 0 ? (
            <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
              <SubmissionIcon className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-slate-500 font-medium">
                Không phát hiện cặp bài nào trùng lặp vượt ngưỡng quy định.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden border border-slate-100 shadow-sm">
              {/* Header banner */}
              <div className="panel-header">
                <h3 className="panel-title">
                  <span>☰</span>
                  Danh sách các cặp bài nộp trùng nhau
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase">
                      <th className="px-5 py-3 text-left">Sinh viên A</th>
                      <th className="px-5 py-3 text-left">Sinh viên B</th>
                      <th className="px-5 py-3 text-center w-48">Mức độ tương đồng</th>
                      <th className="px-5 py-3 text-right w-36">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
                    {report.pairs.map((pair) => (
                      <tr
                        key={`${pair.submissionAId}-${pair.submissionBId}`}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-5 py-3 font-semibold text-slate-800">
                          {pair.studentAName} ({pair.studentAId})
                        </td>
                        <td className="px-5 py-3 font-semibold text-slate-800">
                          {pair.studentBName} ({pair.studentBId})
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={similarityBadgeClass(pair.similarity)}>
                            {formatPercent(pair.similarity)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => handleViewComparison(pair)}
                            className="btn-secondary btn-sm font-bold text-teal-600 hover:text-teal-700"
                          >
                            So sánh mã
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comparison Modal details */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[85vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-xl overflow-hidden animate-fade-in border border-slate-100">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5 border-l-4 border-teal-600">
              <h2 className="font-bold text-xs uppercase tracking-wide text-slate-700 flex items-center gap-2">
                So sánh mã nguồn
                {comparison && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${similarityBadgeClass(comparison.pair.similarity)}`}>
                    Tương đồng: {formatPercent(comparison.pair.similarity)}
                  </span>
                )}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Đóng modal"
              >
                <XCircleIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-hidden p-5 bg-slate-50">
              {loadingModal ? (
                <div className="flex h-full items-center justify-center gap-2 text-slate-400 text-sm font-semibold">
                  <Spinner />
                  <span>Đang phân tích và nạp mã nguồn...</span>
                </div>
              ) : comparison ? (
                <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-2 overflow-hidden">
                  
                  {/* Student A code panel */}
                  <div className="flex h-full flex-col overflow-hidden bg-white border border-slate-200 rounded-lg p-3">
                    <p className="mb-2 text-xs font-bold text-slate-700 border-b border-slate-100 pb-2">
                      Sinh viên A: <span className="text-teal-600">{comparison.pair.studentAName} ({comparison.pair.studentAId})</span>
                    </p>
                    <pre className="flex-1 overflow-auto rounded-lg bg-slate-900 p-4 text-[11px] font-mono leading-relaxed text-slate-200">
                      <code>{comparison.submissionA.code}</code>
                    </pre>
                  </div>

                  {/* Student B code panel */}
                  <div className="flex h-full flex-col overflow-hidden bg-white border border-slate-200 rounded-lg p-3">
                    <p className="mb-2 text-xs font-bold text-slate-700 border-b border-slate-100 pb-2">
                      Sinh viên B: <span className="text-teal-600">{comparison.pair.studentBName} ({comparison.pair.studentBId})</span>
                    </p>
                    <pre className="flex-1 overflow-auto rounded-lg bg-slate-900 p-4 text-[11px] font-mono leading-relaxed text-slate-200">
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
