# Requirements Document: OOP Learning Platform (UET OASIS Parity)

## 1. Introduction

The OOP Learning Platform is a web-based educational system designed for Java Object-Oriented Programming practice at UET-VNU. It is built as a modernized, high-performance parity of the university's original **OASIS** platform (oasis.uet.vnu.edu.vn). 

The platform’s core goal is to faithfully reproduce all teaching workflows, administrative features, and student capabilities of the original UET OASIS platform while incorporating modern enhancements:
1. **Local Java Code Execution:** Student code compiles and executes on their personal machines via a local WebSocket agent, reducing server compute costs to zero.
2. **Anti-Cheating Enforcement:** Integrated fullscreen monitoring, tab switching, and focus detection with configurable thresholds and score nullification to ensure exam integrity.
3. **Vietnamese Language Support:** All user-facing text, indicators, tooltips, and reports are fully localized in Vietnamese, matching the native experience.
4. **Enhanced UI/UX:** A highly cohesive, premium tech layout utilizing UET-VNU brand colors (Navy blue `#003366` and orange `#f37021`) and optimized layout components.

---

## 2. Product Scope

### In Scope
- **User Authentication & Role-Based Routing:** Full security controls for Admin, Instructor, and Student roles with appropriate workspace redirects.
- **Roster & Class Section Management:** Student account importing, custom registration, search filters, and class list exports.
- **Single-Section Student Enrollment:** A Student belongs to exactly one active class section at a time; only Admin/Instructor roles manage or switch between multiple sections.
- **15-Week Practical Schedule:** Weekly groupings of exercises, custom deadlines, and visibility/submission overrides.
- **Pre-seeded Exercise Library:** 14 practical exercises covering all 7 core OOP topics from the UET syllabus (week 1 to week 12) with custom test case management.
- **Submission Reviews & Manual Grading:** Detailed submission logs with search inputs, per-column filters, and manual error classification checkboxes (SE/PE/CE).
- **Course-wide Rankings:** A grid-based leaderboard showing students' ranks, IDs, names, total scores, and week-by-week exercise completions.
- **Plagiarism Checker:** Side-by-side similarity highlighting to investigate source code copying.
- **Quota & Status Dashboard:** Usage, headroom, reset time and alerting for Turso,
  Cloudflare Workers/Queues/R2 and any remaining API compute, so a free-tier limit never
  silently interrupts a class or an assessment.

### Out of Scope
- Generic multi-language online judging (restricted exclusively to Java OOP).
- Direct server-side sandbox code compilation as the default (relies on student local agent).
- Discussion forums, course slide readers, attendance check-ins, or video lessons.

---

## 3. Detailed Functional Requirements

### Requirement 1: User Authentication & Security Invariants
1. **Roles:** The system must enforce roles for **Admin**, **Instructor**, and **Student** both in the React frontend routing and on the Node.js API endpoints.
2. **Credentials:** Access is authenticated via Username/Code (Student code e.g. `20021287` or Instructor account name e.g. `tuyenkv`) and Password.
3. **Lockout Policy:** If an account fails authentication 5 consecutive times, it is locked for 15 minutes.
4. **Session Expiry:** A session is invalidated and redirected to the login screen after 30 minutes of inactivity.
5. **Route Guards:** Attempting to access protected routes without a valid JWT token redirects the user to the login portal and preserves their original destination.
6. **Password Change:** Users must be able to change their password, and Admin can enforce a "Must change password on first login" policy.

### Requirement 2: Admin Class Section Management
1. **Section Schema:** Admin can create course sections containing:
   - Unique Course ID
   - Class Name (e.g. `OOP Lớp INT2204 8`)
   - Semester Label (e.g. `Học kỳ I năm học 2026-2027`)
   - Assigned Instructors: one or more instructors can be attached to a section, with the first selected instructor treated as the primary instructor for legacy displays and imports.
2. **Management Actions:** Admin can view, edit course names/semesters, assign/reassign one or many instructors, archive, or delete course sections.
3. ** Roster Overview:** Admin can view a detailed section page displaying the student roster, assigned exercise schedule, submission statistics, and a link to the leaderboard.

### Requirement 3: Roster Import, Export, and Student Accounts
1. **Roster Import:** Admin can import class rosters from CSV, XLS, or XLSX files.
   - Expected columns: Student Code (`student_id` / `MSSV`), Full Name (`full_name` / `ho_ten`), Email (`email`).
   - The import parser must auto-detect header variations in Vietnamese or English.
2. **Validation Rules:**
   - Rows missing student ID or name are skipped.
   - Malformed email formats are skipped and reported.
   - Student IDs already enrolled in the section are flagged as duplicates and skipped.
   - Student IDs already enrolled in another active section are skipped and reported; the student must be removed/transferred before being imported into a different section.
3. **Import Report:** The UI displays a detailed breakdown: successfully imported students count, skipped rows count, and reasons for each skip.
4. **Roster Export:** Admin and Instructors can export the student list as an Excel/CSV file containing: student code, full name, email, enrollment date, total score, and ranking.
5. **Roster Controls:** In the class roster list (`/#/manage-course?course=<course_id>`), the instructor can:
   - **Search:** Filter students instantly using a text search bar.
   - **Add Student:** Open a modal with inputs for Student Code, Full Name, and Email.
   - **Edit Student:** Modify student name and email details in a modal.
   - **Reset Password:** Clear the password to the default student code with a confirmation prompt.
   - **Delete Student:** Remove enrollment from the section.

### Requirement 4: Weekly Course Schedule & Visibility
1. **Week Groupings:** Assigned exercises are grouped under weekly dividers from `TUẦN 1` to `TUẦN 15` (matching the UET syllabus weeks).
2. **Course detail page (`/#/course/<course_id>`):**
   - Renders week headers showing deadlines (e.g. `Hạn nộp: 23:59 24/09/2026`).
   - Lists assigned exercises with submission status badges.
   - Displays a dropdown indicator showing the number of submissions made for each exercise.
   - Features a checkmark icon to toggle exercise visibility for students.
3. **Pick Problem / Assign Exercise Page (`/#/teacher/pickproblem/<course_id>`):**
   - **Left Panel (Weeks config):** Lists weeks 1 to 15. Each week header has a selection checkbox, week name, deadline picker, and a save button to persist the week’s deadline. Under each week, assigned exercises are listed with a trash can icon to unassign.
   - **Right Panel (Exercise Library):** Lists all available exercises from the shared library. Instructors click a green/red `+` icon button to assign an exercise to the selected week.
   - **Header:** Features a `Quay về trang bài tập` navigation link returning to the course page.

### Requirement 5: Exercise Library and Test Case Editor
1. **Syllabus Coverage:** The system must pre-seed 14 exercises covering the UET OOP practical guide:
   - *Week 2-3 (Classes & Objects):* Student Class Creation, Bank Account Operations.
   - *Week 5 (Inheritance):* Shape Hierarchy, Employee Payroll.
   - *Week 6 (Polymorphism):* Animal Sound, Payment Method.
   - *Week 6 (Abstraction):* Vehicle Fleet, Database Connector.
   - *Week 4 (Encapsulation):* Temperature Converter, Library Book.
   - *Week 7 (Interfaces):* Sortable Interface, Multiple Interface.
   - *Week 8 (Exceptions):* Custom Exception, File Exception.
2. **Exercise Schema:** Each exercise requires: title (max 200 chars), description (max 5000 chars), difficulty (Easy, Medium, Hard), OOP topic tags, starter code template, and test cases.
3. **Test Case Editor:** Instructors can configure up to 50 test cases per exercise:
   - Input and expected output (supporting up to 10KB text each).
   - Visibility flag (visible to students for testing or hidden for actual grading).
   - Point value (positive integer, 1 to 100).
   - Optional time limit in seconds.
4. **Scoring Formula:**
   $$\text{Score} = \left( \frac{\sum \text{passed test case point values}}{\sum \text{total test case point values}} \right) \times 100$$
   Rounded to two decimal places.
5. **Immutability Invariant:** Editing an exercise's test cases must not retroactively change the scores of past student submissions.

### Requirement 6: Student Workspace & Local Java Agent
1. **Workspace Layout:**
   - **Left Panel:** Tab selectors for **Mô tả** (problem statement, deadline, attempts, tags) and **Test case** (showing inputs and expected outputs of visible tests).
   - **Center Panel:** Monaco Code Editor configured with the dark theme (`vs-dark`) and Java syntax highlighting.
   - **Bottom Panel:** Local execution output log (showing terminal compilations and test failures).
2. **Local Code Executor:** Runs code locally on the student's computer:
   - Resolves connection via WebSocket to `ws://localhost:9876`.
   - If disconnected, displays setup guide, troubleshooting steps, and JDK 17 installation download link.
   - Compiles Java source and runs test cases. Returns standard outputs (`stdout`/`stderr`), compilation failures with line numbers, timeouts, or execution times.
3. **Submit Logic:** Student clicks "Nộp bài" to upload their source code to the server. The submission is evaluated against all hidden and visible test cases.
   - If overdue or attempts exceed the max threshold, the submission is rejected.

### Requirement 7: Instructor Submission Review & Grading
1. **Submissions Log (`/#/submissions`):**
   - Displays a table showing: Submission ID, Student Name, Exercise, Time, Score, and Result Badge.
   - Column filters: Features inline text search filters directly under column headers.
   - Support pagination and course filter dropdowns.
2. **Submissions Detail (`/#/submissions_detail/<submission_id>`):**
   - **Left Panel:** Details card with student metadata, submission status, and score breakdown: **Điểm chức năng** (Functional score) and **Điểm code style** (Style score). Lists submitted file names.
   - **Right Panel (Grading & Code Workspace):**
     - Manual override panel: Checkboxes to flag standard errors: **Lỗi cấu trúc mã nguồn (SE)**, **Lỗi quy tắc lập trình (PE)**, and **Lỗi biên dịch (CE)**. Text area for instructor feedback.
     - Information Tabs:
       - `Mã nguồn`: Monaco Editor in read-only mode displaying the source code.
      - `Yêu cầu chức năng`: Detailed point score for each test case.
      - `Lỗi khác`: Standard error outputs or compilation stack traces.
      - `Chi tiết test cases`: Terminal test reports.

### Requirement 7.1: Major Project / Group Assignment Management
1. **Project Workspace:** Exercises marked by title/tag as `Bài tập lớn`, `BTL`, or project assignments open a dedicated instructor workspace instead of the normal coding review flow.
2. **Group List:** Instructor can view, create, edit, and delete project groups for a section and exercise. Each group stores group name, GitHub repository URL, members, leader, and contribution percentage.
3. **Statistics:** Instructor can view total groups, total enrolled students, students already assigned to groups, submitted repository count, graded count, and average group score.
4. **Grading:** Instructor can grade each group from 0-100 and store feedback. The grade history remains visible in the project workspace.
5. **Export:** Instructor can export the group list to CSV/Excel-compatible format for offline review.

### Requirement 8: Plagiarism and Source Similarity
1. **Technology Choice:** Use JPlag as the primary source-similarity engine for Java OOP submissions. PMD CPD may be used as a fast duplicate-fragment pre-check; Dolos is kept as a future provider.
2. **Manual Scan:** Instructors can trigger a source check for a course section and exercise.
3. **Weekly Scheduled Scan:** Instructors can configure section/exercise pairs to be checked by GitHub Actions at the end of each week.
4. **Admin Resource Control:** Administrators can globally enable/disable source checking, enable/disable weekly GitHub Actions scans, choose the provider, set the similarity threshold, and cap runtime per job.
5. **Analysis Report:** The system compares code across student submissions, producing suspicious student pairs sorted by similarity percentage, provider metadata, and report artifacts.
6. **Side-by-Side Review:** Renders a side-by-side code diff viewer highlighting copied segments. It should ignore common starter templates/base code.
7. **Audit Trail:** Scheduled/manual runs must record status, start/end time, provider, threshold, scope, suspicious pair count, and artifact URL.

### Requirement 9: Anti-Cheating Assessment Monitor
1. **Assessment Mode:** A real mixed-question exam is represented by the dedicated
   `Assessment` domain. The legacy `exercise_assignments.is_assessment` flag is retained
   only for a monitored coding exercise and must not be used to model an entire exam.
2. **Locking & Monitoring:**
   - Starting the exam forces Fullscreen Mode via the Fullscreen API. Denial blocks the workspace.
   - Listens for: Fullscreen exit, Visibility change (tab switches), and Window blur (leaves editor focus).
   - Shows a persistent warning indicator "Warnings: X/T".
   - Exceeding the threshold (Admin-configurable, default 3) locks the workspace with an overlay and automatically submits a 0-point score to the backend.
3. **Event Logs:** All anti-cheat events (warning counts, types, times) are logged and displayed to instructors in the submission detail view.

### Requirement 10: Course Rankings & Leaderboards
1. **Leaderboard View (`/#/ranking`):**
   - Displays students ranked by total score (sum of highest scores per exercise) in descending order.
   - Tie-breaker: Earliest completion timestamp, followed by alphanumeric Student ID.
   - Table details: Rank, Student Name, Student ID, Total Score, Completed Exercises count.
   - Renders exercise columns horizontally, allowing instructors to scan scores week-by-week.

### Requirement 11: Hybrid Cloudflare Operations & Reliability

The platform must follow the phased hybrid architecture defined in
[`docs/hybrid-cloudflare-architecture.md`](docs/hybrid-cloudflare-architecture.md).
This requirement is deliberately an operational requirement: it protects the ability to
start, save and submit an assessment under burst traffic; it is not a mandate to rewrite
all existing services at once.

1. **Frontend delivery:** The production SPA must be deployable on Cloudflare Pages with
   immutable build artifacts, preview deployments, HTTPS, SPA deep-link fallback, explicit
   API base URL and a tested rollback to the prior artifact. No secret, answer key, grading
   rubric or privileged configuration may be included in the frontend build.
2. **Authoritative transactional path:** Login, assessment start/resume, autosave,
   integrity-event recording and submit must use an authoritative transactional API and
   database. `submit` must be idempotent and must succeed even when every AI provider or
   queue consumer is unavailable.
3. **Database decision gate:** Turso/libSQL remains the source of truth until a D1
   migration passes the documented load, index, backup/restore, compatibility and rollback
   gates. The system must not dual-write Turso and D1 during a real assessment.
4. **Asynchronous AI grading:** AI grading must use a durable job state in the database and
   may use Cloudflare Queues for delivery. A queue message carries only identifiers and a
   correlation ID; it never contains student answers, answer keys, grading rubrics, exam
   passwords or provider credentials. A provider failure must lead to retry/fallback or
   manual review, never loss of a submitted answer.
5. **Queue idempotency and rate control:** A grading queue unit represents a bounded batch
   for one submitted assessment attempt, never keystrokes or an autosave operation. Consumers
   must claim jobs atomically, use per-provider rate limits/circuit breakers, tolerate
   at-least-once delivery and make completion idempotent.
6. **File storage:** Import sheets, generated PDF/Word/Excel documents and source-check
   artifacts must be stored in Cloudflare R2 or an equivalent object store with object
   lifecycle rules. Private resources are accessed only through an authorization-checked,
   time-limited URL; a local service filesystem is not durable storage.
7. **Quota safety:** Admins must see usage, reset time, forecast, backlog and threshold
   alerts for all metered dependencies. Deployment of a new dependency to a live assessment
   is blocked until the planned peak load has documented headroom; a quota hard-limit is not
   treated as an acceptable overload strategy.
8. **Security at the edge:** TLS, CORS allow-list, security headers and rate limits are
   enforced. Turnstile may protect public/high-risk forms such as login and password reset,
   but it must not interrupt authenticated autosave or submit. Internal queue callbacks use
   service authentication with replay protection, not a student or instructor token.
9. **Compute boundaries:** Cloudflare Workers Free must not be the only execution path for
   bcrypt-heavy authentication, document generation, Java/Checkstyle tooling or untrusted
   Java execution. Such work stays in a compatible runner until a paid container/sandbox
   decision is approved.
10. **Assessment readiness:** Before a real assessment, the team must complete a documented
    load test for the approved concurrent-student target, demonstrate successful submit during
    AI/queue outage, rehearse backup restore and rollback, and freeze infrastructure/schema
    changes throughout the assessment window.

---

## 4. UI Route and Navigation Mappings

The platform must enforce the following exact route configurations for visual consistency:

| Role | Route URL | View / Screen | Key Components |
|---|---|---|---|
| All | `/olp/login` | Login Portal | Split-screen branding & input card |
| All | `/#/dashboard` | Dashboard | Course section cards, semester tabs, rankings sidebar |
| Inst / Stud | `/#/course/:id` | Course Detail | Weekly dividers, deadline info, visibility toggles |
| Inst | `/#/teacher/pickproblem/:id` | Assign Exercise | Split layout: week deadline config vs. exercise library |
| Inst | `/#/submissions` | Submissions Log | Dense table, inline column filters, pagination |
| Inst | `/#/submissions_detail/:id` | SubReview | manual grade checks (SE/PE/CE), code tabs |
| Inst / Stud | `/#/ranking` | Leaderboard | Grid ranking, week columns, Excel/CSV export |
| Inst | `/#/plagiarism` | Plagiarism | Similarity matrix and diff compare views |
| Stud | `/#/codingPage/:exerciseId/:slug/:runId` | Workspace | Description, Test Cases, Monaco vs-dark, Local run |
| Stud | `/#/submissions` | My Submissions | Attempts log grouped by exercise |
| Stud | `/#/submissions_detail/:id` | Submission Detail | Read-only code editor, test case results |
| Admin | `/#/sections` | Admin Sections | Section CRUD lists, instructor dropdowns |
| Admin | `/#/config` | System Config | Warning threshold inputs, defaults configurations |
| Admin | `/#/quota` | Quota Status | Turso, Workers, Queues, R2 and API compute usage/headroom |
