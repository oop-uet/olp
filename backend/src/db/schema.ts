import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { type InferSelectModel, type InferInsertModel, relations } from "drizzle-orm";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["student", "instructor", "admin"] }).notNull(),
    fullName: text("full_name"),
    mustChangePassword: integer("must_change_password").notNull().default(0),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: text("locked_until"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    usernameIdx: uniqueIndex("users_username_unique").on(table.username),
    emailIdx: uniqueIndex("users_email_unique").on(table.email),
  })
);

// ─── Class Sections ──────────────────────────────────────────────────────────

export const classSections = sqliteTable("class_sections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  semester: text("semester").notNull(),
  instructorId: text("instructor_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
});

// ─── Section Instructors ────────────────────────────────────────────────────

export const sectionInstructors = sqliteTable(
  "section_instructors",
  {
    id: text("id").primaryKey(),
    sectionId: text("section_id")
      .notNull()
      .references(() => classSections.id),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => users.id),
    isPrimary: integer("is_primary").notNull().default(0),
    assignedAt: text("assigned_at").notNull(),
  },
  (table) => ({
    sectionInstructorIdx: uniqueIndex("section_instructors_section_instructor_unique").on(
      table.sectionId,
      table.instructorId
    ),
  })
);

// ─── Section Enrollments ─────────────────────────────────────────────────────

export const sectionEnrollments = sqliteTable(
  "section_enrollments",
  {
    id: text("id").primaryKey(),
    sectionId: text("section_id")
      .notNull()
      .references(() => classSections.id),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id),
    studentExternalId: text("student_external_id"),
    enrolledAt: text("enrolled_at").notNull(),
  },
  (table) => ({
    sectionStudentIdx: uniqueIndex("enrollments_section_student_unique").on(
      table.sectionId,
      table.studentId
    ),
    studentIdx: uniqueIndex("enrollments_student_unique").on(table.studentId),
  })
);

// ─── Exercises ───────────────────────────────────────────────────────────────

export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(),
  starterCode: text("starter_code"),
  isLibrary: integer("is_library").notNull().default(0),
  oopTags: text("oop_tags").notNull(), // JSON array stored as text
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Exercise Assignments ────────────────────────────────────────────────────

export const exerciseAssignments = sqliteTable(
  "exercise_assignments",
  {
    id: text("id").primaryKey(),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id),
    sectionId: text("section_id")
      .notNull()
      .references(() => classSections.id),
    deadline: text("deadline"),
    isAssessment: integer("is_assessment").notNull().default(0),
    isVisible: integer("is_visible").notNull().default(1),
    allowSubmission: integer("allow_submission").notNull().default(1),
    maxSubmissions: integer("max_submissions"),
    week: integer("week"),
    assignedAt: text("assigned_at").notNull(),
  },
  (table) => ({
    exerciseSectionIdx: uniqueIndex("assignments_exercise_section_unique").on(
      table.exerciseId,
      table.sectionId
    ),
  })
);

// ─── Section Weeks (per-week deadline for the 15-week schedule) ───────────────

export const sectionWeeks = sqliteTable(
  "section_weeks",
  {
    id: text("id").primaryKey(),
    sectionId: text("section_id")
      .notNull()
      .references(() => classSections.id),
    week: integer("week").notNull(),
    deadline: text("deadline"),
  },
  (table) => ({
    sectionWeekIdx: uniqueIndex("section_weeks_section_week_unique").on(
      table.sectionId,
      table.week
    ),
  })
);

// ─── Test Cases ──────────────────────────────────────────────────────────────

export const testCases = sqliteTable("test_cases", {
  id: text("id").primaryKey(),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  inputData: text("input_data").notNull(),
  expectedOutput: text("expected_output").notNull(),
  isVisible: integer("is_visible").notNull().default(0),
  pointValue: integer("point_value").notNull().default(1),
  timeLimitSeconds: integer("time_limit_seconds"),
  createdAt: text("created_at").notNull(),
});

// ─── Submissions ─────────────────────────────────────────────────────────────

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  sectionId: text("section_id")
    .notNull()
    .references(() => classSections.id),
  code: text("code").notNull(),
  score: real("score"),
  manualScore: real("manual_score"),
  feedback: text("feedback"),
  attemptNumber: integer("attempt_number").notNull().default(1),
  submittedAt: text("submitted_at").notNull(),
});

// ─── Project Groups ─────────────────────────────────────────────────────────

export const projectGroups = sqliteTable(
  "project_groups",
  {
    id: text("id").primaryKey(),
    sectionId: text("section_id")
      .notNull()
      .references(() => classSections.id),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id),
    name: text("name").notNull(),
    repositoryUrl: text("repository_url"),
    score: real("score"),
    feedback: text("feedback"),
    status: text("status", {
      enum: ["draft", "submitted", "graded"],
    }).notNull().default("draft"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    gradedAt: text("graded_at"),
    gradedBy: text("graded_by").references(() => users.id),
  },
  (table) => ({
    projectGroupNameIdx: uniqueIndex("project_groups_section_exercise_name_unique").on(
      table.sectionId,
      table.exerciseId,
      table.name
    ),
  })
);

export const projectGroupMembers = sqliteTable(
  "project_group_members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => projectGroups.id),
    studentId: text("student_id").references(() => users.id),
    studentExternalId: text("student_external_id").notNull(),
    studentName: text("student_name").notNull(),
    isLeader: integer("is_leader").notNull().default(0),
    contributionPercent: integer("contribution_percent").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    projectMemberUniqueIdx: uniqueIndex("project_group_members_group_student_unique").on(
      table.groupId,
      table.studentExternalId
    ),
  })
);

// ─── Submission Results ──────────────────────────────────────────────────────

export const submissionResults = sqliteTable("submission_results", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id),
  testCaseId: text("test_case_id")
    .notNull()
    .references(() => testCases.id),
  passed: integer("passed").notNull().default(0),
  actualOutput: text("actual_output"),
  status: text("status", {
    enum: ["passed", "failed", "timeout", "error"],
  }).notNull(),
  executionTimeMs: integer("execution_time_ms"),
});

// ─── Anti-Cheat Events ───────────────────────────────────────────────────────

export const anticheatEvents = sqliteTable("anticheat_events", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").references(() => submissions.id),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  eventType: text("event_type").notNull(),
  warningCountAtEvent: integer("warning_count_at_event").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

// ─── System Config ───────────────────────────────────────────────────────────

export const systemConfig = sqliteTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  validRange: text("valid_range"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").references(() => users.id),
});

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  instructedSections: many(classSections),
  sectionInstructorAssignments: many(sectionInstructors),
  enrollments: many(sectionEnrollments),
  createdExercises: many(exercises),
  submissions: many(submissions),
  projectGroups: many(projectGroups),
  projectMemberships: many(projectGroupMembers),
  anticheatEvents: many(anticheatEvents),
}));

export const classSectionsRelations = relations(classSections, ({ one, many }) => ({
  instructor: one(users, {
    fields: [classSections.instructorId],
    references: [users.id],
  }),
  instructors: many(sectionInstructors),
  enrollments: many(sectionEnrollments),
  assignments: many(exerciseAssignments),
  submissions: many(submissions),
  projectGroups: many(projectGroups),
}));

export const sectionInstructorsRelations = relations(sectionInstructors, ({ one }) => ({
  section: one(classSections, {
    fields: [sectionInstructors.sectionId],
    references: [classSections.id],
  }),
  instructor: one(users, {
    fields: [sectionInstructors.instructorId],
    references: [users.id],
  }),
}));

export const sectionEnrollmentsRelations = relations(sectionEnrollments, ({ one }) => ({
  section: one(classSections, {
    fields: [sectionEnrollments.sectionId],
    references: [classSections.id],
  }),
  student: one(users, {
    fields: [sectionEnrollments.studentId],
    references: [users.id],
  }),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  creator: one(users, {
    fields: [exercises.createdBy],
    references: [users.id],
  }),
  assignments: many(exerciseAssignments),
  testCases: many(testCases),
  submissions: many(submissions),
  projectGroups: many(projectGroups),
}));

export const projectGroupsRelations = relations(projectGroups, ({ one, many }) => ({
  section: one(classSections, {
    fields: [projectGroups.sectionId],
    references: [classSections.id],
  }),
  exercise: one(exercises, {
    fields: [projectGroups.exerciseId],
    references: [exercises.id],
  }),
  grader: one(users, {
    fields: [projectGroups.gradedBy],
    references: [users.id],
  }),
  members: many(projectGroupMembers),
}));

export const projectGroupMembersRelations = relations(projectGroupMembers, ({ one }) => ({
  group: one(projectGroups, {
    fields: [projectGroupMembers.groupId],
    references: [projectGroups.id],
  }),
  student: one(users, {
    fields: [projectGroupMembers.studentId],
    references: [users.id],
  }),
}));

export const exerciseAssignmentsRelations = relations(exerciseAssignments, ({ one }) => ({
  exercise: one(exercises, {
    fields: [exerciseAssignments.exerciseId],
    references: [exercises.id],
  }),
  section: one(classSections, {
    fields: [exerciseAssignments.sectionId],
    references: [classSections.id],
  }),
}));

export const testCasesRelations = relations(testCases, ({ one, many }) => ({
  exercise: one(exercises, {
    fields: [testCases.exerciseId],
    references: [exercises.id],
  }),
  results: many(submissionResults),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  student: one(users, {
    fields: [submissions.studentId],
    references: [users.id],
  }),
  exercise: one(exercises, {
    fields: [submissions.exerciseId],
    references: [exercises.id],
  }),
  section: one(classSections, {
    fields: [submissions.sectionId],
    references: [classSections.id],
  }),
  results: many(submissionResults),
  anticheatEvents: many(anticheatEvents),
}));

export const submissionResultsRelations = relations(submissionResults, ({ one }) => ({
  submission: one(submissions, {
    fields: [submissionResults.submissionId],
    references: [submissions.id],
  }),
  testCase: one(testCases, {
    fields: [submissionResults.testCaseId],
    references: [testCases.id],
  }),
}));

export const anticheatEventsRelations = relations(anticheatEvents, ({ one }) => ({
  submission: one(submissions, {
    fields: [anticheatEvents.submissionId],
    references: [submissions.id],
  }),
  student: one(users, {
    fields: [anticheatEvents.studentId],
    references: [users.id],
  }),
  exercise: one(exercises, {
    fields: [anticheatEvents.exerciseId],
    references: [exercises.id],
  }),
}));

export const systemConfigRelations = relations(systemConfig, ({ one }) => ({
  updater: one(users, {
    fields: [systemConfig.updatedBy],
    references: [users.id],
  }),
}));

// ─── TypeScript Type Exports ─────────────────────────────────────────────────

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type ClassSection = InferSelectModel<typeof classSections>;
export type NewClassSection = InferInsertModel<typeof classSections>;
export type SectionInstructor = InferSelectModel<typeof sectionInstructors>;
export type NewSectionInstructor = InferInsertModel<typeof sectionInstructors>;

export type SectionEnrollment = InferSelectModel<typeof sectionEnrollments>;
export type NewSectionEnrollment = InferInsertModel<typeof sectionEnrollments>;

export type Exercise = InferSelectModel<typeof exercises>;
export type NewExercise = InferInsertModel<typeof exercises>;

export type ExerciseAssignment = InferSelectModel<typeof exerciseAssignments>;
export type NewExerciseAssignment = InferInsertModel<typeof exerciseAssignments>;

export type TestCase = InferSelectModel<typeof testCases>;
export type NewTestCase = InferInsertModel<typeof testCases>;

export type Submission = InferSelectModel<typeof submissions>;
export type NewSubmission = InferInsertModel<typeof submissions>;

export type ProjectGroup = InferSelectModel<typeof projectGroups>;
export type NewProjectGroup = InferInsertModel<typeof projectGroups>;

export type ProjectGroupMember = InferSelectModel<typeof projectGroupMembers>;
export type NewProjectGroupMember = InferInsertModel<typeof projectGroupMembers>;

export type SubmissionResult = InferSelectModel<typeof submissionResults>;
export type NewSubmissionResult = InferInsertModel<typeof submissionResults>;

export type AnticheatEvent = InferSelectModel<typeof anticheatEvents>;
export type NewAnticheatEvent = InferInsertModel<typeof anticheatEvents>;

export type SystemConfig = InferSelectModel<typeof systemConfig>;
export type NewSystemConfig = InferInsertModel<typeof systemConfig>;
