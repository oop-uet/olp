import { eq } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import { submissions, sectionEnrollments, users, exerciseAssignments } from "../db/schema.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  studentName: string;
  studentId: string;
  totalScore: number;
  completedExercises: number;
  latestSubmission: string | null;
}

export interface SubmissionData {
  studentId: string;
  exerciseId: string;
  score: number | null;
  submittedAt: string;
}

export interface StudentInfo {
  userId: string;
  studentName: string;
  studentExternalId: string | null;
}

// ─── Core Ranking Function (exported for PBT) ────────────────────────────────

/**
 * Computes leaderboard rankings from raw submission data and student info.
 * This is a pure function suitable for property-based testing.
 *
 * Algorithm:
 * 1. For each student, find highest score per exercise
 * 2. Total score = sum of highest scores per exercise
 * 3. Rank by total score descending
 * 4. Tie-breaker: earliest latest-submission timestamp
 * 5. Completed exercises = exercises with at least one submission scoring > 0
 */
export function computeLeaderboard(
  students: StudentInfo[],
  submissionsData: SubmissionData[]
): LeaderboardEntry[] {
  // Build per-student stats
  const studentStats = new Map<
    string,
    {
      highestScores: Map<string, number>; // exerciseId -> highest score
      latestSubmission: string | null;
      completedExercises: Set<string>;
    }
  >();

  // Initialize all enrolled students (even those with no submissions)
  for (const student of students) {
    studentStats.set(student.userId, {
      highestScores: new Map(),
      latestSubmission: null,
      completedExercises: new Set(),
    });
  }

  // Process submissions
  for (const sub of submissionsData) {
    const stats = studentStats.get(sub.studentId);
    if (!stats) continue; // submission from non-enrolled student, skip

    const score = sub.score ?? 0;

    // Track highest score per exercise
    const currentHighest = stats.highestScores.get(sub.exerciseId) ?? 0;
    if (score > currentHighest) {
      stats.highestScores.set(sub.exerciseId, score);
    }

    // Track latest submission timestamp
    if (!stats.latestSubmission || sub.submittedAt > stats.latestSubmission) {
      stats.latestSubmission = sub.submittedAt;
    }

    // Track completed exercises (score > 0)
    if (score > 0) {
      stats.completedExercises.add(sub.exerciseId);
    }
  }

  // Build unsorted entries
  const entries: Array<{
    studentName: string;
    studentId: string;
    totalScore: number;
    completedExercises: number;
    latestSubmission: string | null;
  }> = [];

  for (const student of students) {
    const stats = studentStats.get(student.userId)!;
    let totalScore = 0;
    for (const score of stats.highestScores.values()) {
      totalScore += score;
    }

    entries.push({
      studentName: student.studentName,
      studentId: student.studentExternalId || student.userId,
      totalScore: Math.round(totalScore * 100) / 100, // round to 2 decimal places
      completedExercises: stats.completedExercises.size,
      latestSubmission: stats.latestSubmission,
    });
  }

  // Sort: by total score descending, then by latest submission ascending (earliest wins tie)
  entries.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    // Tie-breaker: earliest latest-submission timestamp wins
    // Students without submissions go last
    if (!a.latestSubmission && !b.latestSubmission) return 0;
    if (!a.latestSubmission) return 1;
    if (!b.latestSubmission) return -1;
    return a.latestSubmission < b.latestSubmission ? -1 : a.latestSubmission > b.latestSubmission ? 1 : 0;
  });

  // Assign ranks
  return entries.map((entry, index) => ({
    rank: index + 1,
    ...entry,
  }));
}

// ─── Database-backed Service Function ─────────────────────────────────────────

/**
 * Get the leaderboard for a specific class section.
 */
export async function getLeaderboard(
  sectionId: string,
  database = defaultDb
): Promise<{ leaderboard: LeaderboardEntry[] } | { error: { code: string; message: string } }> {
  // Get enrolled students for the section
  const enrollments = await database
    .select({
      userId: sectionEnrollments.studentId,
      studentExternalId: sectionEnrollments.studentExternalId,
      username: users.username,
    })
    .from(sectionEnrollments)
    .innerJoin(users, eq(sectionEnrollments.studentId, users.id))
    .where(eq(sectionEnrollments.sectionId, sectionId));

  if (enrollments.length === 0) {
    return { leaderboard: [] };
  }

  const studentInfos: StudentInfo[] = enrollments.map((e) => ({
    userId: e.userId,
    studentName: e.username,
    studentExternalId: e.studentExternalId,
  }));

  // Get all submissions for this section
  const sectionSubmissions = await database
    .select({
      studentId: submissions.studentId,
      exerciseId: submissions.exerciseId,
      score: submissions.score,
      submittedAt: submissions.submittedAt,
    })
    .from(submissions)
    .where(eq(submissions.sectionId, sectionId));

  // Get total exercises assigned to this section to calculate max possible score
  const assignments = await database
    .select()
    .from(exerciseAssignments)
    .where(eq(exerciseAssignments.sectionId, sectionId));
  const maxPossibleScore = assignments.length * 100;

  const leaderboard = computeLeaderboard(studentInfos, sectionSubmissions);

  return { leaderboard, maxPossibleScore };
}

/**
 * Type guard to check if a service result is an error.
 */
export function isLeaderboardError(
  value: unknown
): value is { error: { code: string; message: string } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as any).error?.code === "string"
  );
}
