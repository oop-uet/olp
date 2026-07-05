import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner, StudentsIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserRow {
  id: string
  username: string
  email: string
  role: string
  fullName: string
  mustChangePassword: boolean
  lockedUntil: string | null
  createdAt: string
  sections: { id: string; name: string; semester: string }[]
}

interface UserFormData {
  fullName: string
  username: string
  email: string
  password: string
}

const EMPTY_FORM: UserFormData = {
  fullName: '',
  username: '',
  email: '',
  password: '',
}

function formatDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('vi-VN')
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StudentManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'username' | 'fullName' | 'email' | 'createdAt' | ''>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  const sortedUsers = useMemo(() => {
    if (!sortField) return users
    return [...users].sort((a, b) => {
      const valA = (a[sortField] || '').toLowerCase()
      const valB = (b[sortField] || '').toLowerCase()
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [users, sortField, sortOrder])

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE
    return sortedUsers.slice(startIndex, startIndex + PAGE_SIZE)
  }, [sortedUsers, currentPage])

  const totalPages = Math.ceil(sortedUsers.length / PAGE_SIZE)

  const toggleSort = (field: 'username' | 'fullName' | 'email' | 'createdAt') => {
    setCurrentPage(1)
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [formData, setFormData] = useState<UserFormData>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const [busyId, setBusyId] = useState<string | null>(null)

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchUsers = useCallback(async (searchTerm = '') => {
    setLoading(true)
    setCurrentPage(1)
    try {
      const response = await api.get('/api/admin/users', {
        params: { role: 'student', ...(searchTerm ? { search: searchTerm } : {}) },
      })
      setUsers(response.data)
    } catch {
      toast.error('Không thể tải danh sách sinh viên. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    fetchUsers(search.trim())
  }

  // ─── Form Handlers ─────────────────────────────────────────────────────

  function openCreateForm() {
    setEditing(null)
    setFormData(EMPTY_FORM)
    setShowForm(true)
  }

  function openEditForm(user: UserRow) {
    setEditing(user)
    setFormData({
      fullName: user.fullName ?? '',
      username: user.username,
      email: user.email,
      password: '',
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setFormData(EMPTY_FORM)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editing) {
        await api.put(`/api/admin/users/${editing.id}`, {
          email: formData.email,
          fullName: formData.fullName,
          username: formData.username,
        })
        toast.success('Cập nhật sinh viên thành công.')
      } else {
        await api.post('/api/admin/users', {
          username: formData.username,
          email: formData.email,
          fullName: formData.fullName,
          role: 'student',
          ...(formData.password ? { password: formData.password } : {}),
        })
        toast.success('Tạo sinh viên thành công.')
      }
      closeForm()
      fetchUsers(search.trim())
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      const message =
        axiosErr.response?.data?.error?.message ||
        `Không thể ${editing ? 'cập nhật' : 'tạo'} sinh viên.`
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Row Actions ─────────────────────────────────────────────────────────

  async function handleResetPassword(user: UserRow) {
    if (
      !window.confirm(`Đặt lại mật khẩu của "${user.username}" về tên đăng nhập?`)
    )
      return
    setBusyId(user.id)
    try {
      await api.post(`/api/admin/users/${user.id}/reset-password`, {})
      toast.success('Đã đặt lại mật khẩu về tên đăng nhập')
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(
        axiosErr.response?.data?.error?.message || 'Không thể đặt lại mật khẩu.'
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(user: UserRow) {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa sinh viên "${user.username}"?`))
      return
    setBusyId(user.id)
    try {
      await api.delete(`/api/admin/users/${user.id}`)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      toast.success('Đã xóa sinh viên.')
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(axiosErr.response?.data?.error?.message || 'Không thể xóa sinh viên.')
    } finally {
      setBusyId(null)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary">
            <StudentsIcon className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-semibold text-gray-800">Quản lý sinh viên</h1>
        </div>
        <button onClick={openCreateForm} className="btn-primary">
          Tạo sinh viên
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input max-w-sm"
          placeholder="Tìm theo họ tên, MSSV, email..."
        />
        <button type="submit" className="btn-secondary">
          Tìm kiếm
        </button>
      </form>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">
              {editing ? 'Chỉnh sửa sinh viên' : 'Tạo sinh viên'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="student-fullname" className="label">
                  Họ tên
                </label>
                <input
                  id="student-fullname"
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, fullName: e.target.value }))
                  }
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="student-username" className="label">
                  MSSV (tên đăng nhập)
                </label>
                <input
                  id="student-username"
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, username: e.target.value }))
                  }
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="student-email" className="label">
                  Email
                </label>
                <input
                  id="student-email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="input"
                />
              </div>
              {!editing && (
                <div>
                  <label htmlFor="student-password" className="label">
                    Mật khẩu (để trống = dùng tên đăng nhập)
                  </label>
                  <input
                    id="student-password"
                    type="text"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, password: e.target.value }))
                    }
                    className="input"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="btn-secondary">
                  Hủy
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? (
                    <>
                      <Spinner /> Đang lưu...
                    </>
                  ) : editing ? (
                    'Cập nhật'
                  ) : (
                    'Tạo'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <PageLoader label="Đang tải danh sách sinh viên..." />
      ) : users.length === 0 ? (
        <div className="card flex flex-col items-center justify-center border-dashed p-12 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <StudentsIcon className="h-7 w-7" />
          </span>
          <p className="text-gray-500">Chưa có sinh viên nào.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th text-center w-16 select-none">STT</th>
                <th
                  onClick={() => toggleSort('username')}
                  className="table-th cursor-pointer hover:bg-gray-100 transition-colors select-none"
                >
                  Mã sinh viên {sortField === 'username' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th
                  onClick={() => toggleSort('fullName')}
                  className="table-th cursor-pointer hover:bg-gray-100 transition-colors select-none"
                >
                  Họ tên {sortField === 'fullName' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th
                  onClick={() => toggleSort('email')}
                  className="table-th cursor-pointer hover:bg-gray-100 transition-colors select-none"
                >
                  Email {sortField === 'email' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th className="table-th">Lớp học phần</th>
                <th
                  onClick={() => toggleSort('createdAt')}
                  className="table-th cursor-pointer hover:bg-gray-100 transition-colors select-none"
                >
                  Ngày tạo {sortField === 'createdAt' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th className="table-th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedUsers.map((user, index) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="table-td text-center text-slate-500 font-bold">
                    {index + 1 + (currentPage - 1) * PAGE_SIZE}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{user.username}</span>
                      {user.mustChangePassword && (
                        <span className="badge-yellow">Phải đổi MK</span>
                      )}
                    </div>
                  </td>
                  <td className="table-td text-gray-700">{user.fullName || '—'}</td>
                  <td className="table-td text-gray-700">{user.email}</td>
                  <td className="table-td">
                    {user.sections && user.sections.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.sections.map((section) => (
                          <Link
                            key={section.id}
                            to={`/admin/sections/${section.id}`}
                            className="badge-blue hover:opacity-80"
                          >
                            {section.name}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="table-td text-gray-500">{formatDate(user.createdAt)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => openEditForm(user)}
                      disabled={busyId === user.id}
                      className="mr-3 text-sm font-medium text-primary hover:text-primary-700 disabled:opacity-50"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => handleResetPassword(user)}
                      disabled={busyId === user.id}
                      className="mr-3 text-sm font-medium text-warning-600 hover:text-warning-700 disabled:opacity-50"
                    >
                      Đặt lại mật khẩu
                    </button>
                    <button
                      onClick={() => handleDelete(user)}
                      disabled={busyId === user.id}
                      className="text-sm font-medium text-danger-600 hover:text-danger-700 disabled:opacity-50"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex justify-between items-center text-xs text-slate-500 p-4 border-t border-slate-100 bg-white">
              <div>
                Hiển thị {Math.min(sortedUsers.length, (currentPage - 1) * PAGE_SIZE + 1)} đến{' '}
                {Math.min(sortedUsers.length, currentPage * PAGE_SIZE)} trong tổng số{' '}
                {sortedUsers.length} sinh viên
              </div>
              <div className="flex gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent font-bold text-slate-600"
                >
                  Trước
                </button>
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`px-2.5 py-1 border rounded font-bold ${
                      currentPage === i + 1
                        ? 'bg-primary text-white border-primary'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent font-bold text-slate-600"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
