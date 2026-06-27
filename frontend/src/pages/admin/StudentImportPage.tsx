import { useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui/LoadingIndicator'

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
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function isValidFileType(f: File): boolean {
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (ext === 'csv' || ext === 'xlsx') return true
    return ACCEPTED_MIME_TYPES.includes(f.type)
  }

  function handleFileSelect(selectedFile: File | null) {
    setError(null)
    setImportResult(null)

    if (!selectedFile) {
      setFile(null)
      return
    }

    if (!isValidFileType(selectedFile)) {
      setError('Invalid file type. Please select a CSV or Excel (.xlsx) file.')
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
    setError(null)
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
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response
          ?.data?.error?.message || 'Failed to import students. Please try again.'
      setError(message)
    } finally {
      setImporting(false)
    }
  }

  async function handleExport() {
    if (!sectionId) return

    setExporting(true)
    setError(null)

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
    } catch {
      setError('Failed to export students. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">
          Student Import / Export
        </h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
        >
          {exporting ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Exporting...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* File upload area */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-medium text-gray-800">Import Students</h2>
        <p className="mb-4 text-sm text-gray-600">
          Upload a CSV or Excel (.xlsx) file with columns:{' '}
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
          aria-label="Drop file here or click to select"
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
            <span className="font-medium text-primary">Click to upload</span> or drag and drop
          </p>
          <p className="mt-1 text-xs text-gray-500">CSV or Excel (.xlsx) files only</p>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleInputChange}
            className="hidden"
            aria-label="Select student list file"
          />
        </div>

        {/* Selected file display */}
        {file && (
          <div className="mt-4 flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-4 py-3">
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
              aria-label="Remove selected file"
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
            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Importing...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import Students
              </>
            )}
          </button>
        </div>

        {/* Loading state */}
        {importing && <LoadingIndicator label="Importing students..." />}
      </div>

      {/* Import results */}
      {importResult && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-800">Import Results</h2>

          {/* Summary */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm text-gray-600">Total Rows</p>
              <p className="text-2xl font-semibold text-gray-800">{importResult.total}</p>
            </div>
            <div className="rounded-lg border border-green-100 bg-green-50 p-4">
              <p className="text-sm text-green-700">Successfully Imported</p>
              <p className="text-2xl font-semibold text-green-800">{importResult.imported}</p>
            </div>
            <div className="rounded-lg border border-yellow-100 bg-yellow-50 p-4">
              <p className="text-sm text-yellow-700">Skipped</p>
              <p className="text-2xl font-semibold text-yellow-800">{importResult.skipped.length}</p>
            </div>
          </div>

          {/* Skipped rows table */}
          {importResult.skipped.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">
                Skipped Rows
              </h3>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Row
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Student ID
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Name
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Email
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {importResult.skipped.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600">
                          {row.row}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600">
                          {row.student_id || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600">
                          {row.full_name || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-600">
                          {row.email || '—'}
                        </td>
                        <td className="px-4 py-2 text-sm text-red-600">
                          {row.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Success message when no skipped rows */}
          {importResult.skipped.length === 0 && importResult.imported > 0 && (
            <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              All {importResult.imported} students were imported successfully.
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
