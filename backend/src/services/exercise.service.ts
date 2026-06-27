import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  exercises,
  exerciseAssignments,
  testCases,
  classSections,
} from "../db/schema.js";

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
  test_cases: TestCaseInput[];
}

export interface UpdateExerciseInput {
  title?: string;
  description?: string;
  difficulty?: "easy" | "medium" | "hard";
  oop_tags?: string[];
  starter_code?: string;
  is_library?: boolean;
}

export interface AssignExerciseInput {
  section_id: string;
  deadline?: string;
  is_assessment?: boolean;
}

export interface ExerciseError {
  error: { code: string; message: string };
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
  if (role === "admin") {
    return database.query.exercises.findMany({
      with: { testCases: true },
    });
  }

  // Instructors see only their own exercises
  return database.query.exercises.findMany({
    where: eq(exercises.createdBy, userId),
    with: { testCases: true },
  });
}

/**
 * Get a single exercise by ID.
 */
export async function getExerciseById(id: string, database = defaultDb) {
  const exercise = await database.query.exercises.findFirst({
    where: eq(exercises.id, id),
    with: { testCases: true },
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
 * Create a new exercise with associated test cases.
 */
export async function createExercise(
  input: CreateExerciseInput,
  createdBy: string,
  database = defaultDb
) {
  // Validate title length
  if (input.title.length > 200) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Title must be at most 200 characters.",
      },
    };
  }

  // Validate description length
  if (input.description.length > 5000) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Description must be at most 5000 characters.",
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

  // Validate at least 1 test case
  if (!input.test_cases || input.test_cases.length < 1) {
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
      createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Insert test cases
  const testCaseValues = input.test_cases.map((tc) => ({
    id: crypto.randomUUID(),
    exerciseId,
    inputData: tc.input_data,
    expectedOutput: tc.expected_output,
    isVisible: tc.is_visible ? 1 : 0,
    pointValue: tc.point_value ?? 1,
    timeLimitSeconds: tc.time_limit_seconds ?? null,
    createdAt: now,
  }));

  await database.insert(testCases).values(testCaseValues);

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

  // Only the creator or admin can update
  if (role !== "admin" && existing.createdBy !== userId) {
    return {
      error: {
        code: "FORBIDDEN",
        message: "You do not have permission to update this exercise.",
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

  // Validate description length if provided
  if (input.description !== undefined && input.description.length > 5000) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Description must be at most 5000 characters.",
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

  const updateData: Record<string, unknown> = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.difficulty !== undefined) updateData.difficulty = input.difficulty;
  if (input.oop_tags !== undefined) updateData.oopTags = JSON.stringify(input.oop_tags);
  if (input.starter_code !== undefined) updateData.starterCode = input.starter_code;
  if (input.is_library !== undefined) updateData.isLibrary = input.is_library ? 1 : 0;
  updateData.updatedAt = new Date().toISOString();

  if (Object.keys(updateData).length === 1) {
    // Only updatedAt was set, nothing to actually update
    return existing;
  }

  const [updated] = await database
    .update(exercises)
    .set(updateData)
    .where(eq(exercises.id, id))
    .returning();

  return updated;
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

  // Delete associated test cases first
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
  return database.query.exercises.findMany({
    where: eq(exercises.isLibrary, 1),
    with: { testCases: true },
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
