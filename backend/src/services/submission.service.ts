import crypto from "node:crypto";
import { eq, and, count, desc, inArray } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  submissions,
  submissionResults,
  testCases,
  exerciseAssignments,
  systemConfig,
  sectionEnrollments,
} from "../db/schema.js";
import {
  buildStyleReport,
  evaluateCheckstyle,
  type CheckstyleEvaluation,
} from "./checkstyle.service.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TestResultInput {
  test_case_id: string;
  actual_output: string;
  execution_time_ms: number;
  status: "passed" | "failed" | "timeout" | "error";
}

export interface CreateSubmissionInput {
  studentId: string;
  exerciseId: string;
  sectionId: string;
  code: string;
  testResults: TestResultInput[];
  antiCheatNullified?: boolean;
  exitAttempt?: boolean;
  styleReport?: CheckstyleEvaluation;
}

export interface SubmissionFilters {
  exerciseId?: string;
  sectionId?: string;
  studentId?: string;
  sectionIds?: string[];
}

export interface SubmissionError {
  error: { code: string; message: string };
}

const JAVA_TEST_MARKER = "__OOP_JAVA_TEST__";
const DEFAULT_STYLE_WEIGHT_PERCENT = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isSubmissionError(value: unknown): value is SubmissionError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as any).error?.code === "string"
  );
}

/**
 * Calculate score based on test results compared to expected outputs.
 * Score = (sum of point_values for passed test cases / total point_values) × 100
 * Rounded to 2 decimal places.
 */
export function calculateScore(
  testCaseRecords: { id: string; expectedOutput: string; pointValue: number }[],
  testResults: TestResultInput[]
): number {
  if (testCaseRecords.length === 0) return 0;

  const totalPoints = testCaseRecords.reduce((sum, tc) => sum + tc.pointValue, 0);
  if (totalPoints === 0) return 0;

  let earnedPoints = 0;

  for (const tc of testCaseRecords) {
    const result = testResults.find((r) => r.test_case_id === tc.id);
    if (result) {
      if (result.status === "passed") {
        earnedPoints += tc.pointValue;
        continue;
      }

      // Compare actual_output (trimmed) with expected_output (trimmed)
      const actualTrimmed = (result.actual_output || "").trim();
      const expectedTrimmed = (tc.expectedOutput || "").trim();
      if (actualTrimmed === expectedTrimmed) {
        earnedPoints += tc.pointValue;
      }
    }
  }

  const score = (earnedPoints / totalPoints) * 100;
  return Math.round(score * 100) / 100;
}

async function getConfigNumber(
  key: string,
  fallback: number,
  database: Database
): Promise<number> {
  const config = await database.query.systemConfig.findFirst({
    where: eq(systemConfig.key, key),
  });
  const parsed = config ? Number(config.value) : fallback;
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getStyleSettings(database: Database) {
  const enabledValue = await getConfigNumber("style_check_enabled", 1, database);
  const weightPercent = await getConfigNumber(
    "style_check_weight_percent",
    DEFAULT_STYLE_WEIGHT_PERCENT,
    database
  );
  const penaltyPerViolation = await getConfigNumber("style_check_penalty_per_violation", 5, database);
  const maxViolations = await getConfigNumber("style_check_max_penalized_violations", 20, database);

  return {
    enabled: enabledValue === 1,
    weightPercent: clamp(weightPercent, 0, 50),
    penaltyPerViolation: clamp(penaltyPerViolation, 1, 20),
    maxViolations: Math.max(1, Math.min(100, Math.round(maxViolations))),
  };
}

function combineScores(functionalScore: number, styleScore: number | null, styleWeightPercent: number): number {
  if (styleScore === null || styleWeightPercent <= 0) return functionalScore;
  const testWeightPercent = 100 - styleWeightPercent;
  return Math.round((functionalScore * testWeightPercent + styleScore * styleWeightPercent) * 100) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function skippedStyleEvaluation(feedback: string): CheckstyleEvaluation {
  return {
    status: "skipped",
    score: null,
    violationCount: 0,
    violations: [],
    feedback,
    toolVersion: "checkstyle",
  };
}

// ─── Database type ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Create a submission, evaluate score, and store results.
 *
 * Flow:
 * 1. Verify exercise assignment exists for exercise+section
 * 2. Check deadline hasn't passed
 * 3. Check max_submissions limit not reached
 * 4. Calculate score from test results vs expected outputs
 * 5. Store submission with score
 * 6. Store per-test-case results in submission_results
 * 7. Return submission with score
 *
 * Validates: Requirements 6.7, 8.1, 10.3, 10.5
 */
export async function createSubmission(
  input: CreateSubmissionInput,
  database: Database = defaultDb
): Promise<SubmissionError | Record<string, unknown>> {
  await ensureSubmissionStyleColumns(database);

  const { studentId, exerciseId, sectionId, code, testResults, antiCheatNullified, exitAttempt, styleReport } = input;

  // 1. Verify exercise assignment exists for exercise+section
  const assignment = await database.query.exerciseAssignments.findFirst({
    where: and(
      eq(exerciseAssignments.exerciseId, exerciseId),
      eq(exerciseAssignments.sectionId, sectionId)
    ),
  });

  if (!assignment) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Exercise is not assigned to this section.",
      },
    };
  }

  if (assignment.allowSubmission === 0) {
    return {
      error: {
        code: "SUBMISSION_DISABLED",
        message: "Bài tập này hiện chưa cho phép nộp bài.",
      },
    };
  }

  // 2. Check deadline hasn't passed
  if (assignment.deadline) {
    const deadlineDate = new Date(assignment.deadline);
    const now = new Date();
    if (now > deadlineDate) {
      return {
        error: {
          code: "DEADLINE_PASSED",
          message: "The deadline for this exercise has passed. Submissions are no longer accepted.",
        },
      };
    }
  }

  // 3. Check max_submissions limit not reached
  const maxSubmissionsConfig = await database.query.systemConfig.findFirst({
    where: eq(systemConfig.key, "max_submissions"),
  });

  const globalMaxSubmissions = maxSubmissionsConfig
    ? parseInt(maxSubmissionsConfig.value, 10)
    : 10;
  const maxSubmissions = assignment.maxSubmissions ?? globalMaxSubmissions;

  if (maxSubmissions <= 0) {
    return {
      error: {
        code: "MAX_SUBMISSIONS_REACHED",
        message: "Bài tập này hiện không nhận lượt nộp.",
      },
    };
  }

  const existingSubmissions = await database
    .select({ count: count() })
    .from(submissions)
    .where(
      and(
        eq(submissions.studentId, studentId),
        eq(submissions.exerciseId, exerciseId),
        eq(submissions.sectionId, sectionId)
      )
    );

  const currentCount = existingSubmissions[0]?.count ?? 0;

  if (currentCount >= maxSubmissions) {
    return {
      error: {
        code: "MAX_SUBMISSIONS_REACHED",
        message: `You have reached the maximum number of submissions (${maxSubmissions}) for this exercise.`,
      },
    };
  }

  // 4. Calculate score from test results vs expected outputs
  // Fetch all test cases for this exercise
  const exerciseTestCases = await database.query.testCases.findMany({
    where: eq(testCases.exerciseId, exerciseId),
  });

  const testCaseRecords = exerciseTestCases.map((tc: any) => ({
    id: tc.id,
    expectedOutput: tc.expectedOutput,
    pointValue: tc.pointValue,
  }));

  const isAntiCheatZero = Boolean(antiCheatNullified);
  const isExitAttempt = Boolean(exitAttempt);
  const functionalScore = isAntiCheatZero || isExitAttempt ? 0 : calculateScore(testCaseRecords, testResults);
  const styleSettings = await getStyleSettings(database);
  let styleEvaluation =
    isAntiCheatZero || isExitAttempt
      ? skippedStyleEvaluation("Không chấm Checkstyle vì bài nộp đã bị ghi nhận 0 điểm.")
      : styleSettings.enabled
        ? await evaluateCheckstyle(code, {
          penaltyPerViolation: styleSettings.penaltyPerViolation,
          maxViolations: styleSettings.maxViolations,
        })
        : skippedStyleEvaluation("Chức năng chấm Checkstyle đang tắt trong cấu hình hệ thống.");

  // Fallback to client-side style check report if server check failed/unavailable and client provided one
  if (styleEvaluation.status === "unavailable" && styleReport && styleReport.status !== "unavailable") {
    styleEvaluation = {
      status: styleReport.status,
      score: styleReport.score,
      violationCount: styleReport.violationCount,
      violations: styleReport.violations,
      feedback: styleReport.status === "passed"
        ? "Không phát hiện lỗi Checkstyle theo Google Java Style (chấm bởi client)."
        : `Phát hiện ${styleReport.violationCount} lỗi Checkstyle (chấm bởi client). Điểm quy tắc lập trình: ${styleReport.score}/100.`,
      toolVersion: styleReport.toolVersion || "checkstyle-client",
    };
  }

  const score =
    isAntiCheatZero || isExitAttempt
      ? 0
      : combineScores(
        functionalScore,
        styleEvaluation.status === "unavailable" ? null : styleEvaluation.score,
        styleSettings.weightPercent
      );
  const feedback = isAntiCheatZero
    ? "Điểm bị hủy do vượt quá ngưỡng cảnh báo chống gian lận."
    : isExitAttempt
      ? "Bài làm tự động ghi nhận 0 điểm do sinh viên rời phiên làm bài toàn màn hình."
      : null;

  // 5. Store submission with score
  const attemptNumber = currentCount + 1;
  const submissionId = crypto.randomUUID();
  const submittedAt = new Date().toISOString();

  await database
    .insert(submissions)
    .values({
      id: submissionId,
      studentId,
      exerciseId,
      sectionId,
      code,
      functionalScore,
      score,
      styleScore: styleEvaluation.score,
      styleStatus: styleEvaluation.status,
      styleFeedback: styleEvaluation.feedback,
      styleReport: buildStyleReport(styleEvaluation),
      feedback,
      attemptNumber,
      submittedAt,
    });

  // 6. Store per-test-case results in submission_results
  const resultRecords = [];
  for (const tc of exerciseTestCases) {
    const result = testResults.find((r: TestResultInput) => r.test_case_id === tc.id);
    const actualOutput = result?.actual_output || "";
    const actualTrimmed = actualOutput.trim();
    const expectedTrimmed = (tc.expectedOutput || "").trim();
    const isJavaTest = typeof tc.inputData === "string" && tc.inputData.startsWith(JAVA_TEST_MARKER);
    const passed = result?.status === "passed" || (!isJavaTest && actualTrimmed === expectedTrimmed) ? 1 : 0;
    const status = passed ? "passed" : (result?.status || "failed");

    resultRecords.push({
      id: crypto.randomUUID(),
      submissionId,
      testCaseId: tc.id,
      passed,
      actualOutput: result?.actual_output || null,
      status,
      executionTimeMs: result?.execution_time_ms || null,
    });
  }

  if (resultRecords.length > 0) {
    await database.insert(submissionResults).values(resultRecords);
  }

  // 7. Return submission with score and results
  return {
    id: submissionId,
    studentId,
    exerciseId,
    sectionId,
    code,
    functionalScore,
    score,
    styleScore: styleEvaluation.score,
    styleStatus: styleEvaluation.status,
    styleFeedback: styleEvaluation.feedback,
    styleReport: buildStyleReport(styleEvaluation),
    feedback,
    attemptNumber,
    submittedAt,
    results: resultRecords.map((r) => ({
      id: r.id,
      testCaseId: r.testCaseId,
      passed: r.passed === 1,
      actualOutput: r.actualOutput,
      status: r.status,
      executionTimeMs: r.executionTimeMs,
    })),
  };
}

// ─── Read Operations ─────────────────────────────────────────────────────────

/**
 * List submissions with optional filters (exerciseId, sectionId, studentId).
 * Returns submissions sorted by submittedAt DESC, including student info.
 * Used by instructors to review submissions filtered by exercise/section.
 *
 * Validates: Requirements 5.1, 5.5
 */
export async function listSubmissions(
  filters: SubmissionFilters = {},
  database: Database = defaultDb
) {
  await ensureSubmissionStyleColumns(database);

  const conditions = [];

  if (filters.exerciseId) {
    conditions.push(eq(submissions.exerciseId, filters.exerciseId));
  }
  if (filters.sectionId) {
    conditions.push(eq(submissions.sectionId, filters.sectionId));
  }
  if (filters.studentId) {
    conditions.push(eq(submissions.studentId, filters.studentId));
  }

  if (filters.sectionIds && filters.sectionIds.length > 0) {
    conditions.push(inArray(submissions.sectionId, filters.sectionIds));
  }

  const whereClause =
    conditions.length > 0
      ? conditions.length === 1
        ? conditions[0]
        : and(...conditions)
      : undefined;

  const results = await database.query.submissions.findMany({
    where: whereClause,
    orderBy: [desc(submissions.submittedAt)],
    with: {
      student: {
        columns: {
          id: true,
          username: true,
          email: true,
          fullName: true,
        },
      },
      exercise: {
        columns: {
          id: true,
          title: true,
        },
      },
      section: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
  });

  return results;
}

/**
 * Get a single submission by ID with full detail:
 * - Student code, timestamp, score, attempt number
 * - Per-test-case results (pass/fail, points, actual output, status, execution time)
 *
 * Validates: Requirements 5.1
 */
export async function getSubmissionById(id: string, database: Database = defaultDb) {
  await ensureSubmissionStyleColumns(database);

  const submission = await database.query.submissions.findFirst({
    where: eq(submissions.id, id),
    with: {
      student: {
        columns: {
          id: true,
          username: true,
          email: true,
          fullName: true,
        },
      },
      exercise: {
        columns: {
          id: true,
          title: true,
        },
      },
      results: {
        with: {
          testCase: {
            columns: {
              id: true,
              inputData: true,
              expectedOutput: true,
              isVisible: true,
              pointValue: true,
            },
          },
        },
      },
    },
  });

  if (!submission) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Submission not found.",
      },
    };
  }

  const recheckedStyle = await recheckUnavailableStyle(submission, database);
  const hydratedSubmission = recheckedStyle ? { ...submission, ...recheckedStyle } : submission;

  return {
    ...hydratedSubmission,
    effectiveScore: hydratedSubmission.manualScore ?? hydratedSubmission.score,
  };
}

async function recheckUnavailableStyle(submission: any, database: Database) {
  if (submission.styleStatus !== "unavailable") return null;
  if (submission.feedback) return null;

  const styleSettings = await getStyleSettings(database);
  if (!styleSettings.enabled) return null;

  const styleEvaluation = await evaluateCheckstyle(submission.code, {
    penaltyPerViolation: styleSettings.penaltyPerViolation,
    maxViolations: styleSettings.maxViolations,
  });
  const functionalScore = Number.isFinite(Number(submission.functionalScore))
    ? Number(submission.functionalScore)
    : Number(submission.score ?? 0);
  const score = combineScores(
    functionalScore,
    styleEvaluation.status === "unavailable" ? null : styleEvaluation.score,
    styleSettings.weightPercent
  );
  const styleReport = buildStyleReport(styleEvaluation);

  await database
    .update(submissions)
    .set({
      score,
      styleScore: styleEvaluation.score,
      styleStatus: styleEvaluation.status,
      styleFeedback: styleEvaluation.feedback,
      styleReport,
    })
    .where(eq(submissions.id, submission.id));

  return {
    score,
    styleScore: styleEvaluation.score,
    styleStatus: styleEvaluation.status,
    styleFeedback: styleEvaluation.feedback,
    styleReport,
  };
}

/**
 * Grade a submission manually (instructor action).
 * - Sets manualScore (validated 0..100) and/or feedback.
 * - Returns the updated submission (re-fetched with results) on success.
 *
 * Validates: Requirements 5.x (instructor grading)
 */
export async function gradeSubmission(
  id: string,
  input: { score?: number; feedback?: string },
  database: Database = defaultDb
) {
  await ensureSubmissionStyleColumns(database);

  const existing = await database.query.submissions.findFirst({
    where: eq(submissions.id, id),
  });

  if (!existing) {
    return {
      error: { code: "NOT_FOUND", message: "Không tìm thấy bài nộp." },
    };
  }

  const updates: { manualScore?: number; feedback?: string } = {};

  if (input.score !== undefined) {
    if (input.score < 0 || input.score > 100) {
      return {
        error: { code: "VALIDATION_ERROR", message: "Điểm phải từ 0 đến 100." },
      };
    }
    updates.manualScore = input.score;
  }

  if (input.feedback !== undefined) {
    updates.feedback = input.feedback;
  }

  if (Object.keys(updates).length > 0) {
    await database.update(submissions).set(updates).where(eq(submissions.id, id));
  }

  return getSubmissionById(id, database);
}

async function ensureSubmissionStyleColumns(database: Database = defaultDb) {
  const sqlite = (database as any).session?.client;
  if (!sqlite) return;

  const statements = [
    "ALTER TABLE submissions ADD COLUMN functional_score REAL",
    "ALTER TABLE submissions ADD COLUMN style_score REAL",
    "ALTER TABLE submissions ADD COLUMN style_status TEXT",
    "ALTER TABLE submissions ADD COLUMN style_feedback TEXT",
    "ALTER TABLE submissions ADD COLUMN style_report TEXT",
    "INSERT INTO system_config (key, value, valid_range, updated_at, updated_by) VALUES ('style_check_enabled', '1', '0-1', datetime('now'), NULL) ON CONFLICT(key) DO NOTHING",
    "INSERT INTO system_config (key, value, valid_range, updated_at, updated_by) VALUES ('style_check_weight_percent', '10', '0-50', datetime('now'), NULL) ON CONFLICT(key) DO NOTHING",
    "INSERT INTO system_config (key, value, valid_range, updated_at, updated_by) VALUES ('style_check_penalty_per_violation', '5', '1-20', datetime('now'), NULL) ON CONFLICT(key) DO NOTHING",
    "INSERT INTO system_config (key, value, valid_range, updated_at, updated_by) VALUES ('style_check_max_penalized_violations', '20', '1-100', datetime('now'), NULL) ON CONFLICT(key) DO NOTHING",
  ];

  for (const statement of statements) {
    try {
      if (typeof sqlite.exec === "function") {
        sqlite.exec(statement);
      } else if (typeof sqlite.execute === "function") {
        await sqlite.execute(statement);
      }
    } catch (error: any) {
      const message = String(error?.message ?? error);
      const normalized = message.toLowerCase();
      if (!normalized.includes("duplicate column") && !normalized.includes("no such table")) {
        console.error("ensureSubmissionStyleColumns error:", message);
      }
    }
  }
}

// ─── Student Progress ────────────────────────────────────────────────────────

export interface StudentProgress {
  completedExercises: number;
  averageScore: number;
  rank: number;
}

/**
 * Get a student's progress in a section:
 * - completedExercises: exercises where student has at least one submission scoring 100%
 * - averageScore: average score across all assigned exercises (0 for unsubmitted)
 * - rank: student's rank among students in the section (ranked by total score descending)
 *
 * Validates: Requirements 8.3
 */
export async function getStudentProgress(
  studentId: string,
  sectionId: string,
  database: Database = defaultDb
): Promise<StudentProgress> {
  // 1. Get all exercises assigned to this section
  const assignments = await database.query.exerciseAssignments.findMany({
    where: eq(exerciseAssignments.sectionId, sectionId),
  });

  const assignedExerciseIds = assignments.map((a: any) => a.exerciseId);
  const totalAssignedExercises = assignedExerciseIds.length;

  // 2. Get all submissions for this section
  const allSectionSubmissions = await database
    .select({
      studentId: submissions.studentId,
      exerciseId: submissions.exerciseId,
      score: submissions.score,
    })
    .from(submissions)
    .where(eq(submissions.sectionId, sectionId));

  // 3. Get all enrolled students in this section
  const enrollments = await database
    .select({
      studentId: sectionEnrollments.studentId,
    })
    .from(sectionEnrollments)
    .where(eq(sectionEnrollments.sectionId, sectionId));

  const enrolledStudentIds = enrollments.map((e: any) => e.studentId);

  // 4. Compute per-student stats for ranking
  const studentScores = new Map<string, number>(); // studentId -> total highest score

  for (const sid of enrolledStudentIds) {
    // For each student, find highest score per exercise
    const studentSubmissions = allSectionSubmissions.filter(
      (s: any) => s.studentId === sid
    );

    const highestPerExercise = new Map<string, number>();
    for (const sub of studentSubmissions) {
      const score = sub.score ?? 0;
      const current = highestPerExercise.get(sub.exerciseId) ?? 0;
      if (score > current) {
        highestPerExercise.set(sub.exerciseId, score);
      }
    }

    let totalScore = 0;
    for (const score of highestPerExercise.values()) {
      totalScore += score;
    }
    studentScores.set(sid, Math.round(totalScore * 100) / 100);
  }

  // 5. Rank students by total score descending
  const sortedStudents = [...studentScores.entries()].sort(
    (a, b) => b[1] - a[1]
  );

  let rank = 1;
  for (const [sid] of sortedStudents) {
    if (sid === studentId) break;
    rank++;
  }

  // 6. Calculate student-specific stats
  const mySubmissions = allSectionSubmissions.filter(
    (s: any) => s.studentId === studentId
  );

  // completedExercises: exercises with at least one submission scoring exactly 100%
  const completedExercises = new Set<string>();
  for (const sub of mySubmissions) {
    if (sub.score === 100) {
      completedExercises.add(sub.exerciseId);
    }
  }

  // averageScore: average of highest scores per assigned exercise (0 for unsubmitted)
  let averageScore = 0;
  if (totalAssignedExercises > 0) {
    const highestPerExercise = new Map<string, number>();
    for (const sub of mySubmissions) {
      const score = sub.score ?? 0;
      const current = highestPerExercise.get(sub.exerciseId) ?? 0;
      if (score > current) {
        highestPerExercise.set(sub.exerciseId, score);
      }
    }

    let totalScoreForAvg = 0;
    for (const exerciseId of assignedExerciseIds) {
      totalScoreForAvg += highestPerExercise.get(exerciseId) ?? 0;
    }
    averageScore =
      Math.round((totalScoreForAvg / totalAssignedExercises) * 100) / 100;
  }

  return {
    completedExercises: completedExercises.size,
    averageScore,
    rank,
  };
}
