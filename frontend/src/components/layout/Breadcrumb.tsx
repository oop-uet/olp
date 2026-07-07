import { Link, useLocation } from 'react-router-dom'

/** Maps known route segments to Vietnamese labels for the breadcrumb trail. */
const segmentLabels: Record<string, string> = {
  // Role roots
  student: 'Sinh viên',
  instructor: 'Giảng viên',
  admin: 'Quản trị',
  // Student
  exercises: 'Bài tập',
  submissions: 'Bài nộp',
  progress: 'Tiến độ',
  leaderboard: 'Bảng xếp hạng',
  // Instructor
  classes: 'Lớp của tôi',
  plagiarism: 'Kiểm tra mã nguồn',
  // Admin
  dashboard: 'Tổng quan',
  instructors: 'Giảng viên',
  students: 'Sinh viên',
  sections: 'Lớp học phần',
  config: 'Cấu hình',
  // Common
  'change-password': 'Đổi mật khẩu',
}

function labelFor(segment: string): string {
  if (segmentLabels[segment]) return segmentLabels[segment]
  // Dynamic ids (numeric or uuid-like) -> generic label
  if (/^[0-9a-fA-F-]+$/.test(segment)) return 'Chi tiết'
  return segment
}

/**
 * Light breadcrumb bar shown under the navbar: "Trang chủ / {current section}".
 * The trail is derived from the current route path.
 */
export function Breadcrumb() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  // Build cumulative crumbs so each item links to its own path.
  const crumbs = segments.map((segment, index) => ({
    label: labelFor(segment),
    to: '/' + segments.slice(0, index + 1).join('/'),
  }))

  return (
    <nav aria-label="Breadcrumb" className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-none items-center gap-1 px-4 py-2 text-sm text-gray-500 lg:px-8">
        <Link to="/" className="font-medium text-gray-600 hover:text-primary">
          Trang chủ
        </Link>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <span key={crumb.to} className="flex items-center gap-1">
              <span className="text-gray-300">/</span>
              {isLast ? (
                <span className="font-medium text-gray-800">{crumb.label}</span>
              ) : (
                <Link to={crumb.to} className="hover:text-primary">
                  {crumb.label}
                </Link>
              )}
            </span>
          )
        })}
      </div>
    </nav>
  )
}
