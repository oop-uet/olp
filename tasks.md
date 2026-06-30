# Implementation Plan: OOP Learning Platform

## Overview

This plan implements a zero-cost OOP learning platform for UET-VNU students. The architecture consists of a React + TypeScript frontend (GitHub Pages), Node.js + Express backend (Render), Turso database (Drizzle ORM), Cloudflare R2 storage, and a local Java executor agent. Tasks are ordered by dependency: infrastructure → database → backend → frontend → integration → testing → deployment.

## Tasks

- [x] 1. Project scaffolding and infrastructure setup
  - [x] 1.1 Initialize monorepo structure with shared TypeScript config
    - Create top-level directory structure: `frontend/`, `backend/`, `local-executor/`, `shared/`
    - Initialize `package.json` at root with workspaces configuration
    - Set up shared `tsconfig.base.json` with strict mode and path aliases
    - Add `.gitignore`, `.editorconfig`, and `.nvmrc` (Node 20 LTS)
    - _Requirements: 11.1, 11.2_

  - [x] 1.2 Scaffold backend project (Node.js + Express + TypeScript)
    - Initialize `backend/package.json` with Express 4.x, TypeScript, Drizzle ORM, `@libsql/client`, `jsonwebtoken`, `bcrypt`, `zod`, `@aws-sdk/client-s3`, `csv-parse`, `xlsx`
    - Create `backend/tsconfig.json` extending shared config
    - Set up `backend/src/index.ts` entry point with Express app bootstrap
    - Add development scripts (`dev`, `build`, `start`)
    - _Requirements: 11.2_

  - [x] 1.3 Scaffold frontend project (React + Vite + TypeScript)
    - Initialize Vite project with React 18 + TypeScript template in `frontend/`
    - Install dependencies: React Router v6, Zustand, Tailwind CSS, Headless UI, `@monaco-editor/react`, Axios
    - Configure Vite for GitHub Pages base path (`/`)
    - Set up Tailwind with UET-VNU brand colors (blue #003366, white #FFFFFF)
    - _Requirements: 9.1, 11.1, 11.8_

  - [x] 1.4 Scaffold Local Executor project (Java + Maven)
    - Create `local-executor/` directory with Maven build configuration
    - Set up `src/main/java/` source structure with package `vn.uet.oop.executor`
    - Add Java WebSocket library dependency (e.g., `java-websocket`)
    - Configure Maven Shade to produce fat JAR for distribution
    - _Requirements: 6.3_

- [x] 2. Database schema and ORM setup (Turso + Drizzle)
  - [x] 2.1 Define Drizzle schema for all database tables
    - Create `backend/src/db/schema.ts` with all tables: `users`, `class_sections`, `section_enrollments`, `exercises`, `exercise_assignments`, `test_cases`, `submissions`, `submission_results`, `anticheat_events`, `system_config`
    - Define column types, constraints, unique indexes, and foreign key relations
    - Add TypeScript type exports for inferred select/insert types
    - _Requirements: 1.1, 2.1, 4.1, 10.1_

  - [x] 2.2 Configure Drizzle with Turso libSQL client
    - Create `backend/src/db/client.ts` connecting to Turso via `@libsql/client`
    - Set up environment variables for `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
    - Create `backend/src/db/index.ts` exporting the drizzle instance
    - Add `drizzle-kit` configuration for migrations
    - _Requirements: 11.3_

  - [x] 2.3 Create database migration and seed scripts
    - Generate initial migration from schema using `drizzle-kit generate`
    - Create `backend/src/db/seed.ts` to seed default admin account and system_config defaults (warning_threshold=3, time_limit=60, max_submissions=10)
    - Add npm scripts for `db:migrate` and `db:seed`
    - _Requirements: 3.5_

- [x] 3. Authentication system (JWT + bcrypt)
  - [x] 3.1 Implement auth service (login, token management, lockout)
    - Create `backend/src/services/auth.service.ts` with `login`, `refreshToken`, `logout` methods
    - Hash passwords with bcrypt (salt rounds: 12)
    - Sign JWT access tokens (15min expiry) and refresh tokens (7d expiry) using `jsonwebtoken`
    - Implement failed attempt tracking and 15-minute account lockout after 5 failures
    - _Requirements: 1.1, 1.2, 1.4, 1.6_

  - [x] 3.2 Implement authentication middleware and role guards
    - Create `backend/src/middleware/auth.middleware.ts` that verifies JWT from Authorization header
    - Create `backend/src/middleware/role.guard.ts` with role-based access control (Student, Instructor, Admin)
    - Handle expired tokens by returning 401 with appropriate error code
    - _Requirements: 1.3, 1.5_

  - [x] 3.3 Implement auth API routes
    - Create `backend/src/routes/auth.routes.ts` with POST `/api/auth/login`, POST `/api/auth/refresh`, POST `/api/auth/logout`
    - Add Zod request validation schemas for login (username, password)
    - Return structured error responses per the design error format
    - _Requirements: 1.1, 1.2, 1.6_

  - [ ]* 3.4 Write property test for account lockout enforcement
    - **Property 9: Account Lockout Enforcement**
    - Test that 5 consecutive failures lock account for 15 minutes, valid credentials rejected during lock, accepted after expiry
    - **Validates: Requirements 1.6**

- [x] 4. Checkpoint - Core infrastructure verification
  - Ensure database connection, migrations, and auth endpoints work correctly. Run existing tests. Ask the user if questions arise.

- [x] 5. Backend API - Admin endpoints
  - [x] 5.1 Implement class section CRUD service and routes
    - Create `backend/src/services/section.service.ts` with create, update, delete, list, assignInstructor methods
    - Create `backend/src/routes/admin/section.routes.ts` with all section endpoints (GET, POST, PUT, DELETE)
    - Add Zod validation for section name, semester, instructor_id
    - _Requirements: 2.1, 2.4_

  - [x] 5.2 Implement student import/export service
    - Create `backend/src/services/import.service.ts` with CSV/Excel parsing (`csv-parse`, `xlsx`)
    - Validate each row: check required fields (student_id, full_name, email), validate email format, check for duplicates in target section
    - Return detailed report of skipped entries with reasons
    - Create export endpoint generating CSV with student_id, full_name, email, enrollment_date, current_score
    - _Requirements: 2.2, 2.3, 2.5_

  - [ ]* 5.3 Write property test for student import idempotency
    - **Property 4: Student Import Idempotency for Valid Entries**
    - Generate random CSV data with valid/invalid entries and verify import adds exactly valid non-duplicate entries
    - **Validates: Requirements 2.2, 2.5**

  - [x] 5.4 Implement system configuration service and routes
    - Create `backend/src/services/config.service.ts` with getConfig, updateConfig methods
    - Validate parameter ranges: Warning_Threshold (1-10), time_limit (1-180), max_submissions (1-100)
    - Reject out-of-range values, return valid range in error response
    - Create `backend/src/routes/admin/config.routes.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 5.5 Write property test for configuration parameter validation
    - **Property 5: Configuration Parameter Validation**
    - Generate random config update values and verify acceptance only when within valid range
    - **Validates: Requirements 3.2, 3.4, 3.5**

  - [x] 5.6 Implement quota monitoring service
    - Create `backend/src/services/quota.service.ts` that checks Turso/R2/Render usage
    - Implement GET `/api/admin/quota-status` endpoint
    - Log warnings when any service exceeds 80% of free-tier limits
    - _Requirements: 11.5, 11.7_

- [x] 6. Backend API - Instructor endpoints
  - [x] 6.1 Implement exercise CRUD service and routes
    - Create `backend/src/services/exercise.service.ts` with create, update, delete, list, getById, browseLibrary, assignToSection methods
    - Validate: title max 200 chars, description max 5000 chars, difficulty enum, 1-5 OOP tags, at least 1 test case on creation
    - Create `backend/src/routes/instructor/exercise.routes.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.6_

  - [x] 6.2 Implement test case CRUD service and routes
    - Create `backend/src/services/testcase.service.ts` with create, update, delete, list methods
    - Validate: input_data max 10KB, expected_output max 10KB, point_value 1-100, max 50 test cases per exercise
    - Ensure editing test cases does NOT retroactively change existing submission scores
    - Create `backend/src/routes/instructor/testcase.routes.ts`
    - _Requirements: 10.1, 10.2, 10.6_

  - [ ]* 6.3 Write property test for historical submission immutability
    - **Property 10: Historical Submission Immutability on Test Case Edit**
    - Verify that modifying test cases preserves existing submission scores
    - **Validates: Requirements 10.6**

  - [x] 6.4 Implement submission review and filtering
    - Create `backend/src/services/submission.service.ts` with list (filtered by exercise), getById methods for instructor view
    - Include student code, timestamp, per-test-case results (pass/fail, points), total score
    - Sort by submission timestamp descending
    - _Requirements: 5.1, 5.5_

  - [x] 6.5 Implement leaderboard service and route
    - Create `backend/src/services/leaderboard.service.ts` computing rankings
    - Rank by total score (sum of highest score per exercise) descending
    - Break ties by earliest latest-submission timestamp
    - Display: student name, student_id, total score, completed exercises count, rank
    - Create `backend/src/routes/instructor/leaderboard.routes.ts`
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ]* 6.6 Write property test for leaderboard ordering consistency
    - **Property 2: Leaderboard Ordering Consistency**
    - Generate random student/submission data and verify ordering invariants
    - **Validates: Requirements 5.2**

- [x] 7. Backend API - Student endpoints
  - [x] 7.1 Implement submission creation and scoring service
    - Create submission endpoint POST `/api/submissions` in `backend/src/routes/student/submission.routes.ts`
    - Evaluate code against all test cases (visible + hidden), calculate score using weighted formula
    - Enforce deadline: reject submissions after exercise deadline
    - Enforce max_submissions limit from system config
    - Store submission, results per test case, and update attempt_number
    - _Requirements: 6.7, 8.1, 10.3, 10.5_

  - [ ]* 7.2 Write property test for score calculation correctness
    - **Property 1: Score Calculation Correctness**
    - Generate random test case point values and pass/fail combinations, verify score formula
    - **Validates: Requirements 10.5**

  - [ ]* 7.3 Write property test for submission deadline enforcement
    - **Property 8: Submission Deadline Enforcement**
    - Generate random timestamps before/after deadline, verify accept/reject behavior
    - **Validates: Requirements 4.4**

  - [ ]* 7.4 Write property test for test case evaluation independence
    - **Property 6: Test Case Evaluation Independence**
    - Verify evaluation order does not affect individual test case results
    - **Validates: Requirements 10.3**

  - [x] 7.5 Implement student submission history and progress routes
    - Create GET `/api/submissions` (own submissions, grouped by exercise, sorted by most recent)
    - Create GET `/api/submissions/:id` (submission detail with visible test case results)
    - Create GET `/api/students/progress` returning completed exercises count, average score, rank
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 7.6 Implement anti-cheat event logging routes
    - Create POST `/api/anticheat/events` to log events (fullscreen_exit, visibility_hidden, window_blur)
    - Create GET `/api/submissions/:id/anticheat-log` for instructor access
    - Store event_type, timestamp, warning_count_at_event
    - _Requirements: 7.3, 7.4, 7.7_

  - [ ]* 7.7 Write property test for anti-cheat warning accumulation
    - **Property 3: Anti-Cheat Warning Accumulation**
    - Generate random event sequences and threshold values, verify nullification logic
    - **Validates: Requirements 7.3, 7.4, 7.5**

- [x] 8. Backend API - Role-based access enforcement
  - [x] 8.1 Apply role guards to all routes and write access control integration tests
    - Wire role middleware to all route groups: Admin-only, Instructor-only, Student-only, mixed
    - Verify students cannot access instructor/admin endpoints
    - Verify instructors cannot access admin endpoints
    - _Requirements: 1.3, 1.5_

  - [ ]* 8.2 Write property test for role-based access invariant
    - **Property 7: Role-Based Access Invariant**
    - Generate random user/role/endpoint combinations and verify access control
    - **Validates: Requirements 1.3, 1.5**

- [x] 9. Checkpoint - Backend API complete
  - Ensure all backend API endpoints work correctly, all property tests pass, and role-based access is enforced. Ask the user if questions arise.

- [x] 10. Cloudflare R2 storage integration
  - [x] 10.1 Implement R2 storage service
    - Create `backend/src/services/storage.service.ts` using `@aws-sdk/client-s3` with R2 endpoint
    - Implement `upload`, `download`, `delete`, `generatePresignedUrl` methods
    - Configure environment variables: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
    - _Requirements: 11.4_

  - [x] 10.2 Wire storage service to import/export endpoints
    - Store uploaded CSV/Excel files to R2 before processing
    - Generate export files and store temporarily in R2 with presigned download URLs
    - _Requirements: 2.2, 2.3, 11.4_

- [x] 11. Frontend - Core setup and shared components
  - [x] 11.1 Set up React Router, Zustand stores, and Axios interceptors
    - Configure React Router v6 with route structure per role (student, instructor, admin)
    - Create Zustand auth store (token, user, role, login/logout actions)
    - Set up Axios instance with JWT interceptor (attach token, handle 401 refresh)
    - Implement redirect-after-login logic preserving intended destination
    - _Requirements: 1.4, 1.5, 9.3_

  - [x] 11.2 Build shared layout components (Sidebar, Header, AuthGuard)
    - Create `AuthGuard` component that redirects unauthenticated users to login
    - Create responsive sidebar navigation with role-based menu items
    - Create header with UET-VNU logo and user info
    - Implement loading indicator component (displays within 200ms)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 11.3 Build Login page
    - Create login form with username/password fields
    - Display error messages for invalid credentials and account lockout
    - Show UET-VNU logo and branding
    - Handle redirect to role-appropriate dashboard on success
    - _Requirements: 1.1, 1.2, 1.6, 9.1_

- [x] 12. Frontend - Student panels
  - [x] 12.1 Build Student Exercise List and Exercise Workspace
    - Create exercise list page showing assigned exercises with title, difficulty, deadline, status
    - Build exercise workspace with Monaco Editor (Java syntax highlighting)
    - Display exercise description, requirements, starter code, and visible test cases
    - _Requirements: 6.1, 6.2, 9.2_

  - [x] 12.2 Build LocalExecutorBridge component (WebSocket to localhost:9876)
    - Create WebSocket client connecting to `ws://localhost:9876`
    - Implement message protocol: send compile_and_run requests, receive results
    - Handle connection errors with setup instructions and retry UI
    - Display compilation errors with line numbers, test results per case
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.8_

  - [x] 12.3 Build Anti-Cheat Monitor component
    - Implement fullscreen request on assessment start, block access if denied
    - Listen for `fullscreenchange`, `visibilitychange`, `blur` events
    - Track warning count, display "Warnings: X/T" indicator
    - Nullify score when warnings >= threshold, lock session
    - Send events to backend POST `/api/anticheat/events`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8_

  - [x] 12.4 Build Submission History and Progress Summary pages
    - Create submission history grouped by exercise, sorted by most recent
    - Show submission detail with code and visible test case results
    - Build progress summary: completed exercises, average score, rank
    - Handle empty state when no submissions exist
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 13. Frontend - Instructor panels
  - [x] 13.1 Build Exercise Manager (CRUD + Library browser)
    - Create exercise list with edit/delete actions
    - Build exercise creation form with title, description, difficulty, tags, starter code
    - Validate required fields client-side before submission
    - Build exercise library browser with assign-to-section action
    - _Requirements: 4.1, 4.2, 4.3, 4.6_

  - [x] 13.2 Build Test Case Editor
    - Create test case list for selected exercise
    - Build test case form: input data, expected output, visibility toggle, point value
    - Validate constraints (max 10KB per field, 1-100 points, max 50 cases per exercise)
    - _Requirements: 10.1, 10.2_

  - [x] 13.3 Build Submission Review and Leaderboard views
    - Create submission list filtered by exercise, sorted by timestamp descending
    - Build submission detail view with code, per-test-case results, anti-cheat log
    - Build leaderboard table: rank, name, student_id, total score, completed exercises
    - Auto-refresh leaderboard within 5 seconds of new submission
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.7_

- [x] 14. Frontend - Admin panels
  - [x] 14.1 Build Section Manager (CRUD + instructor assignment)
    - Create section list with create/edit/delete actions
    - Build section form: name, semester, instructor dropdown
    - Implement instructor assignment functionality
    - _Requirements: 2.1, 2.4_

  - [x] 14.2 Build Student Import/Export UI
    - Create file upload component for CSV/Excel import
    - Display import results report (success count, skipped rows with reasons)
    - Implement export download button (CSV format)
    - _Requirements: 2.2, 2.3, 2.5_

  - [x] 14.3 Build Configuration Panel and Quota Monitor
    - Create config form with Warning_Threshold, time_limit, max_submissions fields
    - Show valid ranges and current values, reject invalid inputs client-side
    - Build quota monitor dashboard showing free-tier usage percentages
    - Display warnings for services above 80% usage
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 11.7_

- [x] 15. Checkpoint - Frontend complete
  - Ensure all frontend pages render correctly, navigation works per role, and API integration functions. Ask the user if questions arise.

- [x] 16. Local Executor Agent (Java WebSocket server)
  - [x] 16.1 Implement WebSocket server and JDK detection
    - Create `Main.java` entry point that starts WebSocket server on port 9876
    - Implement `WebSocketServer.java` handling connections and message routing
    - Create `JdkDetector.java` checking `JAVA_HOME` and `which javac`
    - Return structured error if JDK not found with setup instructions
    - _Requirements: 6.3, 6.8_

  - [x] 16.2 Implement code compilation and execution with timeout
    - Create `CodeCompiler.java` that writes code to temp file and invokes `javac`
    - Create `CodeRunner.java` that invokes `java` with test case input piped to stdin
    - Create `TimeoutManager.java` enforcing configurable time limits via `Process.waitFor()`
    - Create `TestCaseEvaluator.java` comparing actual output to expected output (trimmed)
    - Return structured JSON: compilation status, errors with line numbers, test results per case
    - Clean up temp files after execution
    - _Requirements: 6.3, 6.4, 6.5, 6.6_

  - [x] 16.3 Build distributable JAR and write usage documentation
    - Configure Maven Shade to build fat JAR with all dependencies
    - Create `README.md` with download link, JDK requirements, and startup instructions
    - Add startup scripts for Windows (`start.bat`) and Unix (`start.sh`)
    - _Requirements: 6.3_

- [x] 17. Pre-built Exercise Library seed data
  - [x] 17.1 Create seed data for Exercise Library (minimum 14 exercises)
    - Create `backend/src/db/seed-exercises.ts` with exercises covering all OOP topics
    - Minimum 2 exercises per topic: classes/objects, inheritance, polymorphism, abstraction, encapsulation, interfaces, exception handling
    - Each exercise includes: title, description, difficulty, tags, starter code, and at least 3 test cases
    - _Requirements: 4.5_

- [x] 18. CI/CD Pipeline (GitHub Actions)
  - [x] 18.1 Create GitHub Actions workflow for frontend deployment
    - Create `.github/workflows/deploy-frontend.yml`
    - Trigger on push to main (frontend paths)
    - Steps: install, build (Vite), deploy to GitHub Pages (oop-uet.github.io)
    - _Requirements: 11.1, 11.6, 11.8_

  - [x] 18.2 Create GitHub Actions workflow for backend deployment
    - Create `.github/workflows/deploy-backend.yml`
    - Trigger on push to main (backend paths)
    - Steps: install, build, run tests, deploy to Render
    - Include test step running Vitest with coverage check (80% target)
    - _Requirements: 11.2, 11.6_

  - [x] 18.3 Create GitHub Actions workflow for PR checks
    - Create `.github/workflows/pr-check.yml`
    - Trigger on pull requests
    - Steps: lint, type-check, unit tests, property-based tests for both frontend and backend
    - _Requirements: 11.6_

- [x] 19. Testing setup and integration tests
  - [x] 19.1 Set up Vitest and fast-check testing infrastructure
    - Configure Vitest for backend (`backend/vitest.config.ts`) and frontend (`frontend/vitest.config.ts`)
    - Install `fast-check` for property-based testing
    - Install `supertest` for API integration testing
    - Install `@testing-library/react` for frontend component tests
    - Create test utility helpers (mock auth, test database setup/teardown)
    - _Requirements: 11.6_

  - [ ]* 19.2 Write integration tests for submission evaluation pipeline
    - Test full flow: create exercise → add test cases → submit code → verify scoring
    - Test deadline enforcement end-to-end
    - Test max_submissions limit enforcement
    - _Requirements: 6.7, 10.3, 10.5, 4.4_

  - [ ]* 19.3 Write integration tests for student import/export workflow
    - Test CSV upload → validation → import → export round-trip
    - Test edge cases: UTF-8 encoding, special characters, large files
    - _Requirements: 2.2, 2.3, 2.5_

  - [ ]* 19.4 Write frontend component tests for Anti-Cheat Monitor
    - Test fullscreen request flow and denial handling
    - Test warning count increment on violations
    - Test nullification at threshold
    - Mock browser APIs (Fullscreen, Visibility, blur)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 20. Final checkpoint - Full integration verification
  - Ensure all components are wired together, all tests pass, CI/CD pipelines are configured, and the platform is ready for deployment. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- The Local Executor (Java) is a separate deliverable that students download and run locally
- All backend APIs use consistent error response format defined in the design
- Frontend uses Zustand for state management and Axios with JWT interceptors for API calls
- Database migrations should be run before any backend testing

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3", "19.1"] },
    { "id": 4, "tasks": ["3.1", "3.2"] },
    { "id": 5, "tasks": ["3.3", "3.4"] },
    { "id": 6, "tasks": ["5.1", "5.4", "5.6"] },
    { "id": 7, "tasks": ["5.2", "5.5"] },
    { "id": 8, "tasks": ["5.3", "6.1", "6.2"] },
    { "id": 9, "tasks": ["6.3", "6.4", "6.5"] },
    { "id": 10, "tasks": ["6.6", "7.1"] },
    { "id": 11, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 12, "tasks": ["7.7", "8.1"] },
    { "id": 13, "tasks": ["8.2", "10.1"] },
    { "id": 14, "tasks": ["10.2", "11.1"] },
    { "id": 15, "tasks": ["11.2", "11.3"] },
    { "id": 16, "tasks": ["12.1", "12.2", "12.3", "12.4"] },
    { "id": 17, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 18, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 19, "tasks": ["16.1"] },
    { "id": 20, "tasks": ["16.2"] },
    { "id": 21, "tasks": ["16.3", "17.1"] },
    { "id": 22, "tasks": ["18.1", "18.2", "18.3"] },
    { "id": 23, "tasks": ["19.2", "19.3", "19.4"] }
  ]
}
```
