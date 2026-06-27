import crypto from "node:crypto";
import { eq, and, count, desc } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  submissions,
  submissionResults,
  testCases,
  exerciseAssignments,
  systemConfig,
  sectionEnrollments,
} from "../db/schema.js";

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
}

export interface SubmissionFilters {
  exerciseId?: string;
  sectionId?: string;
  studentId?: string;
}

export interface SubmissionError {
  error: { code: string; message: string };
}

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
  const { studentId, exerciseId, sectionId, code, testResults } = input;

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

  const maxSubmissions = maxSubmissionsConfig
    ? parseInt(maxSubmissionsConfig.value, 10)
    : 10;

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

  const score = calculateScore(testCaseRecords, testResults);

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
      score,
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
    const passed = actualTrimmed === expectedTrimmed ? 1 : 0;
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
    score,
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
  const submission = await database.query.submissions.findFirst({
    where: eq(submissions.id, id),
    with: {
      student: {
        columns: {
          id: true,
          username: true,
          email: true,
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

  return submission;
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
