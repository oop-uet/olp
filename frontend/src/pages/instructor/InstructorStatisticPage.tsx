import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ExcelJS from 'exceljs'
import { cachedGet } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { normalizePreviewSectionName } from '../../utils/semester'
import { compareByVietnameseName } from '../../lib/sortUtils'

interface SectionOption {
  id: string
  name: string
  semester: string
}

interface ExerciseStat {
  exerciseId: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  attemptedCount: number
  completedCount: number
  averageScore: number
}

interface StudentStat {
  userId: string
  studentId: string
  username: string
  fullName: string
  email: string
  attemptedExercises: number
  completedExercises: number
  attemptCount: number
  totalScore: number
  totalPossible: number
  completionPercent: number
  rank: number
}

interface StatsReport {
  totalStudents: number
  exercises: ExerciseStat[]
  students: StudentStat[]
}

const DIFFICULTY_BADGE: Record<string, { className: string; label: string }> = {
  easy: { className: 'badge-green', label: 'Dễ' },
  medium: { className: 'badge-yellow', label: 'Trung bình' },
  hard: { className: 'badge-red', label: 'Khó' },
}

function getDifficultyBadge(difficulty: string) {
  return DIFFICULTY_BADGE[difficulty] ?? { className: 'badge-gray', label: difficulty }
}

async function downloadExcel(
  fileName: string,
  sectionName: string,
  semester: string,
  rows: StudentStat[]
) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'UET OLP'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Thống kê', {
    properties: { tabColor: { argb: 'FF0D9488' } },
    views: [{ state: 'frozen', ySplit: 3, xSplit: 0 }],
  })

  const LAST_COL = 8

  // ── Row 1: Tiêu đề ────────────────────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, LAST_COL)
  const titleCell = sheet.getCell('A1')
  titleCell.value = `BẢNG THỐNG KÊ TIẾN ĐỘ HỌC TẬP - ${sectionName.toUpperCase()}`
  titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 30

  // ── Row 2: Thông tin bổ sung ───────────────────────────────────────────────
  sheet.mergeCells(2, 1, 2, LAST_COL)
  const metaCell = sheet.getCell('A2')
  const dateStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  metaCell.value = `Lớp: ${sectionName}${semester ? ` · Học kỳ: ${semester}` : ''} · Tổng số sinh viên: ${rows.length} · Xuất lúc: ${dateStr}`
  metaCell.font = { italic: true, size: 9, color: { argb: 'FF475569' } }
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(2).height = 20

  // ── Row 3: Header bảng ───────────────────────────────────────────────────
  const headers = ['STT', 'MSSV', 'Họ và tên', 'Email', 'Điểm đạt', 'Tổng điểm', 'Số bài', 'Điểm quy đổi']
  const headerRow = sheet.getRow(3)
  headerRow.height = 28
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0D9488' } },
      left: { style: 'thin', color: { argb: 'FF134E4A' } },
      right: { style: 'thin', color: { argb: 'FF134E4A' } },
    }
  })

  // ── Độ rộng cột ─────────────────────────────────────────────────────────
  sheet.getColumn(1).width = 7  // STT
  sheet.getColumn(2).width = 16 // MSSV
  sheet.getColumn(3).width = 28 // Họ và tên
  sheet.getColumn(4).width = 28 // Email
  sheet.getColumn(5).width = 14 // Điểm đạt
  sheet.getColumn(6).width = 14 // Tổng điểm
  sheet.getColumn(7).width = 12 // Số bài
  sheet.getColumn(8).width = 16 // Điểm quy đổi

  // ── Dữ liệu sinh viên ─────────────────────────────────────────────────────
  rows.forEach((student, idx) => {
    const rowNum = idx + 4
    const row = sheet.getRow(rowNum)
    row.height = 22

    const score10 = student.totalPossible > 0
      ? Math.round(((student.totalScore / student.totalPossible) * 10) * 100) / 100
      : 0

    const isEven = idx % 2 === 1
    const rowBgColor = isEven ? 'FFF8FAFC' : 'FFFFFFFF'

    const cellData: Array<{
      col: number
      val: string | number
      align: ExcelJS.Alignment['horizontal']
      numFmt?: string
      bold?: boolean
      color?: string
    }> = [
      { col: 1, val: idx + 1, align: 'center', bold: false },
      { col: 2, val: student.studentId, align: 'center', numFmt: '@', bold: false },
      { col: 3, val: student.fullName, align: 'left', bold: true },
      { col: 4, val: student.email, align: 'left', bold: false },
      { col: 5, val: student.totalScore, align: 'right', numFmt: '#,##0.00', bold: false },
      { col: 6, val: student.totalPossible, align: 'right', numFmt: '#,##0', bold: false },
      { col: 7, val: student.completedExercises, align: 'center', numFmt: '#,##0', bold: false },
      { col: 8, val: score10, align: 'right', numFmt: '0.00', bold: true, color: 'FF047857' },
    ]

    cellData.forEach(({ col, val, align, numFmt, bold, color }) => {
      const cell = row.getCell(col)
      cell.value = val
      cell.alignment = { horizontal: align, vertical: 'middle' }
      cell.font = {
        name: 'Segoe UI',
        size: 10,
        bold: bold ?? false,
        color: color ? { argb: color } : { argb: 'FF1E293B' },
      }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBgColor },
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      }
      if (numFmt) {
        cell.numFmt = numFmt
      }
    })
  })

  // Write buffer and download
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}

export function InstructorStatisticPage() {
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [loadingSections, setLoadingSections] = useState(true)
  const [stats, setStats] = useState<StatsReport | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetchSections()
  }, [])

  useEffect(() => {
    if (selectedSectionId) {
      fetchStats(selectedSectionId)
    } else {
      setStats(null)
    }
  }, [selectedSectionId])

  async function fetchSections() {
    try {
      setLoadingSections(true)
      const response = await cachedGet('/api/instructor/sections')
      const list: SectionOption[] = response.data ?? []
      setSections(list)
      if (list.length > 0) setSelectedSectionId(list[0].id)
    } catch {
      toast.error('Không thể tải danh sách lớp học.')
    } finally {
      setLoadingSections(false)
    }
  }

  async function fetchStats(sectionId: string) {
    setLoadingStats(true)
    setCurrentPage(1)
    try {
      const response = await cachedGet(`/api/instructor/sections/${sectionId}/stats`, undefined, { ttlMs: 30_000 })
      setStats({
        totalStudents: response.data.totalStudents ?? 0,
        exercises: response.data.exercises ?? [],
        students: response.data.students ?? [],
      })
    } catch {
      toast.error('Không thể tải báo cáo thống kê.')
    } finally {
      setLoadingStats(false)
    }
  }

  async function handleExportExcel() {
    if (!stats || filteredStudents.length === 0) return
    setExporting(true)
    try {
      const safeSectionName = selectedSection?.name ?? 'lop'
      const fileName = `thong-ke-${safeSectionName}.xlsx`
      await downloadExcel(
        fileName,
        normalizePreviewSectionName(selectedSection?.name ?? 'Lớp học', selectedSection?.semester ?? ''),
        selectedSection?.semester ?? '',
        filteredStudents
      )
      toast.success('Đã xuất file Excel thành công.')
    } catch {
      toast.error('Có lỗi xảy ra khi xuất file Excel.')
    } finally {
      setExporting(false)
    }
  }

  const selectedSection = sections.find((section) => section.id === selectedSectionId)
  
  const [sortField, setSortField] = useState<'studentId' | 'fullName' | 'completionPercent' | 'totalScore' | 'completedExercises' | 'attemptCount' | ''>('fullName')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const list = stats?.students ?? []
    if (!normalized) return list
    return list.filter((student) =>
      [student.studentId, student.username, student.fullName, student.email]
        .some((value) => value.toLowerCase().includes(normalized))
    )
  }, [query, stats])

  const sortedStudents = useMemo(() => {
    const list = [...filteredStudents]
    const direction = sortOrder === 'asc' ? 1 : -1
    if (!sortField || sortField === 'fullName') {
      return list.sort((a, b) => compareByVietnameseName(a.fullName, b.fullName) * direction)
    }
    return list.sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()
      if (valA < valB) return -1 * direction
      if (valA > valB) return 1 * direction
      return 0
    })
  }, [filteredStudents, sortField, sortOrder])

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedStudents.slice(startIndex, startIndex + pageSize)
  }, [sortedStudents, currentPage, pageSize])

  const totalPages = Math.ceil(sortedStudents.length / pageSize)

  const toggleSort = (field: 'studentId' | 'fullName' | 'completionPercent' | 'totalScore' | 'completedExercises' | 'attemptCount') => {
    setCurrentPage(1)
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const averageCompletion = stats?.students.length
    ? stats.students.reduce((sum, student) => sum + student.completionPercent, 0) / stats.students.length
    : 0
  const submittedStudents = stats?.students.filter((student) => student.attemptCount > 0).length ?? 0

  if (loadingSections) {
    return <PageLoader label="Đang tải danh sách lớp học..." />
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-teal-600 to-cyan-500 p-5 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary-100">Bảng thống kê</p>
            <h1 className="mt-1 text-2xl font-black">Theo dõi tiến độ lớp học</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSectionId}
              onChange={(event) => setSelectedSectionId(event.target.value)}
              className="h-10 rounded-md border border-white/20 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm"
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {normalizePreviewSectionName(section.name, section.semester)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              disabled={exporting || !stats || filteredStudents.length === 0}
              className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm"
            >
              {exporting ? (
                <>
                  <Spinner /> Đang xuất...
                </>
              ) : (
                'Xuất Excel'
              )}
            </button>
          </div>
        </div>

        {loadingStats ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm font-semibold text-slate-400">
            <Spinner /> Đang tổng hợp số liệu...
          </div>
        ) : !stats ? (
          <div className="p-12 text-center text-sm font-medium text-slate-400">
            Không tìm thấy dữ liệu thống kê cho lớp này.
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard label="Sinh viên" value={stats.totalStudents.toString()} />
              <MetricCard label="Bài tập đã gán" value={stats.exercises.length.toString()} />
              <MetricCard label="Đã có bài nộp" value={`${submittedStudents}/${stats.totalStudents}`} />
              <MetricCard label="TB hoàn thành" value={`${averageCompletion.toFixed(1)}%`} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                    Tìm kiếm:
                    <input
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value)
                        setCurrentPage(1)
                      }}
                      className="h-8 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-primary"
                    />
                  </label>
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

                <div className="overflow-x-auto">
                  {filteredStudents.length === 0 ? (
                    <p className="text-center text-slate-500 py-8 text-xs font-medium">
                      Không tìm thấy sinh viên nào khớp với từ khóa tìm kiếm.
                    </p>
                  ) : (
                    <>
                      <table className="min-w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-300 text-xs font-black uppercase text-slate-700">
                            <th className="px-4 py-3 w-14 text-center select-none">#</th>
                            <th
                              onClick={() => toggleSort('studentId')}
                              className="px-4 py-3 w-36 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                            >
                              MSSV {sortField === 'studentId' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                            </th>
                            <th
                              onClick={() => toggleSort('fullName')}
                              className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                            >
                              Sinh viên {sortField === 'fullName' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                            </th>
                            <th
                              onClick={() => toggleSort('completionPercent')}
                              className="px-4 py-3 text-center w-36 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                            >
                              % hoàn thành {sortField === 'completionPercent' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                            </th>
                            <th
                              onClick={() => toggleSort('totalScore')}
                              className="px-4 py-3 text-center w-36 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                            >
                              Điểm SV/Tổng {sortField === 'totalScore' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                            </th>
                            <th
                              onClick={() => toggleSort('completedExercises')}
                              className="px-4 py-3 text-center w-28 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                            >
                              Số bài {sortField === 'completedExercises' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                            </th>
                            <th
                              onClick={() => toggleSort('completionPercent')}
                              className="px-4 py-3 text-center w-36 cursor-pointer hover:bg-slate-100 transition-colors select-none text-slate-700"
                            >
                              Điểm quy đổi {sortField === 'completionPercent' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedStudents.map((student, index) => (
                            <tr key={student.userId} className="transition hover:bg-slate-50">
                              <td className="px-4 py-3 font-semibold text-slate-500 text-center">
                                {index + 1 + (currentPage - 1) * pageSize}
                              </td>
                              <td className="px-4 py-3 font-bold text-slate-700">{student.studentId}</td>
                              <td className="px-4 py-3">
                                <Link
                                  to={`/instructor/classes/${selectedSectionId}/students/${student.userId}/profile`}
                                  className="font-bold text-primary hover:underline"
                                >
                                  {student.fullName}
                                </Link>
                                <p className="mt-0.5 text-xs text-slate-400">{student.email}</p>
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-slate-700">
                                {student.completionPercent.toFixed(2)}%
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-primary">
                                {student.totalScore.toFixed(0)}/{student.totalPossible}
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-slate-600">
                                {student.completedExercises}
                              </td>
                              <td className="px-4 py-3 text-center font-black text-emerald-700">
                                {((student.totalPossible > 0 ? (student.totalScore / student.totalPossible) * 10 : 0)).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {sortedStudents.length > 0 && (
                        <div className="flex justify-between items-center text-xs text-slate-500 p-4 border-t border-slate-100 bg-white flex-wrap gap-3">
                          <div>
                            Hiển thị {Math.min(sortedStudents.length, (currentPage - 1) * pageSize + 1)} đến{' '}
                            {Math.min(sortedStudents.length, currentPage * pageSize)} trong tổng số{' '}
                            {sortedStudents.length} sinh viên
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


                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <ExerciseSummary exercises={stats.exercises} totalStudents={stats.totalStudents} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
    </div>
  )
}

function ExerciseSummary({ exercises, totalStudents }: { exercises: ExerciseStat[]; totalStudents: number }) {
  const sortedExercises = useMemo(() => {
    return [...exercises].sort((a, b) => {
      const getWeek = (title: string) => {
        const match = title.match(/^[Tt]uần\s+(\d+)/)
        return match ? parseInt(match[1], 10) : Infinity
      }
      const weekA = getWeek(a.title)
      const weekB = getWeek(b.title)
      if (weekA !== weekB) {
        return weekA - weekB
      }
      return a.title.localeCompare(b.title, 'vi')
    })
  }, [exercises])

  return (
    <aside className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-gradient-to-r from-teal-600 to-cyan-500 px-4 py-3 text-white">
        <h2 className="text-sm font-black uppercase tracking-wide">Theo bài tập</h2>
      </div>
      <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
        {sortedExercises.length === 0 ? (
          <p className="p-5 text-center text-sm text-slate-400">Chưa có bài tập.</p>
        ) : (
          sortedExercises.map((exercise) => {
            const badge = getDifficultyBadge(exercise.difficulty)
            const rate = totalStudents > 0 ? (exercise.completedCount / totalStudents) * 100 : 0
            return (
              <div key={exercise.exerciseId} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800">{exercise.title}</p>
                    <span className={badge.className}>{badge.label}</span>
                  </div>
                  <p className="text-right text-sm font-black text-primary">{exercise.averageScore.toFixed(1)}</p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, rate)}%` }} />
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {exercise.completedCount}/{totalStudents} hoàn thành, {exercise.attemptedCount} đã nộp
                </p>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
