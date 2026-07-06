import { useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface SkippedRow {
  row: number
  student_id?: string
  full_name?: string
  email?: string
  reason: string
}

interface ImportResult {
  imported: number
  skipped: SkippedRow[]
  total: number
}

const ACCEPTED_FILE_TYPES = '.csv,.xlsx'
const ACCEPTED_MIME_TYPES = [
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]

export function StudentImportPage() {
  const { id: sectionId } = useParams<{ id: string }>()

  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function isValidFileType(f: File): boolean {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (ext === 'csv' || ext === 'xlsx') return true
    return ACCEPTED_MIME_TYPES.includes(f.type)
  }

  function handleFileSelect(selectedFile: File | null) {
    setImportResult(null)

    if (!selectedFile) {
      setFile(null)
      return
    }

    if (!isValidFileType(selectedFile)) {
      toast.error('Định dạng file không hợp lệ. Vui lòng chọn file CSV hoặc Excel (.xlsx).')
      setFile(null)
      return
    }

    setFile(selectedFile)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] || null
    handleFileSelect(selected)
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const droppedFile = e.dataTransfer.files?.[0] || null
    handleFileSelect(droppedFile)
  }, [])

  async function handleImport() {
    if (!file || !sectionId) return

    setImporting(true)
    setImportResult(null)

    try {
      // Convert file to base64
      const base64 = await fileToBase64(file)

      const response = await api.post(
        `/api/admin/sections/${sectionId}/import-students`,
        { data: base64, filename: file.name }
      )

      setImportResult(response.data)
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      toast.success('Nhập danh sách sinh viên thành công.')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response
          ?.data?.error?.message || 'Không thể nhập sinh viên. Vui lòng thử lại.'
      toast.error(message)
    } finally {
      setImporting(false)
    }
  }

  async function handleExport() {
    if (!sectionId) return

    setExporting(true)

    try {
      const response = await api.get(
        `/api/admin/sections/${sectionId}/export-students`,
        { responseType: 'blob' }
      )

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `students-section-${sectionId}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toast.success('Xuất danh sách thành công.')
    } catch {
      toast.error('Không thể xuất danh sách sinh viên. Vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-800 text-lg shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span>NHẬP / XUẤT SINH VIÊN</span>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-primary hover:bg-primary-700 text-white text-[11px] font-bold px-4 py-2.5 rounded-lg transition-all active:scale-[0.97] shadow-sm cursor-pointer flex items-center gap-1.5"
        >
          {exporting ? (
            <>
              <Spinner />
              Đang xuất...
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Xuất CSV
            </>
          )}
        </button>
      </div>

      {/* File upload area */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-medium text-gray-800">Nhập sinh viên</h2>
        <p className="mb-4 text-sm text-gray-600">
          Tải lên file CSV hoặc Excel (.xlsx) với các cột:{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">student_id</code>,{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">full_name</code>,{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">email</code>
        </p>

        {/* Drag and drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver
              ? 'border-primary bg-primary-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          role="button"
          tabIndex={0}
          aria-label="Kéo thả file vào đây hoặc nhấn để chọn"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
        >
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-600">
            <span className="font-medium text-primary">Nhấn để tải lên</span> hoặc kéo thả
          </p>
          <p className="mt-1 text-xs text-gray-500">Chỉ chấp nhận file CSV hoặc Excel (.xlsx)</p>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleInputChange}
            className="hidden"
            aria-label="Chọn file danh sách sinh viên"
          />
        </div>

        {/* Selected file display */}
        {file && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFile(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
              aria-label="Bỏ file đã chọn"
            >
              ✕
            </button>
          </div>
        )}

        {/* Import button */}
        <div className="mt-4">
          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="btn-primary"
          >
            {importing ? (
              <>
                <Spinner />
                Đang nhập...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Nhập sinh viên
              </>
            )}
          </button>
        </div>

        {/* Loading state */}
        {importing && <PageLoader label="Đang nhập sinh viên..." />}
      </div>

      {/* Import results */}
      {importResult && (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-medium text-gray-800">Kết quả nhập</h2>

          {/* Summary */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm text-gray-600">Tổng số dòng</p>
              <p className="text-2xl font-semibold text-gray-800">{importResult.total}</p>
            </div>
            <div className="rounded-lg border border-success-100 bg-success-50 p-4">
              <p className="text-sm text-success-700">Nhập thành công</p>
              <p className="text-2xl font-semibold text-success-700">{importResult.imported}</p>
            </div>
            <div className="rounded-lg border border-warning-100 bg-warning-50 p-4">
              <p className="text-sm text-warning-700">Bỏ qua</p>
              <p className="text-2xl font-semibold text-warning-700">{importResult.skipped.length}</p>
            </div>
          </div>

          {/* Skipped rows table */}
          {importResult.skipped.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                Các dòng bị bỏ qua
              </h3>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase select-none">
                      <th className="px-4 py-3 text-center w-16 text-slate-500 font-black">Dòng</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-black">MSSV</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-black">Họ tên</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-black">Email</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-black">Lý do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
                    {importResult.skipped.map((row, index) => (
                      <tr key={index} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-2.5 text-center text-slate-400 font-bold">{row.row}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{row.student_id || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-700 font-semibold">{row.full_name || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600 font-medium">{row.email || '—'}</td>
                        <td className="px-4 py-2.5 text-red-600 font-bold">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Success message when no skipped rows */}
          {importResult.skipped.length === 0 && importResult.imported > 0 && (
            <div className="rounded-lg border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700">
              Đã nhập thành công {importResult.imported} sinh viên.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Helper to convert a File to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove the data URL prefix (e.g. "data:text/csv;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

// Format file size in human-readable form
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
