import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, SectionIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface InstructorInfo {
  id: string
  fullName?: string | null
  username?: string | null
  email?: string | null
}

export interface InstructorSection {
  id: string
  name: string
  semester: string
  instructorId: string
  createdAt: string
  instructor: InstructorInfo | null
}

export function InstructorSectionsPage() {
  const [sections, setSections] = useState<InstructorSection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSections()
  }, [])

  async function fetchSections() {
    setLoading(true)
    try {
      const response = await api.get('/api/instructor/sections')
      setSections(response.data)
    } catch {
      toast.error('Không thể tải danh sách lớp. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải lớp học..." />
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Lớp của tôi</h1>
        <p className="mt-1 text-sm text-gray-500">{sections.length} lớp được phân công</p>
      </div>

      {sections.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <SectionIcon className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">Bạn chưa được phân công lớp nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.id}
              to={`/instructor/classes/${section.id}`}
              className="card-hover flex flex-col gap-3 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <SectionIcon className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold text-gray-900">{section.name}</h2>
                </div>
                <span className="badge-blue shrink-0">{section.semester}</span>
              </div>
              {section.instructor && (
                <p className="text-sm text-gray-500">
                  Giảng viên: {section.instructor.fullName || section.instructor.username || '—'}
                </p>
              )}
              <span className="mt-auto text-sm font-medium text-primary">Xem chi tiết →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
