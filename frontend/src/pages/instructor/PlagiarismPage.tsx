import { Fragment, useEffect, useState, useMemo } from 'react'
import { AxiosError } from 'axios'
import { api, cachedGet } from '../../lib/api'
import { toast } from '../../stores/toast.store'
import { PageLoader, Spinner, SubmissionIcon, XCircleIcon } from '../../components/ui'
import { normalizePreviewSectionName } from '../../utils/semester'

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
  studentAUsername?: string
  studentAName: string
  studentASectionName?: string | null
  studentASectionSemester?: string | null
  studentASubmittedAt?: string
  studentBId: string
  studentBUsername?: string
  studentBName: string
  studentBSectionName?: string | null
  studentBSectionSemester?: string | null
  studentBSubmittedAt?: string
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

interface SubmittedSourceFile {
  name: string
  content: string
}

interface SourceCheckSettings {
  enabled: boolean
  weeklyEnabled: boolean
  provider: string
  threshold: number
  maxRuntimeMinutes: number
  schedule: {
    timezone: string
    dayLabel: string
    timeLabel: string
    cron: string
  }
}

interface SavedSourceCheckReport {
  id: string
  exerciseId: string
  exerciseTitle?: string | null
  sectionId?: string | null
  sectionName?: string | null
  sectionSemester?: string | null
  semester?: string | null
  provider: string
  threshold: number
  status: 'completed' | 'failed'
  totalSubmissions: number
  comparedPairs: number
  pairCount: number
  artifactUrl?: string | null
  workflowRunId?: string | null
  triggeredBy?: string | null
  startedAt?: string | null
  finishedAt: string
  createdAt: string
}

interface SavedSourceCheckReportDetail extends SavedSourceCheckReport {
  report: PlagiarismReport
}

interface SimilarSubmission {
  pair: PlagiarismPair
  studentId: string
  studentCode: string
  studentName: string
  submissionId: string
  submittedAt: string
  sectionName: string
  sectionSemester: string
  similarity: number
}

interface StudentSimilarityRow {
  studentId: string
  studentCode: string
  studentName: string
  submissionId: string
  submittedAt: string
  sectionName: string
  sectionSemester: string
  maxSimilarity: number
  matches: SimilarSubmission[]
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

function formatTimestamp(value?: string): string {
  if (!value) return 'Chưa rõ'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getPairStudent(pair: PlagiarismPair, side: 'A' | 'B') {
  if (side === 'A') {
    return {
      studentId: pair.studentAId,
      studentCode: pair.studentAUsername || pair.studentAId,
      studentName: pair.studentAName,
      submissionId: pair.submissionAId,
      submittedAt: pair.studentASubmittedAt || '',
      sectionName: pair.studentASectionName || 'Chưa rõ lớp',
      sectionSemester: pair.studentASectionSemester || '',
    }
  }

  return {
    studentId: pair.studentBId,
    studentCode: pair.studentBUsername || pair.studentBId,
    studentName: pair.studentBName,
    submissionId: pair.submissionBId,
    submittedAt: pair.studentBSubmittedAt || '',
    sectionName: pair.studentBSectionName || 'Chưa rõ lớp',
    sectionSemester: pair.studentBSectionSemester || '',
  }
}

function buildStudentSimilarityRows(pairs: PlagiarismPair[]): StudentSimilarityRow[] {
  const rows = new Map<string, StudentSimilarityRow>()

  function ensureRow(student: ReturnType<typeof getPairStudent>) {
    const existing = rows.get(student.studentId)
    if (existing) return existing
    const row: StudentSimilarityRow = {
      ...student,
      maxSimilarity: 0,
      matches: [],
    }
    rows.set(student.studentId, row)
    return row
  }

  for (const pair of pairs) {
    const studentA = getPairStudent(pair, 'A')
    const studentB = getPairStudent(pair, 'B')
    const rowA = ensureRow(studentA)
    const rowB = ensureRow(studentB)

    rowA.maxSimilarity = Math.max(rowA.maxSimilarity, pair.similarity)
    rowB.maxSimilarity = Math.max(rowB.maxSimilarity, pair.similarity)
    rowA.matches.push({ ...studentB, pair, similarity: pair.similarity })
    rowB.matches.push({ ...studentA, pair, similarity: pair.similarity })
  }

  return [...rows.values()].map((row) => ({
    ...row,
    matches: [...row.matches].sort((a, b) => b.similarity - a.similarity),
  }))
}

function parseSubmittedFiles(code: string): SubmittedSourceFile[] {
  try {
    const parsed = JSON.parse(code) as {
      format?: string
      files?: Array<{ name?: string; content?: string }>
    }

    if (parsed.format === 'oop-java-files' && Array.isArray(parsed.files)) {
      const files = parsed.files
        .filter((file) => file.name && typeof file.content === 'string')
        .map((file) => ({ name: file.name as string, content: file.content as string }))

      if (files.length > 0) return files
    }
  } catch {
    // Legacy submissions are stored as raw Java source.
  }

  return [{ name: 'Main.java', content: code }]
}

function getFileByName(files: SubmittedSourceFile[], fileName: string) {
  return files.find((file) => file.name === fileName) ?? null
}

function fileLineCount(content: string) {
  if (!content) return 0
  return content.split('\n').length
}

function SourceCodePanel({
  title,
  subtitle,
  file,
}: {
  title: string
  subtitle: string
  file: SubmittedSourceFile | null
}) {
  const lines = file?.content.split('\n') ?? []

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="truncate text-sm font-black text-slate-900">{title}</p>
        <p className="mt-1 truncate text-xs font-semibold text-slate-500">{subtitle}</p>
      </div>

      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-2">
        <span className="font-mono text-xs font-bold text-sky-300">{file?.name ?? 'Không có file này'}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {file ? `${fileLineCount(file.content)} dòng` : 'Missing'}
        </span>
      </div>

      {file ? (
        <div className="min-h-0 flex-1 overflow-auto bg-slate-950 p-0 font-mono text-[12px] leading-6 text-slate-200">
          {lines.map((line, index) => (
            <div key={`${file.name}-${index}`} className="grid min-w-max grid-cols-[3.5rem,minmax(0,1fr)]">
              <span className="select-none border-r border-slate-800 bg-slate-900/80 pr-3 text-right text-slate-500">
                {index + 1}
              </span>
              <code className="whitespace-pre px-4">{line || ' '}</code>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-8 text-center">
          <p className="text-sm font-semibold text-slate-500">
            Bài nộp này không có file đang chọn.
          </p>
        </div>
      )}
    </div>
  )
}

export function PlagiarismPage() {
  const [exercises, setExercises] = useState<ExerciseOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [sourceCheckSettings, setSourceCheckSettings] = useState<SourceCheckSettings | null>(null)
  const [savedReports, setSavedReports] = useState<SavedSourceCheckReport[]>([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(true)

  const [selectedExerciseId, setSelectedExerciseId] = useState('')
  const [selectedSemester, setSelectedSemester] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [thresholdPercent, setThresholdPercent] = useState('70')

  const [checking, setChecking] = useState(false)
  const [loadingSavedReportId, setLoadingSavedReportId] = useState('')
  const [report, setReport] = useState<PlagiarismReport | null>(null)
  const [expandedStudentIds, setExpandedStudentIds] = useState<Set<string>>(() => new Set())

  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'similarity' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const semesters = useMemo(
    () => [...new Set(sections.map((section) => section.semester).filter(Boolean))].sort((a, b) => b.localeCompare(a, 'vi')),
    [sections]
  )

  const visibleSections = useMemo(
    () =>
      selectedSemester
        ? sections.filter((section) => section.semester === selectedSemester)
        : sections,
    [sections, selectedSemester]
  )

  const studentRows = useMemo(
    () => buildStudentSimilarityRows(report?.pairs ?? []),
    [report?.pairs]
  )

  const filteredRows = useMemo(() => {
    const raw = studentRows
    if (!search.trim()) return raw
    const q = search.toLowerCase()
    return raw.filter((row) => {
      const selfMatches =
        row.studentName.toLowerCase().includes(q) ||
        row.studentCode.toLowerCase().includes(q) ||
        row.submissionId.toLowerCase().includes(q)
      const relatedMatches = row.matches.some(
        (match) =>
          match.studentName.toLowerCase().includes(q) ||
          match.studentCode.toLowerCase().includes(q) ||
          match.submissionId.toLowerCase().includes(q)
      )
      return selfMatches || relatedMatches
    })
  }, [studentRows, search])

  const sortedRows = useMemo(() => {
    if (!sortField) return filteredRows
    return [...filteredRows].sort((a, b) => {
      const valA = a.maxSimilarity
      const valB = b.maxSimilarity
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredRows, sortField, sortOrder])

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedRows.slice(startIndex, startIndex + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const totalPages = Math.ceil(sortedRows.length / pageSize)

  const toggleSort = (field: 'similarity') => {
    setCurrentPage(1)
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // Comparison modal
  const [modalOpen, setModalOpen] = useState(false)
  const [loadingModal, setLoadingModal] = useState(false)
  const [comparison, setComparison] = useState<{
    pair: PlagiarismPair
    submissionA: SubmissionDetail
    submissionB: SubmissionDetail
  } | null>(null)
  const [activeComparisonFile, setActiveComparisonFile] = useState('')

  useEffect(() => {
    fetchOptions()
  }, [])

  useEffect(() => {
    if (!comparison) {
      setActiveComparisonFile('')
      return
    }

    const filesA = parseSubmittedFiles(comparison.submissionA.code)
    const filesB = parseSubmittedFiles(comparison.submissionB.code)
    const fileNames = [...new Set([...filesA, ...filesB].map((file) => file.name))]
    setActiveComparisonFile((current) => (current && fileNames.includes(current) ? current : fileNames[0] ?? 'Main.java'))
  }, [comparison])

  async function fetchOptions() {
    setLoadingOptions(true)
    try {
      const [exercisesRes, libraryRes, sectionsRes, settingsRes, reportsRes] = await Promise.all([
        cachedGet('/api/exercises', undefined, { ttlMs: 60_000 }),
        cachedGet('/api/exercises/library').catch(() => ({ data: [] })),
        cachedGet('/api/instructor/sections').catch(() => ({ data: [] })),
        cachedGet('/api/source-check/settings', undefined, { ttlMs: 60_000 }).catch(() => ({ data: null })),
        cachedGet('/api/source-check/reports', { params: { limit: 6 } }, { ttlMs: 30_000 }).catch(() => ({ data: { data: [] } })),
      ])
      const exerciseData = Array.isArray(exercisesRes.data)
        ? exercisesRes.data
        : exercisesRes.data?.data ?? []
      const libraryData = Array.isArray(libraryRes.data)
        ? libraryRes.data
        : libraryRes.data?.data ?? []
      const sectionData = Array.isArray(sectionsRes.data)
        ? sectionsRes.data
        : sectionsRes.data?.data ?? []
      const exerciseMap = new Map<string, ExerciseOption>()
      ;[...libraryData, ...exerciseData].forEach((e) => {
        if (e?.id && e?.title) {
          exerciseMap.set(e.id, { id: e.id, title: e.title })
        }
      })
      const sortedEx = [...exerciseMap.values()].sort((a, b) => {
        const getWeek = (title: string) => {
          const match = title.match(/^[Tt]uần\s+(\d+)/)
          return match ? parseInt(match[1], 10) : Infinity
        }
        const weekA = getWeek(a.title)
        const weekB = getWeek(b.title)
        if (weekA !== weekB) return weekA - weekB
        return a.title.localeCompare(b.title, 'vi')
      })
      setExercises(sortedEx)
      setSections(
        (sectionData as SectionOption[]).map((s) => ({
          id: s.id,
          name: s.name,
          semester: s.semester,
        }))
      )
      if (settingsRes.data) {
        const settings = settingsRes.data as SourceCheckSettings
        setSourceCheckSettings(settings)
        setThresholdPercent(String(settings.threshold))
      }
      const reportData = Array.isArray(reportsRes.data)
        ? reportsRes.data
        : reportsRes.data?.data ?? []
      setSavedReports(reportData as SavedSourceCheckReport[])
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
    const threshold = Number(thresholdPercent)
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
      toast.warning('Ngưỡng tương đồng phải nằm trong khoảng 1 đến 100%.')
      return
    }

    setChecking(true)
    setReport(null)
    setCurrentPage(1)
    setExpandedStudentIds(new Set())
    try {
      const params: Record<string, string> = {}
      if (selectedSectionId) params.section_id = selectedSectionId
      else if (selectedSemester) params.semester = selectedSemester
      params.threshold = thresholdPercent

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

  async function refreshSavedReports() {
    setLoadingReports(true)
    try {
      const response = await api.get('/api/source-check/reports', { params: { limit: 6 } })
      const data = Array.isArray(response.data) ? response.data : response.data?.data ?? []
      setSavedReports(data)
    } catch {
      toast.error('Không thể tải danh sách report đã lưu.')
    } finally {
      setLoadingReports(false)
    }
  }

  async function handleOpenSavedReport(reportId: string) {
    setLoadingSavedReportId(reportId)
    try {
      const response = await api.get<SavedSourceCheckReportDetail>(`/api/source-check/reports/${reportId}`)
      setReport(response.data.report)
      setCurrentPage(1)
      setExpandedStudentIds(new Set())
      toast.success('Đã mở report kiểm tra mã nguồn.')
    } catch {
      toast.error('Không thể mở report đã lưu.')
    } finally {
      setLoadingSavedReportId('')
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

  function handleSemesterChange(value: string) {
    setSelectedSemester(value)
    setSelectedSectionId((current) => {
      if (!value) return current
      const section = sections.find((item) => item.id === current)
      return section?.semester === value ? current : ''
    })
  }

  function handleSectionChange(value: string) {
    setSelectedSectionId(value)
    const section = sections.find((item) => item.id === value)
    if (section) setSelectedSemester(section.semester)
  }

  function toggleExpandedStudent(studentId: string) {
    setExpandedStudentIds((current) => {
      const next = new Set(current)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  if (loadingOptions) {
    return <PageLoader label="Đang tải dữ liệu..." />
  }

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 p-6 text-white shadow-md border-b-4 border-secondary">
        <h1 className="text-2xl font-black font-sans uppercase tracking-wide">Kiểm tra mã nguồn</h1>
        <p className="text-xs text-white/70 mt-1 font-semibold">Phát hiện gian lận và đối chiếu độ tương đồng mã nguồn giữa các sinh viên</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
        {/* Controls Form */}
        <div className="card overflow-hidden border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">Quét nhanh theo bài tập</h2>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {report
                  ? `${report.totalSubmissions} bài nộp, ${report.pairs.length} cặp vượt ngưỡng`
                  : 'Chưa có report trong phiên hiện tại'}
              </p>
            </div>
            <button
              onClick={handleCheck}
              disabled={checking || !selectedExerciseId}
              className="btn-primary px-4 py-2 text-xs font-bold"
            >
              {checking ? (
                <>
                  <Spinner /> Đang quét...
                </>
              ) : (
                'Bắt đầu kiểm tra'
              )}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label htmlFor="exercise-select" className="label text-slate-600">
                Bài tập
              </label>
              <select
                id="exercise-select"
                value={selectedExerciseId}
                onChange={(e) => setSelectedExerciseId(e.target.value)}
                className="input py-2 px-3 text-xs font-semibold"
              >
                <option value="">Chọn bài tập</option>
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="semester-select" className="label text-slate-600">
                Học kỳ
              </label>
              <select
                id="semester-select"
                value={selectedSemester}
                onChange={(e) => handleSemesterChange(e.target.value)}
                className="input py-2 px-3 text-xs font-semibold"
              >
                <option value="">Tất cả học kỳ</option>
                {semesters.map((semester) => (
                  <option key={semester} value={semester}>
                    {semester}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="section-select" className="label text-slate-600">
                Lớp học phần
              </label>
              <select
                id="section-select"
                value={selectedSectionId}
                onChange={(e) => handleSectionChange(e.target.value)}
                className="input py-2 px-3 text-xs font-semibold"
              >
                <option value="">Tất cả lớp trong học kỳ</option>
                {visibleSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {normalizePreviewSectionName(s.name, s.semester)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="threshold-input" className="label text-slate-600">
                Ngưỡng
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="threshold-input"
                  type="number"
                  min={1}
                  max={100}
                  value={thresholdPercent}
                  onChange={(e) => setThresholdPercent(e.target.value)}
                  className="input py-2 px-3 text-xs font-semibold"
                />
                <span className="text-xs font-bold text-slate-500">%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-black text-slate-900">GitHub Actions</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                  sourceCheckSettings?.enabled && sourceCheckSettings.weeklyEnabled
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {sourceCheckSettings?.enabled && sourceCheckSettings.weeklyEnabled ? 'Đang bật' : 'Đang tắt'}
              </span>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Lịch</p>
                <p className="mt-1 font-bold text-slate-800">
                  {sourceCheckSettings
                    ? `${sourceCheckSettings.schedule.dayLabel} ${sourceCheckSettings.schedule.timeLabel}`
                    : 'Thứ bảy 22:00'}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Cron GitHub:{' '}
                  {sourceCheckSettings ? sourceCheckSettings.schedule.cron : '0 15 * * 6'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">Provider</p>
                  <p className="mt-1 font-bold text-slate-800">
                    {sourceCheckSettings?.provider?.toUpperCase() || 'JPLAG'}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">Ngưỡng</p>
                  <p className="mt-1 font-bold text-slate-800">
                    {sourceCheckSettings?.threshold ?? 70}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-black text-slate-900">Report đã lưu</h2>
              <button
                type="button"
                onClick={refreshSavedReports}
                disabled={loadingReports}
                className="btn btn-secondary btn-sm"
              >
                {loadingReports ? <Spinner /> : 'Làm mới'}
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-3">
              {savedReports.length === 0 ? (
                <div className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                  Chưa có report từ GitHub Actions.
                </div>
              ) : (
                <div className="space-y-2">
                  {savedReports.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleOpenSavedReport(item.id)}
                      className="w-full rounded-lg border border-slate-100 bg-white p-3 text-left transition hover:border-primary-200 hover:bg-primary-50/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">
                            {item.exerciseTitle || item.exerciseId}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {item.sectionName
                              ? normalizePreviewSectionName(item.sectionName, item.sectionSemester || '')
                              : item.semester || 'Tất cả lớp'}
                          </p>
                        </div>
                        <span className={similarityBadgeClass(item.threshold)}>
                          {(item.threshold * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                        <span>{formatTimestamp(item.finishedAt)}</span>
                        <span>·</span>
                        <span>{item.totalSubmissions} bài</span>
                        <span>·</span>
                        <span className={item.pairCount > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {item.pairCount} cặp
                        </span>
                        {loadingSavedReportId === item.id && <Spinner className="h-3 w-3" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
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
              <h2 className="text-3xl font-bold text-primary mt-2">{(report.threshold * 100).toFixed(0)}%</h2>
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
              <div className="panel-header flex flex-wrap items-center justify-between gap-4">
                <h3 className="panel-title">
                  <span>☰</span>
                  Danh sách các cặp bài nộp trùng nhau
                </h3>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="input text-xs py-1 px-3 max-w-xs"
                  style={{ height: '32px' }}
                  placeholder="Tìm sinh viên..."
                />
              </div>

              <div className="overflow-x-auto">
                {filteredRows.length === 0 ? (
                  <p className="text-center text-slate-500 py-8 text-xs font-medium">
                    Không tìm thấy sinh viên nào khớp với từ khóa tìm kiếm.
                  </p>
                ) : (
                  <>
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase">
                          <th className="px-5 py-3 w-16 text-center">#</th>
                          <th className="px-5 py-3 text-left">MSSV</th>
                          <th className="px-5 py-3 text-left">Họ tên</th>
                          <th className="px-5 py-3 text-left">ID bài nộp</th>
                          <th className="px-5 py-3 text-left">Thời gian nộp</th>
                          <th className="px-5 py-3 text-left">Lớp học phần</th>
                          <th
                            onClick={() => toggleSort('similarity')}
                            className="px-5 py-3 text-center w-40 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-500"
                          >
                            Similarity (%) {sortField === 'similarity' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                          </th>
                          <th className="px-5 py-3 text-center w-24">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
                        {paginatedRows.map((row: StudentSimilarityRow, index: number) => (
                          <Fragment key={row.studentId}>
                            <tr
                              className="hover:bg-slate-50/50 transition-colors"
                            >
                              <td className="px-5 py-3 text-slate-400 font-bold text-center">
                                {index + 1 + (currentPage - 1) * pageSize}
                              </td>
                              <td className="px-5 py-3 font-semibold text-sky-600">{row.studentCode}</td>
                              <td className="px-5 py-3 font-semibold text-slate-800">{row.studentName}</td>
                              <td className="px-5 py-3 font-mono text-sky-600">{row.submissionId}</td>
                              <td className="px-5 py-3 text-slate-600">{formatTimestamp(row.submittedAt)}</td>
                              <td className="px-5 py-3 text-slate-600">{normalizePreviewSectionName(row.sectionName, row.sectionSemester)}</td>
                              <td className="px-5 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => row.matches[0] && handleViewComparison(row.matches[0].pair)}
                                  className={`${similarityBadgeClass(row.maxSimilarity)} cursor-pointer transition hover:scale-105`}
                                  title="Xem so sánh chi tiết với bài tương tự nhất"
                                >
                                  {formatPercent(row.maxSimilarity)}
                                </button>
                              </td>
                              <td className="px-5 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleExpandedStudent(row.studentId)}
                                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-black transition ${
                                    expandedStudentIds.has(row.studentId)
                                      ? 'border-rose-200 bg-rose-50 text-rose-600'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                  }`}
                                  title={expandedStudentIds.has(row.studentId) ? 'Ẩn chi tiết' : 'Xem các bài tương tự'}
                                >
                                  {expandedStudentIds.has(row.studentId) ? '−' : '+'}
                                </button>
                              </td>
                            </tr>
                            {expandedStudentIds.has(row.studentId) && (
                              <tr key={`${row.studentId}-details`} className="bg-slate-50/70">
                                <td colSpan={8} className="px-8 py-3">
                                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                    <table className="min-w-full divide-y divide-slate-100">
                                      <thead>
                                        <tr className="bg-white text-[11px] font-black uppercase text-slate-500">
                                          <th className="px-4 py-2 text-left">Similarity (%)</th>
                                          <th className="px-4 py-2 text-left">Bài nộp</th>
                                          <th className="px-4 py-2 text-left">MSSV</th>
                                          <th className="px-4 py-2 text-left">Họ tên</th>
                                          <th className="px-4 py-2 text-left">Thời gian nộp</th>
                                          <th className="px-4 py-2 text-left">Lớp học phần</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-xs">
                                        {row.matches.map((match) => (
                                          <tr key={`${row.studentId}-${match.submissionId}`} className="hover:bg-slate-50">
                                            <td className="px-4 py-2">
                                              <button
                                                type="button"
                                                onClick={() => handleViewComparison(match.pair)}
                                                className="font-bold text-sky-600 hover:text-sky-800 hover:underline"
                                              >
                                                {formatPercent(match.similarity)}
                                              </button>
                                            </td>
                                            <td className="px-4 py-2 font-mono text-sky-600">{match.submissionId}</td>
                                            <td className="px-4 py-2 font-semibold text-sky-600">{match.studentCode}</td>
                                            <td className="px-4 py-2 font-semibold text-slate-800">{match.studentName}</td>
                                            <td className="px-4 py-2 text-slate-600">{formatTimestamp(match.submittedAt)}</td>
                                            <td className="px-4 py-2 text-slate-600">{normalizePreviewSectionName(match.sectionName, match.sectionSemester)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>

                    {sortedRows.length > 0 && (
                      <div className="flex justify-between items-center text-xs text-slate-500 p-4 border-t border-slate-100 bg-white flex-wrap gap-3 animate-fade-in">
                        <div>
                          Hiển thị {Math.min(sortedRows.length, (currentPage - 1) * pageSize + 1)} đến{' '}
                          {Math.min(sortedRows.length, currentPage * pageSize)} trong tổng số{' '}
                          {sortedRows.length} sinh viên có bài tương tự
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
          )}
        </div>
      )}

      {/* Comparison Modal details */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl animate-fade-in">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5 border-l-4 border-primary">
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
            <div className="min-h-0 flex-1 overflow-hidden bg-slate-50 p-5">
              {loadingModal ? (
                <div className="flex h-full items-center justify-center gap-2 text-slate-400 text-sm font-semibold">
                  <Spinner />
                  <span>Đang phân tích và nạp mã nguồn...</span>
                </div>
              ) : comparison ? (
                (() => {
                  const filesA = parseSubmittedFiles(comparison.submissionA.code)
                  const filesB = parseSubmittedFiles(comparison.submissionB.code)
                  const fileNames = [...new Set([...filesA, ...filesB].map((file) => file.name))]
                  const selectedFileName = activeComparisonFile || fileNames[0] || 'Main.java'
                  const fileA = getFileByName(filesA, selectedFileName)
                  const fileB = getFileByName(filesB, selectedFileName)

                  return (
                    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Sinh viên 1</p>
                          <p className="mt-1 truncate text-sm font-black text-primary">
                            {comparison.pair.studentAName}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            MSSV: {comparison.pair.studentAUsername || comparison.pair.studentAId} · Bài nộp: {comparison.pair.submissionAId}
                          </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Sinh viên 2</p>
                          <p className="mt-1 truncate text-sm font-black text-primary">
                            {comparison.pair.studentBName}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            MSSV: {comparison.pair.studentBUsername || comparison.pair.studentBId} · Bài nộp: {comparison.pair.submissionBId}
                          </p>
                        </div>
                        <div className="flex items-center justify-center rounded-lg border border-rose-100 bg-rose-50 px-5 py-3 text-center">
                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-rose-400">Similarity</p>
                            <p className="mt-1 text-3xl font-black text-rose-600">
                              {formatPercent(comparison.pair.similarity)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="mr-1 text-xs font-black uppercase tracking-wide text-slate-400">File</span>
                        {fileNames.map((fileName) => (
                          <button
                            key={fileName}
                            type="button"
                            onClick={() => setActiveComparisonFile(fileName)}
                            className={`rounded-md border px-3 py-1.5 font-mono text-xs font-bold transition ${
                              selectedFileName === fileName
                                ? 'border-primary bg-primary-50 text-primary'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-primary-200 hover:text-primary'
                            }`}
                          >
                            {fileName}
                          </button>
                        ))}
                      </div>

                      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
                        <SourceCodePanel
                          title={`${comparison.pair.studentAName} (${comparison.pair.studentAUsername || comparison.pair.studentAId})`}
                          subtitle={`Bài nộp ${comparison.pair.submissionAId} · ${formatTimestamp(comparison.pair.studentASubmittedAt)}`}
                          file={fileA}
                        />
                        <SourceCodePanel
                          title={`${comparison.pair.studentBName} (${comparison.pair.studentBUsername || comparison.pair.studentBId})`}
                          subtitle={`Bài nộp ${comparison.pair.submissionBId} · ${formatTimestamp(comparison.pair.studentBSubmittedAt)}`}
                          file={fileB}
                        />
                      </div>
                    </div>
                  )
                })()
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
