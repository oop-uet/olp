import crypto from "node:crypto";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  exercises,
  exerciseAssignments,
  testCases,
  classSections,
  sectionEnrollments,
  sectionInstructors,
  submissions,
  submissionResults,
} from "../db/schema.js";
import {
  DEFAULT_STYLE_DISABLED_RULES,
  normalizeStylePolicy,
  type StyleRulePolicy,
} from "./checkstyle.service.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TestCaseInput {
  input_data: string;
  expected_output: string;
  is_visible?: boolean;
  point_value?: number;
  time_limit_seconds?: number;
}

export interface CreateExerciseInput {
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  oop_tags: string[];
  starter_code?: string;
  is_library?: boolean;
  style_check_enabled?: boolean;
  style_policy?: StyleRulePolicy;
  test_cases: TestCaseInput[];
}

export interface UpdateExerciseInput {
  title?: string;
  description?: string;
  difficulty?: "easy" | "medium" | "hard";
  oop_tags?: string[];
  starter_code?: string;
  is_library?: boolean;
  style_check_enabled?: boolean;
  style_policy?: StyleRulePolicy;
  test_cases?: TestCaseInput[];
}

export interface AssignExerciseInput {
  section_id: string;
  deadline?: string;
  is_assessment?: boolean;
}

export interface ExerciseError {
  error: { code: string; message: string };
}

type Database = typeof defaultDb;

const PROJECT_DESCRIPTION_MAX_LENGTH = 12000;
const REGULAR_DESCRIPTION_MAX_LENGTH = 5000;

function normalizeProjectMarker(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseOopTagsValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function isProjectExercise(title: string | undefined, tags: string[] | undefined): boolean {
  const normalizedTitle = normalizeProjectMarker(title ?? "");
  if (
    normalizedTitle.includes("bai tap lon") ||
    normalizedTitle.includes("btl") ||
    normalizedTitle.includes("project")
  ) {
    return true;
  }

  return (tags ?? []).some((tag) => {
    const normalizedTag = normalizeProjectMarker(tag);
    return normalizedTag === "project" || normalizedTag === "btl" || normalizedTag === "bai tap lon";
  });
}

function defaultExerciseStylePolicy(): StyleRulePolicy {
  return {
    enabled: true,
    profile: "uet-oop-basic",
    disabledRules: DEFAULT_STYLE_DISABLED_RULES,
    weightPercent: 10,
    penaltyPerViolation: 5,
    maxViolations: 20,
  };
}

export function serializeExerciseStylePolicy(input?: unknown): string {
  return JSON.stringify(normalizeStylePolicy(input ?? defaultExerciseStylePolicy()));
}

export function parseExerciseStylePolicy(exercise: { styleCheckEnabled?: number | boolean | null; stylePolicy?: string | null } | null | undefined): StyleRulePolicy {
  const rawPolicy = (() => {
    if (!exercise?.stylePolicy) return defaultExerciseStylePolicy();
    try {
      return JSON.parse(exercise.stylePolicy);
    } catch {
      return defaultExerciseStylePolicy();
    }
  })();
  return {
    ...normalizeStylePolicy(rawPolicy),
    enabled: exercise?.styleCheckEnabled === 0 || exercise?.styleCheckEnabled === false ? false : rawPolicy.enabled ?? true,
  };
}

async function ensureExerciseStyleColumns(database = defaultDb) {
  const sqlite = (database as any).session?.client;
  if (!sqlite) return;

  for (const statement of [
    "ALTER TABLE exercises ADD COLUMN style_check_enabled INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE exercises ADD COLUMN style_policy TEXT",
  ]) {
    try {
      if (typeof sqlite.exec === "function") {
        sqlite.exec(statement);
      } else if (typeof sqlite.execute === "function") {
        await sqlite.execute(statement);
      }
    } catch {
      // Column already exists.
    }
  }
}

async function canUpdateExercise(
  exercise: { id: string; createdBy: string | null },
  userId: string,
  role: string,
  database = defaultDb
) {
  if (role === "admin" || exercise.createdBy === userId) return true;

  const directSections = await database
    .select({ id: exerciseAssignments.id })
    .from(exerciseAssignments)
    .innerJoin(classSections, eq(exerciseAssignments.sectionId, classSections.id))
    .where(and(eq(exerciseAssignments.exerciseId, exercise.id), eq(classSections.instructorId, userId)))
    .limit(1);
  if (directSections.length > 0) return true;

  const assignedSections = await database
    .select({ id: exerciseAssignments.id })
    .from(exerciseAssignments)
    .innerJoin(sectionInstructors, eq(exerciseAssignments.sectionId, sectionInstructors.sectionId))
    .where(and(eq(exerciseAssignments.exerciseId, exercise.id), eq(sectionInstructors.instructorId, userId)))
    .limit(1);

  return assignedSections.length > 0;
}

async function replaceTestCases(
  exerciseId: string,
  inputTestCases: TestCaseInput[],
  database = defaultDb
) {
  const now = new Date().toISOString();

  const existingTestCases = await database.query.testCases.findMany({
    where: eq(testCases.exerciseId, exerciseId),
  });
  const testCaseIds = existingTestCases.map((tc) => tc.id);

  if (testCaseIds.length > 0) {
    await database
      .delete(submissionResults)
      .where(inArray(submissionResults.testCaseId, testCaseIds));
    await database
      .delete(testCases)
      .where(inArray(testCases.id, testCaseIds));
  }

  const testCaseRows = inputTestCases.map((tc) => ({
    id: crypto.randomUUID(),
    exerciseId,
    inputData: tc.input_data,
    expectedOutput: tc.expected_output,
    isVisible: tc.is_visible ? 1 : 0,
    pointValue: tc.point_value ?? 1,
    timeLimitSeconds: tc.time_limit_seconds ?? null,
    createdAt: now,
  }));

  if (testCaseRows.length > 0) {
    await database.insert(testCases).values(testCaseRows);
  }

  return testCaseRows;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * List exercises for the given user. Instructors see exercises they created;
 * admins see all exercises.
 */
export async function listExercises(
  userId: string,
  role: string,
  database = defaultDb
) {
  await ensureExerciseStyleColumns(database);

  if (role === "admin") {
    return database.query.exercises.findMany({
      with: {
        creator: {
          columns: {
            id: true,
            username: true,
          },
        },
        testCases: true,
      },
    });
  }

  // Instructors see only their own exercises
  return database.query.exercises.findMany({
    where: eq(exercises.createdBy, userId),
    with: {
      creator: {
        columns: {
          id: true,
          username: true,
        },
      },
      testCases: true,
    },
  });
}

/**
 * Get a single exercise by ID.
 */
export async function getExerciseById(id: string, database = defaultDb) {
  await ensureExerciseStyleColumns(database);

  const exercise = await database.query.exercises.findFirst({
    where: eq(exercises.id, id),
    with: {
      testCases: true,
    },
  });

  if (!exercise) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Exercise not found.",
      },
    };
  }

  return exercise;
}

/**
 * Build the instructor-facing exercise page:
 * - description and metadata
 * - all test cases
 * - submission history in sections taught by the current instructor
 * - per-section statistics for those sections
 */
export async function getInstructorExerciseOverview(
  id: string,
  userId: string,
  role: string,
  database: Database = defaultDb
) {
  await ensureExerciseStyleColumns(database);

  const exercise = await database.query.exercises.findFirst({
    where: eq(exercises.id, id),
    with: {
      testCases: true,
    },
  });

  if (!exercise) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Exercise not found.",
      },
    };
  }

  const taughtSections = await listAccessibleSectionsForExercise(id, userId, role, database);
  const taughtSectionIds = taughtSections.map((section) => section.id);

  const canView =
    role === "admin" ||
    exercise.createdBy === userId ||
    exercise.isLibrary === 1 ||
    taughtSectionIds.length > 0;

  if (!canView) {
    return {
      error: {
        code: "FORBIDDEN",
        message: "You do not have permission to view this exercise.",
      },
    };
  }

  const history =
    taughtSectionIds.length > 0
      ? await database.query.submissions.findMany({
          where: and(
            eq(submissions.exerciseId, id),
            inArray(submissions.sectionId, taughtSectionIds)
          ),
          orderBy: [desc(submissions.submittedAt)],
          with: {
            student: {
              columns: {
                id: true,
                username: true,
                fullName: true,
                email: true,
              },
            },
            section: {
              columns: {
                id: true,
                name: true,
                semester: true,
              },
            },
          },
        })
      : [];

  const sectionStats = [];
  for (const section of taughtSections) {
    const enrollments = await database
      .select({ studentId: sectionEnrollments.studentId })
      .from(sectionEnrollments)
      .where(eq(sectionEnrollments.sectionId, section.id));

    const sectionSubmissions = history.filter((submission) => submission.sectionId === section.id);
    const submittedStudentIds = new Set(sectionSubmissions.map((submission) => submission.studentId));
    const effectiveScores = sectionSubmissions
      .map((submission) => submission.manualScore ?? submission.score ?? 0)
      .filter((score) => Number.isFinite(score));
    const bestScoreByStudent = new Map<string, number>();

    for (const submission of sectionSubmissions) {
      const score = submission.manualScore ?? submission.score ?? 0;
      const current = bestScoreByStudent.get(submission.studentId) ?? 0;
      if (score > current) bestScoreByStudent.set(submission.studentId, score);
    }

    const acceptedCount = [...bestScoreByStudent.values()].filter((score) => score >= 100).length;
    const averageBestScore =
      bestScoreByStudent.size > 0
        ? [...bestScoreByStudent.values()].reduce((sum, score) => sum + score, 0) /
          bestScoreByStudent.size
        : 0;

    sectionStats.push({
      sectionId: section.id,
      sectionName: section.name,
      semester: section.semester,
      studentCount: enrollments.length,
      submittedStudentCount: submittedStudentIds.size,
      submissionCount: sectionSubmissions.length,
      acceptedCount,
      averageScore:
        effectiveScores.length > 0
          ? effectiveScores.reduce((sum, score) => sum + score, 0) / effectiveScores.length
          : 0,
      averageBestScore,
      maxScore: effectiveScores.length > 0 ? Math.max(...effectiveScores) : 0,
    });
  }

  return {
    exercise,
    testCases: exercise.testCases,
    sections: taughtSections,
    stats: sectionStats,
    submissions: history.map((submission) => ({
      id: submission.id,
      studentId: submission.studentId,
      student: submission.student,
      sectionId: submission.sectionId,
      section: submission.section,
      score: submission.score,
      manualScore: submission.manualScore,
      effectiveScore: submission.manualScore ?? submission.score ?? 0,
      attemptNumber: submission.attemptNumber,
      submittedAt: submission.submittedAt,
    })),
  };
}

async function listAccessibleSectionsForExercise(
  exerciseId: string,
  userId: string,
  role: string,
  database: Database
) {
  const assignedRows = await database
    .select({
      id: classSections.id,
      name: classSections.name,
      semester: classSections.semester,
      instructorId: classSections.instructorId,
    })
    .from(exerciseAssignments)
    .innerJoin(classSections, eq(exerciseAssignments.sectionId, classSections.id))
    .where(eq(exerciseAssignments.exerciseId, exerciseId));

  if (role === "admin") return assignedRows;

  if (assignedRows.length === 0) return [];

  const sectionIds = assignedRows.map((section) => section.id);
  const memberships = await database
    .select({ sectionId: sectionInstructors.sectionId })
    .from(sectionInstructors)
    .where(
      and(
        eq(sectionInstructors.instructorId, userId),
        inArray(sectionInstructors.sectionId, sectionIds)
      )
    );
  const memberSectionIds = new Set(memberships.map((membership) => membership.sectionId));

  return assignedRows.filter(
    (section) => section.instructorId === userId || memberSectionIds.has(section.id)
  );
}

/**
 * Create a new exercise with associated test cases.
 */
export async function createExercise(
  input: CreateExerciseInput,
  createdBy: string,
  database = defaultDb
) {
  await ensureExerciseStyleColumns(database);

  // Validate title length
  if (input.title.length > 200) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Title must be at most 200 characters.",
      },
    };
  }

  const projectExercise = isProjectExercise(input.title, input.oop_tags);
  const descriptionMaxLength = projectExercise
    ? PROJECT_DESCRIPTION_MAX_LENGTH
    : REGULAR_DESCRIPTION_MAX_LENGTH;

  // Validate description length
  if (input.description.length > descriptionMaxLength) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: `Description must be at most ${descriptionMaxLength} characters.`,
      },
    };
  }

  // Validate OOP tags (1-5)
  if (input.oop_tags.length < 1 || input.oop_tags.length > 5) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Must provide between 1 and 5 OOP tags.",
      },
    };
  }

  if (input.test_cases && input.test_cases.length > 50) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Must provide at most 50 test cases.",
      },
    };
  }

  // Project assignments are submitted as GitHub URLs and do not use executor test cases.
  if (!projectExercise && (!input.test_cases || input.test_cases.length < 1)) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "At least one test case is required.",
      },
    };
  }

  const exerciseId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Insert the exercise
  const [exercise] = await database
    .insert(exercises)
    .values({
      id: exerciseId,
      title: input.title,
      description: input.description,
      difficulty: input.difficulty,
      starterCode: input.starter_code || null,
      isLibrary: input.is_library ? 1 : 0,
      oopTags: JSON.stringify(input.oop_tags),
      styleCheckEnabled: input.style_check_enabled === false ? 0 : 1,
      stylePolicy: serializeExerciseStylePolicy(input.style_policy),
      createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Insert test cases
  const testCaseValues = (input.test_cases ?? []).map((tc) => ({
    id: crypto.randomUUID(),
    exerciseId,
    inputData: tc.input_data,
    expectedOutput: tc.expected_output,
    isVisible: tc.is_visible ? 1 : 0,
    pointValue: tc.point_value ?? 1,
    timeLimitSeconds: tc.time_limit_seconds ?? null,
    createdAt: now,
  }));

  if (testCaseValues.length > 0) {
    await database.insert(testCases).values(testCaseValues);
  }

  return {
    ...exercise,
    oopTags: input.oop_tags,
    testCases: testCaseValues,
  };
}

/**
 * Update an existing exercise.
 */
export async function updateExercise(
  id: string,
  input: UpdateExerciseInput,
  userId: string,
  role: string,
  database = defaultDb
) {
  await ensureExerciseStyleColumns(database);

  // Verify exercise exists
  const existing = await database.query.exercises.findFirst({
    where: eq(exercises.id, id),
  });

  if (!existing) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Exercise not found.",
      },
    };
  }

  if (!(await canUpdateExercise(existing, userId, role, database))) {
    return {
      error: {
        code: "FORBIDDEN",
        message: "Bạn chỉ có thể cập nhật bài tập do mình tạo hoặc bài tập đã giao cho lớp mình phụ trách.",
      },
    };
  }

  // Validate title length if provided
  if (input.title !== undefined && input.title.length > 200) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Title must be at most 200 characters.",
      },
    };
  }

  const nextTitle = input.title ?? existing.title;
  const nextTags = input.oop_tags ?? parseOopTagsValue(existing.oopTags);
  const projectExercise = isProjectExercise(nextTitle, nextTags);
  const descriptionMaxLength = projectExercise
    ? PROJECT_DESCRIPTION_MAX_LENGTH
    : REGULAR_DESCRIPTION_MAX_LENGTH;

  // Validate description length if provided
  if (input.description !== undefined && input.description.length > descriptionMaxLength) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: `Description must be at most ${descriptionMaxLength} characters.`,
      },
    };
  }

  // Validate OOP tags if provided
  if (input.oop_tags !== undefined) {
    if (input.oop_tags.length < 1 || input.oop_tags.length > 5) {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "Must provide between 1 and 5 OOP tags.",
        },
      };
    }
  }

  if (input.test_cases !== undefined) {
    if (input.test_cases.length > 50 || (!projectExercise && input.test_cases.length < 1)) {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: projectExercise
            ? "Must provide at most 50 test cases."
            : "Must provide between 1 and 50 test cases.",
        },
      };
    }
  }

  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.difficulty !== undefined) updateData.difficulty = input.difficulty;
  if (input.oop_tags !== undefined) updateData.oopTags = JSON.stringify(input.oop_tags);
  if (input.starter_code !== undefined) updateData.starterCode = input.starter_code;
  if (input.is_library !== undefined) updateData.isLibrary = input.is_library ? 1 : 0;
  if (input.style_check_enabled !== undefined) updateData.styleCheckEnabled = input.style_check_enabled ? 1 : 0;
  if (input.style_policy !== undefined) updateData.stylePolicy = serializeExerciseStylePolicy(input.style_policy);
  updateData.updatedAt = new Date().toISOString();

  if (Object.keys(updateData).length === 1 && input.test_cases === undefined) {
    // Only updatedAt was set, nothing to actually update
    return existing;
  }

  const [updated] = await database
    .update(exercises)
    .set(updateData)
    .where(eq(exercises.id, id))
    .returning();

  if (input.test_cases !== undefined) {
    await replaceTestCases(id, input.test_cases, database);
  }

  return {
    ...updated,
    testCases:
      input.test_cases === undefined
        ? undefined
        : input.test_cases.map((tc) => ({
            inputData: tc.input_data,
            expectedOutput: tc.expected_output,
            isVisible: tc.is_visible ? 1 : 0,
            pointValue: tc.point_value ?? 1,
            timeLimitSeconds: tc.time_limit_seconds ?? null,
          })),
  };
}

/**
 * Delete an exercise by ID.
 */
export async function deleteExercise(
  id: string,
  userId: string,
  role: string,
  database = defaultDb
) {
  await ensureExerciseStyleColumns(database);

  const existing = await database.query.exercises.findFirst({
    where: eq(exercises.id, id),
  });

  if (!existing) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Exercise not found.",
      },
    };
  }

  // Only the creator or admin can delete
  if (role !== "admin" && existing.createdBy !== userId) {
    return {
      error: {
        code: "FORBIDDEN",
        message: "You do not have permission to delete this exercise.",
      },
    };
  }

  // Delete associated submission results first
  const existingTestCases = await database.query.testCases.findMany({
    where: eq(testCases.exerciseId, id),
  });
  const tcIds = existingTestCases.map((tc) => tc.id);
  if (tcIds.length > 0) {
    await database
      .delete(submissionResults)
      .where(inArray(submissionResults.testCaseId, tcIds));
  }

  // Delete associated submissions
  await database.delete(submissions).where(eq(submissions.exerciseId, id));

  // Delete associated test cases
  await database.delete(testCases).where(eq(testCases.exerciseId, id));
  // Delete associated assignments
  await database.delete(exerciseAssignments).where(eq(exerciseAssignments.exerciseId, id));
  // Delete the exercise
  await database.delete(exercises).where(eq(exercises.id, id));

  return { success: true };
}

/**
 * Browse the exercise library (exercises marked as isLibrary = 1).
 */
export async function browseLibrary(database = defaultDb) {
  await ensureExerciseStyleColumns(database);

  return database.query.exercises.findMany({
    where: eq(exercises.isLibrary, 1),
    with: {
      creator: {
        columns: {
          id: true,
          username: true,
        },
      },
      testCases: true,
    },
  });
}

/**
 * Assign an exercise to a class section.
 */
export async function assignToSection(
  exerciseId: string,
  input: AssignExerciseInput,
  database = defaultDb
) {
  await ensureExerciseStyleColumns(database);

  // Verify exercise exists
  const exercise = await database.query.exercises.findFirst({
    where: eq(exercises.id, exerciseId),
  });

  if (!exercise) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Exercise not found.",
      },
    };
  }

  // Verify section exists
  const section = await database.query.classSections.findFirst({
    where: eq(classSections.id, input.section_id),
  });

  if (!section) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Class section not found.",
      },
    };
  }

  // Check if already assigned to this section
  const existingAssignment = await database.query.exerciseAssignments.findFirst({
    where: and(
      eq(exerciseAssignments.exerciseId, exerciseId),
      eq(exerciseAssignments.sectionId, input.section_id)
    ),
  });

  if (existingAssignment) {
    return {
      error: {
        code: "ALREADY_ASSIGNED",
        message: "Exercise is already assigned to this section.",
      },
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const [assignment] = await database
    .insert(exerciseAssignments)
    .values({
      id,
      exerciseId,
      sectionId: input.section_id,
      deadline: input.deadline || null,
      isAssessment: input.is_assessment ? 1 : 0,
      isVisible: 0,
      allowSubmission: 1,
      assignedAt: now,
    })
    .returning();

  return assignment;
}

/**
 * Type guard to check if a service result is an error.
 */
export function isExerciseError(
  value: unknown
): value is ExerciseError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as any).error?.code === "string"
  );
}
