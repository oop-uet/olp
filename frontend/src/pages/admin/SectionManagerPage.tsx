import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { LoadingIndicator } from '../../components/ui/LoadingIndicator'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Instructor {
  id: string
  username: string
  email: string
  role: string
}

interface Section {
  id: string
  name: string
  semester: string
  instructorId: string | null
  createdAt: string
  instructor?: Instructor | null
}

interface SectionFormData {
  name: string
  semester: string
  instructor_id: string | null
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SectionManagerPage() {
  const [sections, setSections] = useState<Section[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingSection, setEditingSection] = useState<Section | null>(null)
  const [formData, setFormData] = useState<SectionFormData>({
    name: '',
    semester: '',
    instructor_id: null,
  })
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchSections = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/api/admin/sections')
      setSections(response.data)
    } catch {
      setError('Failed to load sections. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchInstructors = useCallback(async () => {
    try {
      const response = await api.get('/api/admin/sections')
      // Extract instructors from loaded sections (no dedicated users endpoint)
      const instructorMap = new Map<string, Instructor>()
      const sectionData = response.data as Section[]
      sectionData.forEach((section) => {
        if (section.instructor) {
          instructorMap.set(section.instructor.id, section.instructor)
        }
      })
      setInstructors(Array.from(instructorMap.values()))
    } catch {
      // Silently handle - instructor list is optional for the form
    }
  }, [])

  useEffect(() => {
    fetchSections()
    fetchInstructors()
  }, [fetchSections, fetchInstructors])

  // ─── Form Handlers ─────────────────────────────────────────────────────

  function openCreateForm() {
    setEditingSection(null)
    setFormData({ name: '', semester: '', instructor_id: null })
    setShowForm(true)
  }

  function openEditForm(section: Section) {
    setEditingSection(section)
    setFormData({
      name: section.name,
      semester: section.semester,
      instructor_id: section.instructorId,
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingSection(null)
    setFormData({ name: '', semester: '', instructor_id: null })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      if (editingSection) {
        // Update
        const response = await api.put(
          `/api/admin/sections/${editingSection.id}`,
          formData
        )
        setSections((prev) =>
          prev.map((s) => (s.id === editingSection.id ? response.data : s))
        )
      } else {
        // Create
        const response = await api.post('/api/admin/sections', formData)
        setSections((prev) => [...prev, response.data])
      }
      closeForm()
      // Refresh to get full data with instructor relations
      fetchSections()
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message ||
        `Failed to ${editingSection ? 'update' : 'create'} section.`
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Delete Handler ────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to delete this section?')) return

    setDeletingId(id)
    setError(null)
    try {
      await api.delete(`/api/admin/sections/${id}`)
      setSections((prev) => prev.filter((s) => s.id !== id))
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || 'Failed to delete section.'
      setError(message)
    } finally {
      setDeletingId(null)
    }
  }

  // ─── Instructor Assignment Handler ─────────────────────────────────────

  async function handleAssignInstructor(
    sectionId: string,
    instructorId: string
  ) {
    setError(null)
    try {
      const response = await api.put(
        `/api/admin/sections/${sectionId}/instructor`,
        { instructor_id: instructorId }
      )
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, ...response.data } : s))
      )
      // Refresh to get updated instructor relation data
      fetchSections()
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || 'Failed to assign instructor.'
      setError(message)
    }
  }

  // ─── Roster Import State ───────────────────────────────────────────────
  const [showRosterImport, setShowRosterImport] = useState(false)
  const [rosterFile, setRosterFile] = useState<File | null>(null)
  const [rosterImporting, setRosterImporting] = useState(false)
  const [rosterResult, setRosterResult] = useState<{
    section: { id: string; name: string; semester: string };
    imported: number;
    skipped: Array<{ row: number; studentId?: string; reason: string }>;
    total: number;
  } | null>(null)

  async function handleRosterImport() {
    if (!rosterFile) return
    setRosterImporting(true)
    setError(null)
    setRosterResult(null)

    try {
      const base64 = await fileToBase64(rosterFile)
      const response = await api.post('/api/admin/import-roster', {
        data: base64,
        filename: rosterFile.name,
      })
      setRosterResult(response.data)
      setRosterFile(null)
      // Refresh sections list
      fetchSections()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Import failed')
    } finally {
      setRosterImporting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">
          Section Management
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRosterImport(!showRosterImport)}
            className="rounded border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-50"
          >
            📥 Import Danh sách lớp
          </button>
          <button
            onClick={openCreateForm}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            Create Section
          </button>
        </div>
      </div>

      {/* Roster Import Panel */}
      {showRosterImport && (
        <div className="rounded-lg border border-primary-200 bg-primary-50/30 p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            Import Danh sách lớp (.xls / .xlsx)
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Upload file danh sách lớp (format UET-VNU). Hệ thống sẽ tự tạo lớp, tạo tài khoản sinh viên (username = password = MSSV), và yêu cầu đổi mật khẩu khi đăng nhập lần đầu.
          </p>

          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".xls,.xlsx"
              onChange={(e) => setRosterFile(e.target.files?.[0] || null)}
              className="block text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-600"
            />
            <button
              onClick={handleRosterImport}
              disabled={!rosterFile || rosterImporting}
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {rosterImporting ? 'Đang import...' : 'Import'}
            </button>
          </div>

          {/* Import Result */}
          {rosterResult && (
            <div className="mt-4 rounded border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                ✅ Import thành công!
              </p>
              <ul className="mt-2 space-y-1 text-xs text-green-700">
                <li>Lớp: <strong>{rosterResult.section.name}</strong> ({rosterResult.section.semester})</li>
                <li>Đã import: <strong>{rosterResult.imported}</strong> / {rosterResult.total} sinh viên</li>
                {rosterResult.skipped.length > 0 && (
                  <li className="text-orange-700">
                    Bỏ qua: {rosterResult.skipped.length} (
                    {rosterResult.skipped.slice(0, 3).map(s => s.reason).join(', ')}
                    {rosterResult.skipped.length > 3 && '...'}
                    )
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
          <button
            onClick={fetchSections}
            className="ml-2 font-medium underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* Section Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">
              {editingSection ? 'Edit Section' : 'Create Section'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label
                  htmlFor="section-name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Name
                </label>
                <input
                  id="section-name"
                  type="text"
                  required
                  maxLength={100}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g., OOP - INT2204 - K68"
                />
              </div>

              {/* Semester */}
              <div>
                <label
                  htmlFor="section-semester"
                  className="block text-sm font-medium text-gray-700"
                >
                  Semester
                </label>
                <input
                  id="section-semester"
                  type="text"
                  required
                  maxLength={20}
                  value={formData.semester}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      semester: e.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g., 2024-1"
                />
              </div>

              {/* Instructor */}
              <div>
                <label
                  htmlFor="section-instructor"
                  className="block text-sm font-medium text-gray-700"
                >
                  Instructor
                </label>
                <select
                  id="section-instructor"
                  value={formData.instructor_id || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      instructor_id: e.target.value || null,
                    }))
                  }
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">-- No instructor --</option>
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.username} ({instructor.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
                >
                  {submitting
                    ? 'Saving...'
                    : editingSection
                      ? 'Update'
                      : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Section Table */}
      {loading ? (
        <LoadingIndicator label="Loading sections..." />
      ) : sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No class sections yet.</p>
          <button
            onClick={openCreateForm}
            className="mt-3 text-sm font-medium text-primary hover:text-primary-600"
          >
            Create your first section
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Semester
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Instructor
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sections.map((section) => (
                <tr key={section.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="text-sm font-medium text-gray-900">
                      {section.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {section.semester}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {section.instructor ? (
                      <span className="text-sm text-gray-700">
                        {section.instructor.username}
                      </span>
                    ) : instructors.length > 0 ? (
                      <select
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 focus:border-primary focus:outline-none"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssignInstructor(section.id, e.target.value)
                          }
                        }}
                      >
                        <option value="">Assign instructor...</option>
                        {instructors.map((instructor) => (
                          <option key={instructor.id} value={instructor.id}>
                            {instructor.username}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs italic text-gray-400">
                        Not assigned
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <button
                      onClick={() => openEditForm(section)}
                      className="mr-3 text-sm font-medium text-primary hover:text-primary-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(section.id)}
                      disabled={deletingId === section.id}
                      className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      {deletingId === section.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
