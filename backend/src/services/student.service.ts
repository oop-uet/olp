import { eq, and, inArray } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  exercises,
  exerciseAssignments,
  testCases,
  classSections,
  sectionEnrollments,
  submissions,
  systemConfig,
} from "../db/schema.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StudentSection {
  id: string;
  name: string;
  semester: string;
}

export type StudentExerciseStatus =
  | "completed"
  | "overdue"
  | "in_progress"
  | "not_started";

export interface StudentExerciseListItem {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  oopTags: string[];
  sectionId: string;
  sectionName: string;
  deadline: string | null;
  week: number;
  isAssessment: boolean;
  bestScore: number | null;
  attemptCount: number;
  maxSubmissions: number;
  allowSubmission: boolean;
  status: StudentExerciseStatus;
}

export interface StudentVisibleTestCase {
  id: string;
  inputData: string;
  expectedOutput: string;
  isVisible: true;
  pointValue: number;
  timeLimitSeconds: number | null;
}

export interface StudentExerciseDetail {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  oopTags: string[];
  starterCode: string | null;
  sectionId: string;
  sectionName: string;
  deadline: string | null;
  isAssessment: boolean;
  warningThreshold: number;
  attemptCount: number;
  maxSubmissions: number;
  allowSubmission: boolean;
  bestScore: number | null;
  testCases: StudentVisibleTestCase[];
}

export interface StudentError {
  error: { code: string; message: string };
}

// ─── Database type ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Type guard to check if a service result is an error.
 */
export function isStudentError(value: unknown): value is StudentError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as any).error?.code === "string"
  );
}

/**
 * Safely parse the oop_tags JSON text column into a string array.
 */
function parseOopTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
  } catch {
    return [];
  }
}

/**
 * Read the configured max submissions value (default 10 if missing/invalid).
 */
async function getMaxSubmissions(database: Database): Promise<number> {
  const config = await database.query.systemConfig.findFirst({
    where: eq(systemConfig.key, "max_submissions"),
  });

  if (!config) return 10;
  const parsed = parseInt(config.value, 10);
  return Number.isNaN(parsed) ? 10 : parsed;
}

/**
 * Read the configured anti-cheat warning threshold (default 3 if missing/invalid).
 */
async function getWarningThreshold(database: Database): Promise<number> {
  const config = await database.query.systemConfig.findFirst({
    where: eq(systemConfig.key, "warning_threshold"),
  });

  if (!config) return 3;
  const parsed = parseInt(config.value, 10);
  return Number.isNaN(parsed) ? 3 : parsed;
}

/**
 * Determine an exercise status from the student's progress and the deadline.
 */
function deriveStatus(
  bestScore: number | null,
  deadline: string | null,
  attemptCount: number
): StudentExerciseStatus {
  if (bestScore === 100) return "completed";
  if (deadline && new Date() > new Date(deadline)) return "overdue";
  if (attemptCount > 0) return "in_progress";
  return "not_started";
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * List the class sections a student is enrolled in.
 */
export async function listStudentSections(
  studentId: string,
  database: Database = defaultDb
): Promise<StudentSection[]> {
  const rows = await database
    .select({
      id: classSections.id,
      name: classSections.name,
      semester: classSections.semester,
    })
    .from(sectionEnrollments)
    .innerJoin(
      classSections,
      eq(sectionEnrollments.sectionId, classSections.id)
    )
    .where(eq(sectionEnrollments.studentId, studentId));

  return rows as StudentSection[];
}

/**
 * List all exercises assigned to the sections a student is enrolled in.
 * Returns one entry per (exercise, section) pairing along with the student's
 * progress for that pairing.
 */
export async function listStudentExercises(
  studentId: string,
  database: Database = defaultDb
): Promise<{ exercises: StudentExerciseListItem[] }> {
  const sections = await listStudentSections(studentId, database);

  if (sections.length === 0) {
    return { exercises: [] };
  }

  const maxSubmissions = await getMaxSubmissions(database);
  const sectionIds = sections.map((s) => s.id);
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  // All assignments across the student's enrolled sections.
  const assignments = await database.query.exerciseAssignments.findMany({
    where: and(
      inArray(exerciseAssignments.sectionId, sectionIds),
      eq(exerciseAssignments.isVisible, 1)
    ),
    with: { exercise: true },
  });

  // All of the student's submissions for the relevant sections.
  const mySubmissions = await database
    .select({
      exerciseId: submissions.exerciseId,
      sectionId: submissions.sectionId,
      score: submissions.score,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.studentId, studentId),
        inArray(submissions.sectionId, sectionIds)
      )
    );

  const items: StudentExerciseListItem[] = [];

  for (const assignment of assignments) {
    const exercise = assignment.exercise;
    if (!exercise) continue;

    const section = sectionById.get(assignment.sectionId);
    if (!section) continue;

    const relevant = mySubmissions.filter(
      (s: any) =>
          s.exerciseId === assignment.exerciseId &&
          s.sectionId === assignment.sectionId
    );

    const attemptCount = relevant.length;
    let bestScore: number | null = null;
    for (const s of relevant) {
      const score = s.score ?? null;
      if (score !== null && (bestScore === null || score > bestScore)) {
        bestScore = score;
      }
    }

    const effectiveMaxSubmissions = assignment.maxSubmissions ?? maxSubmissions;

    items.push({
      id: exercise.id,
      title: exercise.title,
      description: exercise.description,
      difficulty: exercise.difficulty,
      oopTags: parseOopTags(exercise.oopTags),
      sectionId: section.id,
      sectionName: section.name,
      deadline: assignment.deadline ?? null,
      week: assignment.week,
      isAssessment: assignment.isAssessment === 1,
      bestScore,
      attemptCount,
      maxSubmissions: effectiveMaxSubmissions,
      allowSubmission: assignment.allowSubmission === 1,
      status: deriveStatus(bestScore, assignment.deadline ?? null, attemptCount),
    });
  }

  return { exercises: items };
}

/**
 * Get the detail of a single exercise for a student, scoped to a section the
 * student is enrolled in. Only visible test cases are returned.
 */
export async function getStudentExercise(
  studentId: string,
  exerciseId: string,
  database: Database = defaultDb
): Promise<StudentExerciseDetail | StudentError> {
  const sections = await listStudentSections(studentId, database);

  if (sections.length === 0) {
    return {
      error: { code: "NOT_FOUND", message: "Bài tập không khả dụng." },
    };
  }

  const sectionIds = sections.map((s) => s.id);
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  // Find assignments of this exercise within the student's enrolled sections.
  const assignments = await database.query.exerciseAssignments.findMany({
    where: and(
      eq(exerciseAssignments.exerciseId, exerciseId),
      inArray(exerciseAssignments.sectionId, sectionIds),
      eq(exerciseAssignments.isVisible, 1)
    ),
  });

  if (assignments.length === 0) {
    return {
      error: { code: "NOT_FOUND", message: "Bài tập không khả dụng." },
    };
  }

  // Pick the first match, preferring one whose deadline has not passed.
  const now = new Date();
  const notPassed = assignments.find(
    (a: any) => !a.deadline || new Date(a.deadline) >= now
  );
  const assignment = notPassed ?? assignments[0];

  const section = sectionById.get(assignment.sectionId)!;

  const exercise = await database.query.exercises.findFirst({
    where: eq(exercises.id, exerciseId),
  });

  if (!exercise) {
    return {
      error: { code: "NOT_FOUND", message: "Bài tập không khả dụng." },
    };
  }

  // Only visible test cases are exposed to students.
  const visibleTestCases = await database.query.testCases.findMany({
    where: and(
      eq(testCases.exerciseId, exerciseId),
      eq(testCases.isVisible, 1)
    ),
  });

  const [maxSubmissions, warningThreshold] = await Promise.all([
    getMaxSubmissions(database),
    getWarningThreshold(database),
  ]);
  const effectiveMaxSubmissions = assignment.maxSubmissions ?? maxSubmissions;

  const relevant = await database
    .select({ score: submissions.score })
    .from(submissions)
    .where(
      and(
        eq(submissions.studentId, studentId),
        eq(submissions.exerciseId, exerciseId),
        eq(submissions.sectionId, assignment.sectionId)
      )
    );

  const attemptCount = relevant.length;
  let bestScore: number | null = null;
  for (const s of relevant) {
    const score = s.score ?? null;
    if (score !== null && (bestScore === null || score > bestScore)) {
      bestScore = score;
    }
  }

  return {
    id: exercise.id,
    title: exercise.title,
    description: exercise.description,
    difficulty: exercise.difficulty,
    oopTags: parseOopTags(exercise.oopTags),
    starterCode: exercise.starterCode ?? null,
    sectionId: section.id,
    sectionName: section.name,
    deadline: assignment.deadline ?? null,
    isAssessment: assignment.isAssessment === 1,
    warningThreshold,
    attemptCount,
    maxSubmissions: effectiveMaxSubmissions,
    allowSubmission: assignment.allowSubmission === 1,
    bestScore,
    testCases: visibleTestCases.map((tc: any) => ({
      id: tc.id,
      inputData: tc.inputData,
      expectedOutput: tc.expectedOutput,
      isVisible: true as const,
      pointValue: tc.pointValue,
      timeLimitSeconds: tc.timeLimitSeconds ?? null,
    })),
  };
}
