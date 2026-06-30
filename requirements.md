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
- **Quota & Status Dashboard:** Quota usage warnings (Supabase, Render, Cloudflare R2) to stay within free-tier limits.

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
   - Assigned Instructor
2. **Management Actions:** Admin can view, edit course names/semesters, assign/reassign instructors, archive, or delete course sections.
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

### Requirement 8: Plagiarism and Source Similarity
1. **Similarity Comparison:** Instructors can trigger a plagiarism scan for a course section and exercise.
2. **Analysis Report:** Compares code matches across all student submissions, producing a list of suspicious student pairs sorted by similarity percentage.
3. **Side-by-Side Review:** Renders a side-by-side code diff viewer highlighting copied segments. It should ignore common starter templates.

### Requirement 9: Anti-Cheating Assessment Monitor
1. **Assessment Mode:** Instructors can flag any assigned exercise as an "Assessment" (Exam).
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
| Admin | `/#/quota` | Quota Status | Supabase/Render/R2 resource graphs |
