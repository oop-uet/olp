import { createBrowserRouter } from 'react-router-dom'
import { AuthGuard } from './AuthGuard'
import { RoleRedirect } from './RoleRedirect'
import { AppLayout } from '../components/layout/AppLayout'
import { LoginPage } from '../pages/LoginPage'
import { ChangePasswordPage } from '../pages/ChangePasswordPage'
import { ExerciseManagerPage } from '../pages/instructor/ExerciseManagerPage'
import { ExerciseFormPage } from '../pages/instructor/ExerciseFormPage'
import { TestCaseEditorPage } from '../pages/instructor/TestCaseEditorPage'
import { SubmissionReviewPage } from '../pages/instructor/SubmissionReviewPage'
import { LeaderboardPage } from '../pages/instructor/LeaderboardPage'
import {
  ExerciseListPage,
  ExerciseWorkspacePage,
  SubmissionHistoryPage,
  SubmissionDetailPage,
  ProgressPage,
} from '../pages/student'
import { ConfigPage, QuotaPage } from '../pages/admin'
import { SectionManagerPage } from '../pages/admin/SectionManagerPage'
import { StudentImportPage } from '../pages/admin/StudentImportPage'

// Layout wrapper for authenticated routes
function AuthenticatedLayout() {
  return <AppLayout />
}

export const router = createBrowserRouter([
  // Public routes
  {
    path: '/login',
    element: <LoginPage />,
  },

  // Change password (required on first login)
  {
    path: '/change-password',
    element: <ChangePasswordPage />,
  },

  // Root redirect based on role
  {
    path: '/',
    element: <RoleRedirect />,
  },

  // Student routes
  {
    path: '/student',
    element: (
      <AuthGuard allowedRoles={['student']}>
        <AuthenticatedLayout />
      </AuthGuard>
    ),
    children: [
      {
        path: 'exercises',
        element: <ExerciseListPage />,
      },
      {
        path: 'exercises/:id',
        element: <ExerciseWorkspacePage />,
      },
      {
        path: 'submissions',
        element: <SubmissionHistoryPage />,
      },
      {
        path: 'submissions/:id',
        element: <SubmissionDetailPage />,
      },
      {
        path: 'progress',
        element: <ProgressPage />,
      },
    ],
  },

  // Instructor routes
  {
    path: '/instructor',
    element: (
      <AuthGuard allowedRoles={['instructor']}>
        <AuthenticatedLayout />
      </AuthGuard>
    ),
    children: [
      {
        path: 'exercises',
        element: <ExerciseManagerPage />,
      },
      {
        path: 'exercises/new',
        element: <ExerciseFormPage />,
      },
      {
        path: 'exercises/:id/edit',
        element: <ExerciseFormPage />,
      },
      {
        path: 'exercises/:id/testcases',
        element: <TestCaseEditorPage />,
      },
      {
        path: 'submissions',
        element: <SubmissionReviewPage />,
      },
      {
        path: 'leaderboard',
        element: <LeaderboardPage />,
      },
    ],
  },

  // Admin routes
  {
    path: '/admin',
    element: (
      <AuthGuard allowedRoles={['admin']}>
        <AuthenticatedLayout />
      </AuthGuard>
    ),
    children: [
      {
        path: 'sections',
        element: <SectionManagerPage />,
      },
      {
        path: 'sections/:id/students',
        element: <StudentImportPage />,
      },
      {
        path: 'config',
        element: <ConfigPage />,
      },
      {
        path: 'quota',
        element: <QuotaPage />,
      },
    ],
  },
], { basename: '/olp' })
