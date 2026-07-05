import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { cachedGet } from '../../lib/api'
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
      const response = await cachedGet('/api/instructor/sections')
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

  // Group sections by semester
  const sectionsBySemester: Record<string, InstructorSection[]> = {}
  for (const s of sections) {
    if (!sectionsBySemester[s.semester]) {
      sectionsBySemester[s.semester] = []
    }
    sectionsBySemester[s.semester].push(s)
  }

  // Sort semesters in reverse chronological order if possible (simple alphabetical sort for strings like "Học kỳ I...")
  const sortedSemesters = Object.keys(sectionsBySemester).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 p-6 text-white shadow-md border-b-4 border-secondary">
        <h1 className="text-2xl font-black font-sans uppercase tracking-wide">Quản Lý Lớp Học</h1>
        <p className="text-xs text-white/70 mt-1 font-semibold">Danh sách các lớp học phần được phân công giảng dạy</p>
      </div>

      {sections.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center border border-slate-100 shadow-sm">
          <SectionIcon className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-500 font-medium">Bạn chưa được phân công lớp nào.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedSemesters.map((semester) => (
            <div key={semester} className="space-y-4">
              
              {/* Semester group title banner */}
              <div className="flex items-center gap-2 border-l-4 border-primary pl-3 py-0.5">
                <h2 className="text-base font-bold text-slate-800 tracking-wide uppercase">
                  {semester}
                </h2>
                <span className="bg-primary-50 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ring-primary/10">
                  {sectionsBySemester[semester].length} Lớp
                </span>
              </div>

              {/* Grid of classes */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {sectionsBySemester[semester].map((section) => (
                  <Link
                    key={section.id}
                    to={`/instructor/classes/${section.id}`}
                    className="card-hover flex flex-col justify-between gap-4 p-5 bg-white border border-slate-100 shadow-sm relative overflow-hidden group hover:border-primary-500/30"
                  >
                    {/* Top corner hover accent decoration */}
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary-500/10 to-transparent rounded-bl-full translate-x-4 -translate-y-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"></div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary transition-colors group-hover:bg-gradient-to-br group-hover:from-primary-800 group-hover:to-primary group-hover:text-white">
                          <SectionIcon className="h-4.5 w-4.5" />
                        </span>
                        <h3 className="font-bold text-slate-800 text-base leading-tight group-hover:text-primary-700 transition-colors">
                          {section.name}
                        </h3>
                      </div>
                      
                      {section.instructor && (
                        <p className="text-xs text-slate-400 font-semibold pl-10">
                          Giảng viên: <span className="text-slate-600 font-bold">{section.instructor.fullName || section.instructor.username}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-50 pt-3 mt-2 text-xs">
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Chi tiết lớp</span>
                      <span className="font-bold text-primary group-hover:translate-x-1 transition-transform duration-200">
                        Xem chi tiết →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  )
}
