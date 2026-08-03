import { index, sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
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
  styleCheckEnabled: integer("style_check_enabled").notNull().default(1),
  stylePolicy: text("style_policy"), // JSON object stored as text
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
    isVisible: integer("is_visible").notNull().default(0),
    allowSubmission: integer("allow_submission").notNull().default(1),
    maxSubmissions: integer("max_submissions"),
    week: integer("week"),
    sortOrder: integer("sort_order").notNull().default(0),
    assignedAt: text("assigned_at").notNull(),
  },
  (table) => ({
    exerciseSectionIdx: uniqueIndex("assignments_exercise_section_unique").on(
      table.exerciseId,
      table.sectionId
    ),
  })
);

// ─── Section Weeks (per-week deadline for the default 10-week schedule) ───────

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
  functionalScore: real("functional_score"),
  score: real("score"),
  manualScore: real("manual_score"),
  styleScore: real("style_score"),
  styleStatus: text("style_status", {
    enum: ["passed", "failed", "unavailable", "skipped"],
  }),
  styleFeedback: text("style_feedback"),
  styleReport: text("style_report"),
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

// ─── Assessments ────────────────────────────────────────────────────────────

export const assessments = sqliteTable("assessments", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
    instructions: text("instructions").notNull().default(""),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    totalPoints: real("total_points").notNull().default(10),
    shuffleQuestions: integer("shuffle_questions").notNull().default(1),
  status: text("status", { enum: ["draft", "published", "archived"] })
    .notNull()
    .default("published"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  publishedAt: text("published_at"),
});

export const assessmentSections = sqliteTable(
  "assessment_sections",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    introContent: text("intro_content"),
    points: real("points").notNull(),
    orderIndex: integer("order_index").notNull(),
  },
  (table) => ({
    assessmentOrderIdx: uniqueIndex("assessment_sections_assessment_order_unique").on(
      table.assessmentId,
      table.orderIndex
    ),
  })
);

export const assessmentQuestions = sqliteTable(
  "assessment_questions",
  {
    id: text("id").primaryKey(),
    sectionId: text("section_id")
      .notNull()
      .references(() => assessmentSections.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["true_false", "single_choice", "short_text", "essay", "code_analysis"],
    }).notNull(),
    prompt: text("prompt").notNull(),
    points: real("points").notNull(),
    orderIndex: integer("order_index").notNull(),
    gradingMode: text("grading_mode", {
      enum: ["auto", "llm_assisted", "manual"],
    }).notNull(),
  },
  (table) => ({
    sectionOrderIdx: uniqueIndex("assessment_questions_section_order_unique").on(
      table.sectionId,
      table.orderIndex
    ),
  })
);

export const assessmentOptions = sqliteTable(
  "assessment_options",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => assessmentQuestions.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    orderIndex: integer("order_index").notNull(),
  },
  (table) => ({
    questionOrderIdx: uniqueIndex("assessment_options_question_order_unique").on(
      table.questionId,
      table.orderIndex
    ),
  })
);

export const assessmentAnswerKeys = sqliteTable("assessment_answer_keys", {
  questionId: text("question_id")
    .primaryKey()
    .references(() => assessmentQuestions.id, { onDelete: "cascade" }),
  answerJson: text("answer_json").notNull(),
});

export const assessmentGradingGuides = sqliteTable("assessment_grading_guides", {
  questionId: text("question_id")
    .primaryKey()
    .references(() => assessmentQuestions.id, { onDelete: "cascade" }),
  referenceAnswer: text("reference_answer").notNull(),
  rubricJson: text("rubric_json").notNull(),
  promptTemplate: text("prompt_template").notNull().default(""),
});

export const assessmentAssignments = sqliteTable(
  "assessment_assignments",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id),
    sectionId: text("section_id")
      .notNull()
      .references(() => classSections.id),
    opensAt: text("opens_at").notNull(),
    closesAt: text("closes_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    isVisible: integer("is_visible").notNull().default(1),
    requireFullscreen: integer("require_fullscreen").notNull().default(1),
    warningThreshold: integer("warning_threshold").notNull().default(3),
    showPredictedScore: integer("show_predicted_score").notNull().default(1),
    maxAttempts: integer("max_attempts").notNull().default(1),
    week: integer("week"),
    sortOrder: integer("sort_order").notNull().default(0),
    assignedBy: text("assigned_by")
      .notNull()
      .references(() => users.id),
    assignedAt: text("assigned_at").notNull(),
  },
  (table) => ({
    assessmentSectionIdx: uniqueIndex("assessment_assignments_assessment_section_unique").on(
      table.assessmentId,
      table.sectionId
    ),
  })
);

export const assessmentSessions = sqliteTable(
  "assessment_sessions",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assessmentAssignments.id),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id),
    status: text("status", {
      enum: [
        "in_progress",
        "submitted",
        "auto_submitted",
        "ai_grading",
        "pending_review",
        "graded",
        "voided",
      ],
    })
      .notNull()
      .default("in_progress"),
    startedAt: text("started_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    questionOrderJson: text("question_order_json"),
    flaggedQuestionIdsJson: text("flagged_question_ids_json"),
    submittedAt: text("submitted_at"),
    submitReason: text("submit_reason"),
    autoScore: real("auto_score").notNull().default(0),
    predictedScore: real("predicted_score"),
    officialScore: real("official_score"),
    reviewStatus: text("review_status", {
      enum: ["not_ready", "ai_queued", "ai_running", "pending_review", "official"],
    })
      .notNull()
      .default("not_ready"),
    officialAt: text("official_at"),
    officialBy: text("official_by").references(() => users.id),
    attemptNumber: integer("attempt_number").notNull().default(1),
  },
  (table) => ({
    assignmentStudentAttemptIdx: uniqueIndex(
      "assessment_sessions_assignment_student_attempt_unique"
    ).on(
      table.assignmentId,
      table.studentId,
      table.attemptNumber
    ),
  })
);

export const assessmentAnswers = sqliteTable(
  "assessment_answers",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => assessmentQuestions.id),
    answerJson: text("answer_json").notNull(),
    clientRevision: integer("client_revision").notNull().default(1),
    savedAt: text("saved_at").notNull(),
    autoPoints: real("auto_points"),
    aiSuggestedPoints: real("ai_suggested_points"),
    finalPoints: real("final_points"),
    aiFeedback: text("ai_feedback"),
    finalFeedback: text("final_feedback"),
    aiConfidence: text("ai_confidence", { enum: ["low", "medium", "high"] }),
    gradingState: text("grading_state", {
      enum: [
        "ungraded",
        "auto_graded",
        "ai_queued",
        "ai_running",
        "ai_suggested",
        "human_accepted",
        "human_adjusted",
        "manually_graded",
      ],
    })
      .notNull()
      .default("ungraded"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: text("reviewed_at"),
  },
  (table) => ({
    sessionQuestionIdx: uniqueIndex("assessment_answers_session_question_unique").on(
      table.sessionId,
      table.questionId
    ),
  })
);

export const assessmentAiGradingRuns = sqliteTable(
  "assessment_ai_grading_runs",
  {
    id: text("id").primaryKey(),
    answerId: text("answer_id")
      .notNull()
      .references(() => assessmentAnswers.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed", "invalid"] })
      .notNull()
      .default("queued"),
    provider: text("provider"),
    model: text("model"),
    promptVersion: text("prompt_version").notNull().default("assessment-grading-v1"),
    suggestedPoints: real("suggested_points"),
    resultJson: text("result_json"),
    confidence: text("confidence", { enum: ["low", "medium", "high"] }),
    needsHumanAttention: integer("needs_human_attention").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    nextAttemptAt: text("next_attempt_at"),
    startedAt: text("started_at"),
    lockedUntil: text("locked_until"),
    finishedAt: text("finished_at"),
  },
  (table) => ({
    answerIdx: index("assessment_ai_grading_runs_answer_idx").on(
      table.answerId,
      table.createdAt
    ),
    queueIdx: index("assessment_ai_grading_runs_queue_idx").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt
    ),
  })
);

export const assessmentIntegrityEvents = sqliteTable(
  "assessment_integrity_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    occurredAt: text("occurred_at").notNull(),
    metadataJson: text("metadata_json"),
  },
  (table) => ({
    sessionOccurredIdx: index("assessment_integrity_events_session_occurred_idx").on(
      table.sessionId,
      table.occurredAt
    ),
  })
);

export const assessmentAuditLogs = sqliteTable("assessment_audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: text("created_at").notNull(),
});

// ─── System Config ───────────────────────────────────────────────────────────

export const systemConfig = sqliteTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  validRange: text("valid_range"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").references(() => users.id),
});

// ─── Source Check Reports ───────────────────────────────────────────────────

export const sourceCheckReports = sqliteTable("source_check_reports", {
  id: text("id").primaryKey(),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id),
  sectionId: text("section_id").references(() => classSections.id),
  semester: text("semester"),
  provider: text("provider").notNull(),
  threshold: real("threshold").notNull(),
  status: text("status", { enum: ["completed", "failed"] }).notNull(),
  totalSubmissions: integer("total_submissions").notNull().default(0),
  comparedPairs: integer("compared_pairs").notNull().default(0),
  pairCount: integer("pair_count").notNull().default(0),
  reportJson: text("report_json").notNull(),
  artifactUrl: text("artifact_url"),
  workflowRunId: text("workflow_run_id"),
  triggeredBy: text("triggered_by"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at").notNull(),
  createdAt: text("created_at").notNull(),
});

// ─── Help / Guide Content ────────────────────────────────────────────────────

export const helpSections = sqliteTable("help_sections", {
  id: text("id").primaryKey(), // e.g. 'login', 'executor'
  title: text("title").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
});

export const helpItems = sqliteTable("help_items", {
  id: text("id").primaryKey(), // UUID/string
  sectionId: text("section_id")
    .notNull()
    .references(() => helpSections.id),
  type: text("type", { enum: ["step", "info", "faq", "checklist"] }).notNull(),
  title: text("title"),
  content: text("content").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
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
  createdAssessments: many(assessments),
  assessmentSessions: many(assessmentSessions),
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
  assessmentAssignments: many(assessmentAssignments),
}));

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  creator: one(users, {
    fields: [assessments.createdBy],
    references: [users.id],
  }),
  sections: many(assessmentSections),
  assignments: many(assessmentAssignments),
}));

export const assessmentSectionsRelations = relations(assessmentSections, ({ one, many }) => ({
  assessment: one(assessments, {
    fields: [assessmentSections.assessmentId],
    references: [assessments.id],
  }),
  questions: many(assessmentQuestions),
}));

export const assessmentQuestionsRelations = relations(assessmentQuestions, ({ one, many }) => ({
  section: one(assessmentSections, {
    fields: [assessmentQuestions.sectionId],
    references: [assessmentSections.id],
  }),
  options: many(assessmentOptions),
  answerKey: one(assessmentAnswerKeys),
  gradingGuide: one(assessmentGradingGuides),
  answers: many(assessmentAnswers),
}));

export const assessmentOptionsRelations = relations(assessmentOptions, ({ one }) => ({
  question: one(assessmentQuestions, {
    fields: [assessmentOptions.questionId],
    references: [assessmentQuestions.id],
  }),
}));

export const assessmentAnswerKeysRelations = relations(assessmentAnswerKeys, ({ one }) => ({
  question: one(assessmentQuestions, {
    fields: [assessmentAnswerKeys.questionId],
    references: [assessmentQuestions.id],
  }),
}));

export const assessmentGradingGuidesRelations = relations(assessmentGradingGuides, ({ one }) => ({
  question: one(assessmentQuestions, {
    fields: [assessmentGradingGuides.questionId],
    references: [assessmentQuestions.id],
  }),
}));

export const assessmentAssignmentsRelations = relations(assessmentAssignments, ({ one, many }) => ({
  assessment: one(assessments, {
    fields: [assessmentAssignments.assessmentId],
    references: [assessments.id],
  }),
  section: one(classSections, {
    fields: [assessmentAssignments.sectionId],
    references: [classSections.id],
  }),
  sessions: many(assessmentSessions),
}));

export const assessmentSessionsRelations = relations(assessmentSessions, ({ one, many }) => ({
  assignment: one(assessmentAssignments, {
    fields: [assessmentSessions.assignmentId],
    references: [assessmentAssignments.id],
  }),
  student: one(users, {
    fields: [assessmentSessions.studentId],
    references: [users.id],
  }),
  answers: many(assessmentAnswers),
  integrityEvents: many(assessmentIntegrityEvents),
}));

export const assessmentAnswersRelations = relations(assessmentAnswers, ({ one, many }) => ({
  session: one(assessmentSessions, {
    fields: [assessmentAnswers.sessionId],
    references: [assessmentSessions.id],
  }),
  question: one(assessmentQuestions, {
    fields: [assessmentAnswers.questionId],
    references: [assessmentQuestions.id],
  }),
  aiRuns: many(assessmentAiGradingRuns),
}));

export const assessmentAiGradingRunsRelations = relations(assessmentAiGradingRuns, ({ one }) => ({
  answer: one(assessmentAnswers, {
    fields: [assessmentAiGradingRuns.answerId],
    references: [assessmentAnswers.id],
  }),
}));

export const assessmentIntegrityEventsRelations = relations(assessmentIntegrityEvents, ({ one }) => ({
  session: one(assessmentSessions, {
    fields: [assessmentIntegrityEvents.sessionId],
    references: [assessmentSessions.id],
  }),
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

export const sourceCheckReportsRelations = relations(sourceCheckReports, ({ one }) => ({
  exercise: one(exercises, {
    fields: [sourceCheckReports.exerciseId],
    references: [exercises.id],
  }),
  section: one(classSections, {
    fields: [sourceCheckReports.sectionId],
    references: [classSections.id],
  }),
}));

export const helpSectionsRelations = relations(helpSections, ({ many }) => ({
  items: many(helpItems),
}));

export const helpItemsRelations = relations(helpItems, ({ one }) => ({
  section: one(helpSections, {
    fields: [helpItems.sectionId],
    references: [helpSections.id],
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

export type Assessment = InferSelectModel<typeof assessments>;
export type NewAssessment = InferInsertModel<typeof assessments>;
export type AssessmentSection = InferSelectModel<typeof assessmentSections>;
export type NewAssessmentSection = InferInsertModel<typeof assessmentSections>;
export type AssessmentQuestion = InferSelectModel<typeof assessmentQuestions>;
export type NewAssessmentQuestion = InferInsertModel<typeof assessmentQuestions>;
export type AssessmentOption = InferSelectModel<typeof assessmentOptions>;
export type NewAssessmentOption = InferInsertModel<typeof assessmentOptions>;
export type AssessmentAssignment = InferSelectModel<typeof assessmentAssignments>;
export type NewAssessmentAssignment = InferInsertModel<typeof assessmentAssignments>;
export type AssessmentSession = InferSelectModel<typeof assessmentSessions>;
export type NewAssessmentSession = InferInsertModel<typeof assessmentSessions>;
export type AssessmentAnswer = InferSelectModel<typeof assessmentAnswers>;
export type NewAssessmentAnswer = InferInsertModel<typeof assessmentAnswers>;
export type AssessmentAiGradingRun = InferSelectModel<typeof assessmentAiGradingRuns>;
export type NewAssessmentAiGradingRun = InferInsertModel<typeof assessmentAiGradingRuns>;

export type SystemConfig = InferSelectModel<typeof systemConfig>;
export type NewSystemConfig = InferInsertModel<typeof systemConfig>;

export type SourceCheckReport = InferSelectModel<typeof sourceCheckReports>;
export type NewSourceCheckReport = InferInsertModel<typeof sourceCheckReports>;

export type HelpSection = InferSelectModel<typeof helpSections>;
export type NewHelpSection = InferInsertModel<typeof helpSections>;
export type HelpItem = InferSelectModel<typeof helpItems>;
export type NewHelpItem = InferInsertModel<typeof helpItems>;
