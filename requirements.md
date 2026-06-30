# Requirements Document

## Introduction

The OOP Learning Platform is an OASIS-like system for supporting Java Object-Oriented Programming practice at UET-VNU. The core product is not a generic online judge or MOOC site. It must primarily reproduce the teaching workflows of the original UET OASIS site: course sections, weekly practical exercises, assignment visibility/submission controls, student submission attempts, course ranking, instructor review, and class progress tracking.

The platform also adds one new requirement caused by modern AI-assisted coding: assessment sessions can require fullscreen monitoring and can run Java code on each student's own computer through a local executor. These extensions must not replace the OASIS-style course workflow; they sit inside it.

Public metadata and bundle strings from the original site identify it as "UET OASIS - OOP Assistant System" and "He thong ho tro giang day thuc hanh Lap trinh huong doi tuong". Public bundle strings also show OASIS concepts including course sections, ranking by course, weekly exercises, deadlines, max submit count, exercise visibility, submission permission, and exercise selection. These concepts are treated as product parity requirements.

## Product Scope

### In Scope

- Role-based web application for Admin, Instructor, and Student.
- UET/OASIS-style course section management.
- Weekly OOP practice schedule, normally 15 weeks per course section.
- Exercise library and custom exercise creation.
- Java code editing, local execution, submission, scoring, and submission history.
- Instructor review of submissions, source code, scores, attempts, and anti-cheat logs.
- Course ranking/leaderboard similar to OASIS ranking views.
- Import/export of class rosters.
- Admin configuration for submission limits, deadlines/time limits, anti-cheat threshold, and course defaults.
- Plagiarism/source-code similarity support for instructors.
- GitHub Actions deployment workflow for frontend and backend.

### Out of Scope Unless Explicitly Requested Later

- A public marketing landing page.
- Discussion forums, chat, LMS content pages, quizzes unrelated to programming practice, payment, attendance check-in, video lessons, or social features.
- Arbitrary multi-language online judging. Java OOP is the primary language.
- Server-side execution of untrusted student code as the default mode.

## Roles

### Admin

Admin operates the platform for a semester: creates course sections, manages instructors and students, imports/export rosters, seeds/maintains the shared exercise library, sets global policies, and monitors service status.

### Instructor

Instructor operates one or more assigned course sections: schedules weekly exercises, creates or reuses exercises, edits test cases, controls visibility and submission permission, reviews submissions, checks ranking, and investigates plagiarism/anti-cheat events.

### Student

Student joins assigned course sections, views weekly exercises, writes Java code, runs it locally, submits within limits, sees scores/history/progress/ranking, and follows assessment anti-cheat rules when enabled.

## Requirement 1: Authentication, Session, and Role Routing

1. The platform shall authenticate users by username or student/instructor code and password.
2. The platform shall support Admin, Instructor, and Student roles.
3. After login, the platform shall redirect each role to its own default workspace:
   - Student: assigned exercises or course dashboard.
   - Instructor: assigned course sections or exercise management.
   - Admin: course section management/dashboard.
4. Unauthenticated users shall be redirected to login and then returned to the originally requested page after successful login.
5. A user session inactive for more than 30 minutes shall expire.
6. Five consecutive failed login attempts for the same account shall lock that account for 15 minutes.
7. Users shall be able to change their password when required by Admin-created accounts.
8. API endpoints shall enforce role checks on the server, not only in the frontend.

## Requirement 2: Admin Course Section Management

1. Admin shall create, edit, archive, and delete course sections.
2. Each course section shall store at minimum: name, semester, instructor, created date, enrollment count, and active/archive status.
3. Course sections shall support OASIS-style naming such as course code, group/class code, and semester label.
4. Admin shall assign or change the instructor for a course section.
5. Admin shall view a course section detail page containing roster, assigned exercises, weekly schedule, submission statistics, and ranking link.
6. Deleting a course section shall either be blocked when submissions exist or require an explicit destructive confirmation and cascade plan.
7. Instructor access shall be limited to assigned course sections unless Admin grants broader permissions.

## Requirement 3: Roster Import, Export, and Student Accounts

1. Admin shall import rosters from CSV, XLS, or XLSX files.
2. Import shall accept columns equivalent to: student_id, full_name, email. It should also tolerate common Vietnamese roster variants when unambiguous, such as MSSV, ho_ten, ten, lop, email.
3. Import shall create missing student accounts and enroll existing student accounts into the target section.
4. Import shall produce a report with imported rows, skipped rows, duplicate rows, malformed rows, and reasons.
5. Rows missing student_id or full_name shall be skipped.
6. Malformed email shall be skipped unless Admin explicitly allows email generation or blank email policy.
7. Duplicate student_id inside the file or already enrolled in the section shall be skipped and reported.
8. Admin shall export a section roster as CSV/XLSX with student_id, full_name, email, enrollment_date, attempt summary, current score, and rank.
9. Student default passwords shall be generated or imported according to Admin policy, and users may be forced to change password on first login.

## Requirement 4: Course Week Schedule

1. Each course section shall have a weekly schedule, defaulting to 15 weeks.
2. Admin or Instructor shall assign exercises to a specific week.
3. The schedule view shall show "TUAN n" style week groupings, exercise cards, deadlines, visibility state, and submission permission state.
4. Admin or Instructor shall set a deadline per week and/or per assignment.
5. Exercises not assigned to a week shall appear in an unscheduled pool.
6. Moving an exercise between weeks shall preserve existing submissions and scores.
7. Students shall see exercises grouped by week and course section.
8. Past, current, and upcoming weeks shall be visually distinguishable.
9. A week deadline change shall apply to assignments in that week unless a specific assignment overrides it.

## Requirement 5: Exercise Library and OOP Coverage

1. The platform shall provide an exercise library modeled on the provided "Thuc hanh OOP.pdf" practical content and OASIS-style reusable exercise selection.
2. The library shall include exercises for: classes/objects, encapsulation, inheritance, polymorphism, abstraction, interfaces, exceptions, collections, file I/O where relevant, and common OOP modeling tasks.
3. Each library exercise shall include: title, topic tags, difficulty, description, starter code, visible examples, hidden tests, and default point weights.
4. Instructors shall browse, search, filter, and select library exercises for a section/week.
5. Instructors shall clone a library exercise into their own editable copy without mutating the original.
6. Admin shall manage the global library and mark exercises as active/inactive.
7. The library shall support Vietnamese exercise text and Java code formatting.

## Requirement 6: Instructor Exercise and Assignment Management

1. Instructor shall create custom exercises with title, description, difficulty, OOP tags, starter code, and test cases.
2. Title shall be required and limited to 200 characters.
3. Description shall be required and support formatted text or Markdown suitable for code/problem statements.
4. An exercise shall have 1 to 50 test cases before it can be assigned for scoring.
5. Instructor shall assign an exercise to one or more assigned course sections.
6. Each assignment shall store: section, exercise, week, deadline, max submit count, visible/hidden status, allow_submit status, assessment flag, and assigned date.
7. Instructor shall be able to toggle "show exercise" independently from "allow students to submit".
8. Instructor shall be able to update max submit count per assignment, overriding the system default.
9. If show exercise is false, students shall not see the assignment.
10. If allow_submit is false, students may view the assignment only when visible but cannot submit.
11. Instructor shall preview the student view of an assignment.
12. Editing exercise text/test cases shall not retroactively change already stored submission scores.

## Requirement 7: Test Case Management and Scoring

1. Instructor shall create visible and hidden test cases.
2. Each test case shall contain input data, expected output, point value, visibility, and optional time limit.
3. Input and expected output shall each support at least 10KB.
4. Point value shall be a positive integer from 1 to 100.
5. The platform shall calculate score as passed_points / total_points * 100, rounded to two decimals.
6. Visible tests may be shown to students before submission.
7. Hidden tests shall be used for scoring but not reveal expected output to students.
8. Submission detail for instructors shall show all test results.
9. Submission detail for students shall show only visible test results unless policy allows more.
10. Test case execution results shall be stored per submission to preserve historical grading.

## Requirement 8: Student Exercise Workspace and Local Java Execution

1. Student shall open an assigned exercise from a course/week list.
2. The workspace shall show problem statement, deadline, attempt count, max submissions, visible examples, and Java editor.
3. The editor shall provide Java syntax highlighting and stable layout for long code.
4. Student shall run code through a local executor on their own computer.
5. Local executor shall compile Java using the student's installed JDK.
6. Local executor shall run each visible test independently and return compile errors, runtime errors, timeout, actual output, pass/fail, and execution time.
7. If the local executor is unavailable, the workspace shall clearly state that the local agent/JDK is required and provide setup instructions/download link.
8. Student shall be able to submit only when assignment is visible, submission is allowed, deadline has not passed, and max submit count has not been exceeded.
9. Student submission shall store source code, attempt number, timestamp, section, exercise, score, and test results.
10. Student shall receive immediate score feedback after submission.

## Requirement 9: Student Submission History, Progress, and Ranking

1. Student shall view all submissions grouped by exercise and ordered by newest submission first.
2. Student shall open a past submission and view submitted source code, attempt number, timestamp, score, and visible test results.
3. Student shall view progress per course section: completed exercises, total assigned exercises, average score, best scores, and rank.
4. Student shall view class ranking for sections they are enrolled in.
5. Ranking shall show rank, student name, student ID, total score, completed count, and relevant timestamps.
6. Empty states shall be shown when no exercises or submissions exist.

## Requirement 10: Instructor Submission Review and Course Ranking

1. Instructor shall view submissions filtered by section, exercise, student, week, score range, and time.
2. Submission lists shall be sorted newest first by default.
3. Instructor shall open a submission and view student identity, source code, attempt number, timestamp, score, per-test results, feedback, and anti-cheat log.
4. Instructor shall manually add feedback.
5. Instructor may set a manual score when policy allows; manual score shall be distinguishable from automatic score.
6. Course ranking shall rank students by total score using each student's best score per assignment.
7. Tie-breaking shall use earlier relevant completion/submission time, then student ID for deterministic order.
8. Ranking shall update within 5 seconds of a new submission or after page refresh.
9. Instructor shall export ranking/grade data as CSV/XLSX.
10. Ranking pages shall support OASIS-style course ranking navigation from the course section list.

## Requirement 11: Plagiarism and Source Similarity Review

1. Instructor shall run source similarity checks for a section and exercise.
2. The check shall compare submissions across students for the same assignment.
3. The result shall list suspicious pairs/groups with similarity percentage and links to submissions.
4. The result shall allow side-by-side source comparison.
5. The similarity check shall ignore common starter code when possible.
6. The feature shall not automatically change scores; it supports instructor investigation.
7. Reports shall be preserved or reproducible for audit.

## Requirement 12: Assessment Mode and Anti-Cheating

1. Instructor shall mark an assignment as assessment mode.
2. When a student starts an assessment assignment, the workspace shall request fullscreen.
3. If fullscreen is denied, the assessment shall not start.
4. While active, the monitor shall detect fullscreen exit, tab hidden, and window blur.
5. Each violation shall be logged with event type, timestamp, warning count, student, exercise, and optional submission/session.
6. The warning threshold shall be configurable by Admin, default 3, range 1 to 10.
7. When warning count reaches threshold, the platform shall immediately lock the session and record a 0 score for that assessment.
8. Instructor shall see anti-cheat events on submission detail.
9. Anti-cheat shall be clearly labeled as a deterrence and audit tool, not a perfect proctoring system.

## Requirement 13: Admin System Configuration

1. Admin shall configure warning_threshold, default_time_limit, default_max_submissions, default_week_count, and default_deadline_policy.
2. warning_threshold shall accept integers 1 to 10.
3. default_time_limit shall accept 1 to 180 minutes or equivalent seconds for executor/test-case use.
4. default_max_submissions shall accept 1 to 100.
5. Invalid config values shall be rejected and previous values retained.
6. Config changes shall apply to new sessions/assignments and shall not unexpectedly mutate historical submissions.
7. Admin shall see quota/status warnings relevant to deployment services.

## Requirement 14: UI, Navigation, and OASIS Visual Parity

1. The UI shall use a restrained UET/OASIS visual language with UET branding, blue/white base colors, dense tables, and operational layouts.
2. The authenticated layout shall provide role-specific navigation.
3. Student navigation shall include course/exercises, submissions, progress, and ranking.
4. Instructor navigation shall include course sections, weekly schedule, exercise management, submissions, ranking, and plagiarism/source check.
5. Admin navigation shall include dashboard, sections, roster import/export, users, exercise library, config, and quota/status.
6. Tables shall support search/filter/pagination where lists can exceed one screen.
7. Loading states shall appear quickly and avoid blank pages.
8. Error states shall include retry actions when useful.
9. The UI shall support Vietnamese text throughout.
10. The UI shall be responsive for laptop/desktop classroom use from 1024px to 2560px without horizontal page scrolling.

## Requirement 15: Data Integrity, Audit, and Permissions

1. All mutations shall store created/updated timestamps where relevant.
2. Submissions, submission results, anti-cheat events, and historical scores shall be immutable except for explicit instructor/admin overrides recorded separately.
3. A student shall access only their own submissions and sections.
4. An instructor shall access only assigned sections and their related exercises/submissions unless Admin grants additional permission.
5. Admin shall have platform-wide access.
6. Destructive actions shall require confirmation.
7. Import, export, scoring override, assignment visibility changes, and config updates should be auditable.

## Requirement 16: Deployment and CI/CD

1. Frontend shall be deployed as a static SPA to GitHub Pages under the oop-uet organization.
2. Backend shall be deployed to the configured Render service or equivalent Node.js host.
3. Persistent data shall use the configured managed database compatible with the existing Drizzle schema.
4. File uploads/import artifacts shall use the configured storage backend when enabled.
5. GitHub Actions shall build and deploy on push to main.
6. Frontend and backend workflows shall run build/tests before deploy.
7. Deployment shall use repository secrets and shall not commit credentials.
8. The system shall remain usable for at least one class section of 80 students under normal practical-session load.

