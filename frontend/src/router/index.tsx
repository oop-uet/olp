import { createBrowserRouter, useRouteError } from 'react-router-dom'
import { lazy, Suspense, ReactNode } from 'react'
import { AuthGuard } from './AuthGuard'
import { RoleRedirect } from './RoleRedirect'
import { AppLayout } from '../components/layout/AppLayout'
import { PageLoader } from '../components/ui/PageLoader'

// ─── Global Error Boundary ──────────────────────────────────────────────────
// Catches dynamic import / chunk loading errors caught by React Router
// and reloads the window to retrieve the latest script chunks.
function GlobalErrorBoundary() {
  const error = useRouteError() as any
  const errorMessage = error?.message || error?.toString() || ''

  const isChunkError =
    errorMessage.includes('Failed to fetch dynamically imported module') ||
    errorMessage.includes('error loading dynamically imported module')

  if (isChunkError) {
    console.warn('Dynamic import chunk error caught. Reloading page to fetch latest version...')
    window.location.reload()
    return <PageLoader label="Đang tải phiên bản mới..." />
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="card max-w-md p-8 border border-slate-100 shadow-sm space-y-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-bold text-slate-800">Đã xảy ra lỗi tải trang</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          {error?.message || 'Có lỗi xảy ra trong quá trình xử lý.'}
        </p>
        <button onClick={() => window.location.reload()} className="btn-primary w-full py-2">
          Tải lại trang
        </button>
      </div>
    </div>
  )
}

// ─── Lazy-loaded pages ───────────────────────────────────────────────────────
// Each page becomes its own chunk. Heavy pages (Monaco editor) only load when
// the route is visited, keeping the initial bundle small and the app fast.

const LoginPage = lazy(() => import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const ChangePasswordPage = lazy(() => import('../pages/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })))

// Student
const StudentCourseDetailPage = lazy(() => import('../pages/student/StudentCourseDetailPage').then((m) => ({ default: m.StudentCourseDetailPage })))
const ExerciseWorkspacePage = lazy(() => import('../pages/student/ExerciseWorkspacePage').then((m) => ({ default: m.ExerciseWorkspacePage })))
const SubmissionHistoryPage = lazy(() => import('../pages/student/SubmissionHistoryPage').then((m) => ({ default: m.SubmissionHistoryPage })))
const SubmissionDetailPage = lazy(() => import('../pages/student/SubmissionDetailPage').then((m) => ({ default: m.SubmissionDetailPage })))
const StudentLeaderboardPage = lazy(() => import('../pages/student/StudentLeaderboardPage').then((m) => ({ default: m.StudentLeaderboardPage })))

// Instructor
const ExerciseManagerPage = lazy(() => import('../pages/instructor/ExerciseManagerPage').then((m) => ({ default: m.ExerciseManagerPage })))
const ExerciseFormPage = lazy(() => import('../pages/instructor/ExerciseFormPage').then((m) => ({ default: m.ExerciseFormPage })))
const TestCaseEditorPage = lazy(() => import('../pages/instructor/TestCaseEditorPage').then((m) => ({ default: m.TestCaseEditorPage })))
const SubmissionReviewPage = lazy(() => import('../pages/instructor/SubmissionReviewPage').then((m) => ({ default: m.SubmissionReviewPage })))
const LeaderboardPage = lazy(() => import('../pages/instructor/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })))
const PlagiarismPage = lazy(() => import('../pages/instructor/PlagiarismPage').then((m) => ({ default: m.PlagiarismPage })))
const ProjectAssignmentPage = lazy(() => import('../pages/instructor/ProjectAssignmentPage').then((m) => ({ default: m.ProjectAssignmentPage })))

// Admin
const AdminDashboardPage = lazy(() => import('../pages/admin/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const InstructorManagementPage = lazy(() => import('../pages/admin/InstructorManagementPage').then((m) => ({ default: m.InstructorManagementPage })))
const StudentManagementPage = lazy(() => import('../pages/admin/StudentManagementPage').then((m) => ({ default: m.StudentManagementPage })))
const SectionDetailPage = lazy(() => import('../pages/admin/SectionDetailPage').then((m) => ({ default: m.SectionDetailPage })))
const SectionManagerPage = lazy(() => import('../pages/admin/SectionManagerPage').then((m) => ({ default: m.SectionManagerPage })))
const AdminExercisesPage = lazy(() => import('../pages/admin/AdminExercisesPage').then((m) => ({ default: m.AdminExercisesPage })))
const AdminExerciseFormPage = lazy(() => import('../pages/admin/AdminExerciseFormPage').then((m) => ({ default: m.AdminExerciseFormPage })))
const StudentImportPage = lazy(() => import('../pages/admin/StudentImportPage').then((m) => ({ default: m.StudentImportPage })))
const ConfigPage = lazy(() => import('../pages/admin/ConfigPage').then((m) => ({ default: m.ConfigPage })))

// Instructor - classes
const InstructorSectionsPage = lazy(() => import('../pages/instructor/InstructorSectionsPage').then((m) => ({ default: m.InstructorSectionsPage })))
const InstructorSectionDetailPage = lazy(() => import('../pages/instructor/InstructorSectionDetailPage').then((m) => ({ default: m.InstructorSectionDetailPage })))
const InstructorCourseDetailPage = lazy(() => import('../pages/instructor/InstructorCourseDetailPage').then((m) => ({ default: m.InstructorCourseDetailPage })))
const InstructorStatisticPage = lazy(() => import('../pages/instructor/InstructorStatisticPage').then((m) => ({ default: m.InstructorStatisticPage })))
const InstructorStudentProfilePage = lazy(() => import('../pages/instructor/InstructorStudentProfilePage').then((m) => ({ default: m.InstructorStudentProfilePage })))

// Shared (admin + instructor)
const SectionSchedulePage = lazy(() => import('../pages/SectionSchedulePage').then((m) => ({ default: m.SectionSchedulePage })))

// Wrap a lazy element with Suspense fallback
function withSuspense(node: ReactNode): ReactNode {
  return <Suspense fallback={<PageLoader />}>{node}</Suspense>
}

export const router = createBrowserRouter(
  [
    // Public routes
    { path: '/login', element: withSuspense(<LoginPage />), errorElement: <GlobalErrorBoundary /> },
    { path: '/change-password', element: withSuspense(<ChangePasswordPage />), errorElement: <GlobalErrorBoundary /> },

    // Root redirect based on role
    { path: '/', element: <RoleRedirect />, errorElement: <GlobalErrorBoundary /> },

    // Student routes
    {
      path: '/student',
      element: (
        <AuthGuard allowedRoles={['student']}>
          <AppLayout />
        </AuthGuard>
      ),
      errorElement: <GlobalErrorBoundary />,
      children: [
        { path: 'exercises', element: withSuspense(<StudentCourseDetailPage />) },
        { path: 'classes/:id', element: withSuspense(<StudentCourseDetailPage />) },
        { path: 'classes/:id/students/:studentId/profile', element: withSuspense(<InstructorStudentProfilePage />) },
        { path: 'exercises/:id', element: withSuspense(<ExerciseWorkspacePage />) },
        { path: 'submissions', element: withSuspense(<SubmissionHistoryPage />) },
        { path: 'submissions/:id', element: withSuspense(<SubmissionDetailPage />) },
        { path: 'leaderboard', element: withSuspense(<StudentLeaderboardPage />) },
      ],
    },

    // Instructor routes
    {
      path: '/instructor',
      element: (
        <AuthGuard allowedRoles={['instructor']}>
          <AppLayout />
        </AuthGuard>
      ),
      errorElement: <GlobalErrorBoundary />,
      children: [
        { path: 'exercises', element: withSuspense(<ExerciseManagerPage />) },
        { path: 'exercises/new', element: withSuspense(<ExerciseFormPage />) },
        { path: 'exercises/:id/edit', element: withSuspense(<ExerciseFormPage />) },
        { path: 'exercises/:id/testcases', element: withSuspense(<TestCaseEditorPage />) },
        { path: 'classes', element: withSuspense(<InstructorSectionsPage />) },
        { path: 'classes/:id', element: withSuspense(<InstructorCourseDetailPage />) },
        { path: 'classes/:id/students', element: withSuspense(<InstructorSectionDetailPage />) },
        { path: 'classes/:id/students/:studentId/profile', element: withSuspense(<InstructorStudentProfilePage />) },
        { path: 'classes/:id/schedule', element: withSuspense(<SectionSchedulePage />) },
        { path: 'classes/:sectionId/projects/:exerciseId', element: withSuspense(<ProjectAssignmentPage />) },
        { path: 'course/:id', element: withSuspense(<InstructorCourseDetailPage />) },
        { path: 'statistic', element: withSuspense(<InstructorStatisticPage />) },
        { path: 'submissions', element: withSuspense(<SubmissionReviewPage />) },
        { path: 'leaderboard', element: withSuspense(<LeaderboardPage />) },
        { path: 'plagiarism', element: withSuspense(<PlagiarismPage />) },
      ],
    },

    // Admin routes
    {
      path: '/admin',
      element: (
        <AuthGuard allowedRoles={['admin']}>
          <AppLayout />
        </AuthGuard>
      ),
      errorElement: <GlobalErrorBoundary />,
      children: [
        { path: 'dashboard', element: withSuspense(<AdminDashboardPage />) },
        { path: 'instructors', element: withSuspense(<InstructorManagementPage />) },
        { path: 'students', element: withSuspense(<StudentManagementPage />) },
        { path: 'sections', element: withSuspense(<SectionManagerPage />) },
        { path: 'sections/:id', element: withSuspense(<SectionDetailPage />) },
        { path: 'sections/:id/schedule', element: withSuspense(<SectionSchedulePage />) },
        { path: 'sections/:id/students', element: withSuspense(<StudentImportPage />) },
        { path: 'exercises', element: withSuspense(<AdminExercisesPage />) },
        { path: 'exercises/new', element: withSuspense(<AdminExerciseFormPage />) },
        { path: 'exercises/:id/edit', element: withSuspense(<AdminExerciseFormPage />) },
        { path: 'config', element: withSuspense(<ConfigPage />) },
      ],
    },
  ],
  { basename: '/olp' }
)
