# Requirements Document

## Introduction

An OOP (Object-Oriented Programming) learning platform for university students, modeled after the OASIS platform (oasis.uet.vnu.edu.vn). The platform enables instructors to create and manage Java OOP exercises, students to complete and submit code assignments executed locally on their personal computers, and administrators to manage class sections and system configuration. The platform includes an anti-cheating system that monitors student behavior during assessments and a minimalist UI styled with UET-VNU branding (blue and white).

## Glossary

- **Platform**: The OOP Learning Platform web application
- **Student**: A registered user who completes coding exercises and submits solutions
- **Instructor**: A registered user who creates exercises, views submissions, and manages leaderboards
- **Admin**: A registered user with full system management privileges including class section and user management
- **Class_Section**: A grouping of students enrolled in a specific OOP course instance (lớp học phần)
- **Exercise**: A coding problem that students must solve using Java OOP concepts
- **Exercise_Library**: A collection of pre-built OOP exercises available for instructors to assign
- **Submission**: A student's code solution submitted for evaluation against test cases
- **Anti_Cheat_Monitor**: The client-side component that enforces fullscreen mode and detects prohibited actions during assessments
- **Warning_Threshold**: The maximum number of anti-cheat warnings before automatic score nullification (default: 3, admin-configurable)
- **Local_Executor**: The mechanism by which student code is compiled and executed on the student's personal computer
- **Leaderboard**: A ranking display showing student scores and completion status for exercises within a class section
- **Test_Case**: An input/output pair used to verify correctness of a student's submission
- **CI_CD_Pipeline**: The automated build and deployment workflow using GitHub Actions that deploys code changes to production environments
- **Free_Tier_Service**: A cloud service plan that provides limited resources at no monetary cost, sufficient for the platform's operational requirements

## Requirements

### Requirement 1: User Authentication and Role Management

**User Story:** As a user, I want to log in with my credentials and access features appropriate to my role, so that the platform is secure and personalized.

#### Acceptance Criteria

1. WHEN a user provides valid credentials (username and password), THE Platform SHALL authenticate the user and redirect to the role-appropriate dashboard within 3 seconds
2. WHEN a user provides invalid credentials, THE Platform SHALL display an error message indicating that the username or password is incorrect and remain on the login page
3. THE Platform SHALL support three distinct roles: Student, Instructor, and Admin
4. WHEN a user session has been inactive for more than 30 minutes, THE Platform SHALL expire the session and redirect the user to the login page
5. IF an unauthenticated user attempts to access a protected resource, THEN THE Platform SHALL redirect the user to the login page and, upon successful authentication, redirect the user back to the originally requested resource
6. IF a user fails authentication 5 consecutive times for the same account, THEN THE Platform SHALL lock the account for 15 minutes and display a message indicating the account is temporarily locked

### Requirement 2: Admin Class Section Management

**User Story:** As an Admin, I want to create and manage class sections, so that students and instructors are organized by course instance.

#### Acceptance Criteria

1. WHEN an Admin creates a new class section, THE Platform SHALL store the class section with a unique identifier, name, semester, and assigned instructor
2. WHEN an Admin imports a student list file (CSV with UTF-8 encoding or Excel .xlsx format), THE Platform SHALL parse the file expecting columns: student_id, full_name, email, and add the listed students to the specified class section
3. WHEN an Admin exports a student list, THE Platform SHALL generate a downloadable file (CSV or Excel) containing all students in the specified class section with: student_id, full_name, email, enrollment_date, and current_score
4. WHEN an Admin assigns an Instructor to a class section, THE Platform SHALL grant the Instructor access to manage exercises and view submissions for that section
5. IF a student list file contains entries with missing required fields (student_id, full_name, email), malformed email addresses, or student_ids already enrolled in the target class section, THEN THE Platform SHALL skip those entries, display a report listing each skipped row with the reason, and successfully import valid entries

### Requirement 3: Admin System Configuration

**User Story:** As an Admin, I want to configure system parameters, so that the platform behavior can be adjusted without code changes.

#### Acceptance Criteria

1. THE Platform SHALL provide an Admin configuration panel for modifying system parameters
2. WHEN an Admin updates the Warning_Threshold value (integer between 1 and 10), THE Platform SHALL apply the new threshold to all assessment sessions started after the modification
3. WHEN an Admin modifies a configurable parameter with a valid value, THE Platform SHALL persist the change and display a confirmation message
4. IF an Admin enters a value outside the valid range for a configurable parameter, THEN THE Platform SHALL reject the change, display the valid range, and retain the previous value
5. THE Platform SHALL provide configurable parameters including: Warning_Threshold (1-10, default 3), exercise time limits (1-180 minutes, default 60), and maximum submission attempts (1-100, default 10)

### Requirement 4: Instructor Exercise Management

**User Story:** As an Instructor, I want to create custom exercises or select from pre-built ones, so that I can assign relevant OOP problems to my students.

#### Acceptance Criteria

1. WHEN an Instructor creates a custom exercise, THE Platform SHALL store the exercise with a title (maximum 200 characters), description (maximum 5000 characters), difficulty level (one of: Easy, Medium, Hard), OOP topic tags (1 to 5 tags), starter code template, and associated test cases
2. WHEN an Instructor selects exercises from the Exercise_Library, THE Platform SHALL add the selected exercises to the instructor's class section assignment list
3. WHEN an Instructor assigns an exercise to a class section, THE Platform SHALL make the exercise visible and accessible to all students in that section within 5 seconds of assignment
4. WHEN a Student attempts to submit a solution after the exercise deadline has passed, THE Platform SHALL reject the submission and display a message indicating the deadline has passed
5. THE Exercise_Library SHALL contain pre-built OOP exercises covering topics including: classes and objects, inheritance, polymorphism, abstraction, encapsulation, interfaces, and exception handling, with at least 2 exercises per topic
6. IF an Instructor submits an exercise creation form with missing required fields (title, description, difficulty level, or at least one test case), THEN THE Platform SHALL reject the creation, highlight the missing fields, and display a message indicating which fields are required

### Requirement 5: Instructor Submission Review and Leaderboard

**User Story:** As an Instructor, I want to view student submissions and rankings, so that I can monitor progress and identify students who need help.

#### Acceptance Criteria

1. WHEN an Instructor views a submission, THE Platform SHALL display the student's code, submission timestamp, test case results (pass/fail per case with point values), and total score as a percentage
2. WHEN an Instructor accesses the Leaderboard for a class section, THE Platform SHALL display students ranked by total score (sum of highest scores per exercise) in descending order, with ties broken by earliest submission timestamp
3. THE Leaderboard SHALL display each student's name, student ID, total score, number of completed exercises (exercises with at least one submission scoring above 0%), and rank position
4. WHEN a new submission is scored, THE Platform SHALL update the Leaderboard within 5 seconds
5. WHEN an Instructor filters submissions by exercise, THE Platform SHALL display only submissions for the selected exercise, sorted by submission timestamp descending

### Requirement 6: Student Exercise Completion and Local Code Execution

**User Story:** As a Student, I want to write and run Java code on my local computer, so that I can test my solutions before submitting them.

#### Acceptance Criteria

1. WHEN a Student opens an exercise, THE Platform SHALL display the exercise description, requirements, starter code template, and available test case examples (those marked as visible)
2. WHEN a Student writes code in the platform editor, THE Platform SHALL provide syntax highlighting for Java code
3. WHEN a Student triggers local execution, THE Local_Executor SHALL compile and run the student's Java code on the student's personal computer using the locally installed JDK
4. WHEN the Local_Executor completes execution, THE Platform SHALL display the compilation output, runtime output, and test case pass/fail results within 2 seconds of completion
5. IF the student's code fails to compile, THEN THE Local_Executor SHALL display the compiler error messages with line numbers to the Student
6. IF the student's code execution exceeds the configured time limit, THEN THE Local_Executor SHALL terminate the process and display a timeout message
7. WHEN a Student submits a solution, THE Platform SHALL evaluate the submission against all test cases (visible and hidden) and display the score as a percentage
8. IF the Local_Executor is unavailable (JDK not installed or not detected), THEN THE Platform SHALL display an error message indicating the JDK requirement and provide setup instructions

### Requirement 7: Anti-Cheating Enforcement

**User Story:** As an Instructor, I want the platform to detect and penalize cheating behavior during assessments, so that exam integrity is maintained.

#### Acceptance Criteria

1. WHEN a Student starts an assessment exercise, THE Anti_Cheat_Monitor SHALL request fullscreen mode via the Fullscreen API and, if the student grants permission, enter fullscreen mode
2. IF a Student denies the fullscreen request when starting an assessment, THEN THE Platform SHALL prevent the student from beginning the assessment and display a message indicating that fullscreen mode is required
3. WHEN the Anti_Cheat_Monitor detects a fullscreen exit event (document.fullscreenElement becomes null), THE Anti_Cheat_Monitor SHALL record a warning, increment the warning count, and display a notification to the Student within 1 second
4. WHEN the Anti_Cheat_Monitor detects a visibility change event (document.visibilityState changes to "hidden") or window blur event, THE Anti_Cheat_Monitor SHALL record a warning, increment the warning count, and display a notification to the Student within 1 second
5. WHEN the number of recorded warnings for a Student's assessment session equals or exceeds the Warning_Threshold, THE Platform SHALL immediately set the student's score for that assessment to zero and display a final notification indicating the score has been nullified
6. WHILE an assessment is active, THE Anti_Cheat_Monitor SHALL display the current warning count and the Warning_Threshold (e.g., "Warnings: 1/3") to the Student
7. THE Platform SHALL log all anti-cheat events (event type, timestamp, warning count at time of event) and make the log accessible to the Instructor on the submission detail page
8. WHEN a Student's score is nullified due to exceeding the Warning_Threshold, THE Platform SHALL prevent the Student from continuing work on that assessment session

### Requirement 8: Student Submission Management

**User Story:** As a Student, I want to view my submission history and scores, so that I can track my progress across exercises.

#### Acceptance Criteria

1. WHEN a Student accesses the submission history page for a class section, THE Platform SHALL display all previous submissions grouped by exercise, sorted by most recent submission first within each group, showing submission timestamp and score (percentage)
2. WHEN a Student views a past submission, THE Platform SHALL display the submitted code, and for each test case, the pass/fail status and point value, limited to test cases marked as visible to students
3. WHEN a Student accesses the progress summary for a class section, THE Platform SHALL display the total number of exercises with at least one submission scoring 100%, the average score across all assigned exercises (counting zero for unsubmitted exercises), and the Student's rank among students in that class section
4. IF a Student has no submissions in the selected class section, THEN THE Platform SHALL display the submission history page with an empty state indicating no submissions have been made

### Requirement 9: Platform UI and Branding

**User Story:** As a user, I want a clean and modern interface with UET-VNU branding, so that the platform is easy to use and visually consistent with university standards.

#### Acceptance Criteria

1. THE Platform SHALL use blue (#003366) and white (#FFFFFF) as primary colors and display the UET-VNU logo on the login page and navigation sidebar
2. THE Platform SHALL provide a responsive layout that renders all content without horizontal scrolling and with all interactive elements accessible on screen widths from 1024px to 2560px
3. THE Platform SHALL display a navigation sidebar where Student users see menu items for exercises, submissions, and progress; Instructor users see menu items for exercise management, submissions review, leaderboard, and class sections; and Admin users see menu items for class section management, user management, and system configuration
4. WHEN a page is loading, THE Platform SHALL display a loading indicator within 200ms of the request initiation
5. THE Platform SHALL apply a single typography scale, spacing system, and component style set across all pages such that elements of the same type render with identical visual properties
6. IF a page fails to load due to a network or server error, THEN THE Platform SHALL display an error message indicating the failure and provide a retry option

### Requirement 10: Exercise Test Case Management

**User Story:** As an Instructor, I want to define test cases for exercises, so that student submissions can be automatically evaluated for correctness.

#### Acceptance Criteria

1. WHEN an Instructor creates a test case, THE Platform SHALL store the test case with input data (maximum 10KB), expected output (maximum 10KB), visibility flag (hidden or visible to students), and point value (positive integer between 1 and 100)
2. THE Platform SHALL support between 1 and 50 test cases per exercise
3. WHEN a submission is evaluated, THE Platform SHALL execute each test case independently in an isolated process and report individual pass/fail status
4. WHEN a test case execution exceeds the configured time limit (in seconds, as set in Admin system configuration), THE Platform SHALL terminate the execution and mark the test case as failed with a "Time Limit Exceeded" indicator
5. THE Platform SHALL calculate the submission score as the sum of point values for passed test cases divided by the total point value of all test cases, multiplied by 100 and rounded to two decimal places, expressed as a percentage
6. WHEN an Instructor edits an existing test case, THE Platform SHALL not retroactively change scores of previously evaluated submissions

### Requirement 11: Deployment and Infrastructure

**User Story:** As a development team, I want to deploy the platform using free-tier cloud services, so that the project operates at zero cost while remaining accessible and functional.

#### Acceptance Criteria

1. THE Platform SHALL host the frontend application as a static site on GitHub Pages under the organization https://github.com/oop-uet
2. THE Platform SHALL deploy the backend API on a free-tier cloud service (such as Render free tier, Railway free tier, or Vercel serverless functions) that supports the required runtime environment
3. THE Platform SHALL use a free-tier managed database service (such as Supabase free tier, PlanetScale free tier, MongoDB Atlas free tier, or Neon free tier) for persistent data storage
4. THE Platform SHALL use a free-tier storage service (such as Cloudinary free tier, Supabase Storage, or Firebase Storage free tier) for file uploads including student list imports and exercise attachments
5. WHILE operating under free-tier service limits, THE Platform SHALL function correctly for up to one class section of 80 students completing exercises concurrently without service degradation caused by quota exhaustion
6. THE Platform SHALL implement a CI/CD pipeline using GitHub Actions that automatically builds and deploys the frontend to GitHub Pages and the backend to the configured cloud service upon merge to the main branch
7. IF a free-tier service quota is approaching its limit (above 80% usage), THEN THE Platform SHALL log a warning to the Admin dashboard indicating which service is nearing its quota
8. THE Platform SHALL configure the frontend deployment with a custom domain or GitHub Pages default URL (oop-uet.github.io) accessible over HTTPS
