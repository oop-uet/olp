import { createBrowserRouter } from 'react-router-dom'
import { lazy, Suspense, ReactNode } from 'react'
import { AuthGuard } from './AuthGuard'
import { RoleRedirect } from './RoleRedirect'
import { AppLayout } from '../components/layout/AppLayout'
import { PageLoader } from '../components/ui/PageLoader'

// ─── Lazy-loaded pages ───────────────────────────────────────────────────────
// Each page becomes its own chunk. Heavy pages (Monaco editor) only load when
// the route is visited, keeping the initial bundle small and the app fast.

const LoginPage = lazy(() => import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const ChangePasswordPage = lazy(() => import('../pages/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })))

// Student
const StudentSectionsPage = lazy(() => import('../pages/student/StudentSectionsPage').then((m) => ({ default: m.StudentSectionsPage })))
const StudentCourseDetailPage = lazy(() => import('../pages/student/StudentCourseDetailPage').then((m) => ({ default: m.StudentCourseDetailPage })))
const ExerciseWorkspacePage = lazy(() => import('../pages/student/ExerciseWorkspacePage').then((m) => ({ default: m.ExerciseWorkspacePage })))
const SubmissionHistoryPage = lazy(() => import('../pages/student/SubmissionHistoryPage').then((m) => ({ default: m.SubmissionHistoryPage })))
const SubmissionDetailPage = lazy(() => import('../pages/student/SubmissionDetailPage').then((m) => ({ default: m.SubmissionDetailPage })))
const ProgressPage = lazy(() => import('../pages/student/ProgressPage').then((m) => ({ default: m.ProgressPage })))
const StudentLeaderboardPage = lazy(() => import('../pages/student/StudentLeaderboardPage').then((m) => ({ default: m.StudentLeaderboardPage })))

// Instructor
const ExerciseManagerPage = lazy(() => import('../pages/instructor/ExerciseManagerPage').then((m) => ({ default: m.ExerciseManagerPage })))
const ExerciseFormPage = lazy(() => import('../pages/instructor/ExerciseFormPage').then((m) => ({ default: m.ExerciseFormPage })))
const TestCaseEditorPage = lazy(() => import('../pages/instructor/TestCaseEditorPage').then((m) => ({ default: m.TestCaseEditorPage })))
const SubmissionReviewPage = lazy(() => import('../pages/instructor/SubmissionReviewPage').then((m) => ({ default: m.SubmissionReviewPage })))
const LeaderboardPage = lazy(() => import('../pages/instructor/LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })))
const PlagiarismPage = lazy(() => import('../pages/instructor/PlagiarismPage').then((m) => ({ default: m.PlagiarismPage })))

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
const QuotaPage = lazy(() => import('../pages/admin/QuotaPage').then((m) => ({ default: m.QuotaPage })))

// Instructor - classes
const InstructorSectionsPage = lazy(() => import('../pages/instructor/InstructorSectionsPage').then((m) => ({ default: m.InstructorSectionsPage })))
const InstructorSectionDetailPage = lazy(() => import('../pages/instructor/InstructorSectionDetailPage').then((m) => ({ default: m.InstructorSectionDetailPage })))
const InstructorCourseDetailPage = lazy(() => import('../pages/instructor/InstructorCourseDetailPage').then((m) => ({ default: m.InstructorCourseDetailPage })))
const InstructorStatisticPage = lazy(() => import('../pages/instructor/InstructorStatisticPage').then((m) => ({ default: m.InstructorStatisticPage })))

// Shared (admin + instructor)
const SectionSchedulePage = lazy(() => import('../pages/SectionSchedulePage').then((m) => ({ default: m.SectionSchedulePage })))

// Wrap a lazy element with Suspense fallback
function withSuspense(node: ReactNode): ReactNode {
  return <Suspense fallback={<PageLoader />}>{node}</Suspense>
}

export const router = createBrowserRouter(
  [
    // Public routes
    { path: '/login', element: withSuspense(<LoginPage />) },
    { path: '/change-password', element: withSuspense(<ChangePasswordPage />) },

    // Root redirect based on role
    { path: '/', element: <RoleRedirect /> },

    // Student routes
    {
      path: '/student',
      element: (
        <AuthGuard allowedRoles={['student']}>
          <AppLayout />
        </AuthGuard>
      ),
      children: [
        { path: 'exercises', element: withSuspense(<StudentSectionsPage />) },
        { path: 'classes/:id', element: withSuspense(<StudentCourseDetailPage />) },
        { path: 'exercises/:id', element: withSuspense(<ExerciseWorkspacePage />) },
        { path: 'submissions', element: withSuspense(<SubmissionHistoryPage />) },
        { path: 'submissions/:id', element: withSuspense(<SubmissionDetailPage />) },
        { path: 'progress', element: withSuspense(<ProgressPage />) },
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
      children: [
        { path: 'exercises', element: withSuspense(<ExerciseManagerPage />) },
        { path: 'exercises/new', element: withSuspense(<ExerciseFormPage />) },
        { path: 'exercises/:id/edit', element: withSuspense(<ExerciseFormPage />) },
        { path: 'exercises/:id/testcases', element: withSuspense(<TestCaseEditorPage />) },
        { path: 'classes', element: withSuspense(<InstructorSectionsPage />) },
        { path: 'classes/:id', element: withSuspense(<InstructorSectionDetailPage />) },
        { path: 'classes/:id/schedule', element: withSuspense(<SectionSchedulePage />) },
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
        { path: 'quota', element: withSuspense(<QuotaPage />) },
      ],
    },
  ],
  { basename: '/olp' }
)
