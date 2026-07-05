import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, SectionIcon } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface StudentSection {
  id: string
  name: string
  semester: string
}

export function StudentSectionsPage() {
  const [sections, setSections] = useState<StudentSection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSections()
  }, [])

  async function fetchSections() {
    setLoading(true)
    try {
      const response = await api.get('/api/students/sections')
      setSections(response.data)
    } catch {
      toast.error('Không thể tải danh sách lớp học phần. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoader label="Đang tải danh sách lớp..." />
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">CÁC LỚP HỌC PHẦN</h1>
      </div>

      {sections.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <SectionIcon className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-500 font-medium">Bạn chưa được ghi danh vào lớp học phần nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.id}
              to={`/student/classes/${section.id}`}
              className="card group hover:shadow-md transition-all duration-200 flex flex-col gap-4 p-6 border border-slate-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-200">
                    <SectionIcon className="h-5 w-5" />
                  </span>
                  <h2 className="font-semibold text-slate-800 group-hover:text-primary transition-colors duration-200">
                    {section.name}
                  </h2>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-50">
                <span className="badge-blue font-medium">{section.semester}</span>
                <span className="text-xs font-semibold text-primary group-hover:translate-x-1 transition-transform duration-200 flex items-center gap-1">
                  Vào học phần →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
