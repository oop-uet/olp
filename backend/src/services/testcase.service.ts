import crypto from "node:crypto";
import { eq, count } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import { testCases, exercises, submissionResults } from "../db/schema.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_INPUT_DATA_SIZE = 10240; // 10KB in bytes/chars
const MAX_EXPECTED_OUTPUT_SIZE = 65536; // 64KB in bytes/chars, enough for JUnit test files
const MAX_TEST_CASES_PER_EXERCISE = 50;
const MIN_POINT_VALUE = 1;
const MAX_POINT_VALUE = 100;

// ─── Database type ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateTestCaseInput {
  input_data: string;
  expected_output: string;
  is_visible?: boolean;
  point_value: number;
  time_limit_seconds?: number;
}

export interface UpdateTestCaseInput {
  input_data?: string;
  expected_output?: string;
  is_visible?: boolean;
  point_value?: number;
  time_limit_seconds?: number | null;
}

export interface TestCaseError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * List all test cases for an exercise.
 */
export async function listTestCases(exerciseId: string, database: Database = defaultDb) {
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

  const cases = await database.query.testCases.findMany({
    where: eq(testCases.exerciseId, exerciseId),
  });

  return cases;
}

/**
 * Create a new test case for an exercise.
 * Validates max 50 test cases per exercise.
 * Does NOT affect existing submissions.
 */
export async function createTestCase(
  exerciseId: string,
  input: CreateTestCaseInput,
  database: Database = defaultDb
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

  // Check max test cases per exercise
  const [countResult] = await database
    .select({ count: count() })
    .from(testCases)
    .where(eq(testCases.exerciseId, exerciseId));

  if (countResult.count >= MAX_TEST_CASES_PER_EXERCISE) {
    return {
      error: {
        code: "LIMIT_EXCEEDED",
        message: `Maximum of ${MAX_TEST_CASES_PER_EXERCISE} test cases per exercise reached.`,
      },
    };
  }

  // Validate input_data size
  if (input.input_data.length > MAX_INPUT_DATA_SIZE) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Input data exceeds maximum size.",
        details: [{ field: "input_data", message: `Must be at most ${MAX_INPUT_DATA_SIZE} characters (10KB).` }],
      },
    };
  }

  // Validate expected_output size
  if (input.expected_output.length > MAX_EXPECTED_OUTPUT_SIZE) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Expected output exceeds maximum size.",
        details: [{ field: "expected_output", message: `Must be at most ${MAX_EXPECTED_OUTPUT_SIZE} characters (64KB).` }],
      },
    };
  }

  // Validate point_value range
  if (input.point_value < MIN_POINT_VALUE || input.point_value > MAX_POINT_VALUE) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Point value out of valid range.",
        details: [{ field: "point_value", message: `Must be between ${MIN_POINT_VALUE} and ${MAX_POINT_VALUE}.` }],
      },
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const [testCase] = await database
    .insert(testCases)
    .values({
      id,
      exerciseId,
      inputData: input.input_data,
      expectedOutput: input.expected_output,
      isVisible: input.is_visible ? 1 : 0,
      pointValue: input.point_value,
      timeLimitSeconds: input.time_limit_seconds ?? null,
      createdAt: now,
    })
    .returning();

  return testCase;
}

/**
 * Update an existing test case.
 * IMPORTANT: Does NOT retroactively change existing submission scores.
 * Only future submissions will be evaluated against the updated test case.
 */
export async function updateTestCase(
  id: string,
  input: UpdateTestCaseInput,
  database: Database = defaultDb
) {
  // Verify test case exists
  const existing = await database.query.testCases.findFirst({
    where: eq(testCases.id, id),
  });

  if (!existing) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Test case not found.",
      },
    };
  }

  // Validate input_data size if provided
  if (input.input_data !== undefined && input.input_data.length > MAX_INPUT_DATA_SIZE) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Input data exceeds maximum size.",
        details: [{ field: "input_data", message: `Must be at most ${MAX_INPUT_DATA_SIZE} characters (10KB).` }],
      },
    };
  }

  // Validate expected_output size if provided
  if (input.expected_output !== undefined && input.expected_output.length > MAX_EXPECTED_OUTPUT_SIZE) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Expected output exceeds maximum size.",
        details: [{ field: "expected_output", message: `Must be at most ${MAX_EXPECTED_OUTPUT_SIZE} characters (64KB).` }],
      },
    };
  }

  // Validate point_value range if provided
  if (input.point_value !== undefined && (input.point_value < MIN_POINT_VALUE || input.point_value > MAX_POINT_VALUE)) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Point value out of valid range.",
        details: [{ field: "point_value", message: `Must be between ${MIN_POINT_VALUE} and ${MAX_POINT_VALUE}.` }],
      },
    };
  }

  // Build update data — only update the test case fields
  // NOTE: We deliberately do NOT modify submission_results or submission scores.
  // Existing submissions retain their original scores. Only future submissions
  // will be evaluated against the updated test case.
  const updateData: Record<string, unknown> = {};
  if (input.input_data !== undefined) updateData.inputData = input.input_data;
  if (input.expected_output !== undefined) updateData.expectedOutput = input.expected_output;
  if (input.is_visible !== undefined) updateData.isVisible = input.is_visible ? 1 : 0;
  if (input.point_value !== undefined) updateData.pointValue = input.point_value;
  if (input.time_limit_seconds !== undefined) updateData.timeLimitSeconds = input.time_limit_seconds;

  if (Object.keys(updateData).length === 0) {
    return existing;
  }

  await database.delete(submissionResults).where(eq(submissionResults.testCaseId, id));

  const [updated] = await database
    .update(testCases)
    .set(updateData)
    .where(eq(testCases.id, id))
    .returning();

  return updated;
}

/**
 * Delete a test case by ID.
 * NOTE: Existing submission_results referencing this test case remain unchanged.
 */
export async function deleteTestCase(id: string, database: Database = defaultDb) {
  const existing = await database.query.testCases.findFirst({
    where: eq(testCases.id, id),
  });

  if (!existing) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Test case not found.",
      },
    };
  }

  await database.delete(submissionResults).where(eq(submissionResults.testCaseId, id));
  await database.delete(testCases).where(eq(testCases.id, id));

  return { success: true };
}

/**
 * Type guard to check if a service result is an error.
 */
export function isTestCaseError(
  value: unknown
): value is TestCaseError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as any).error?.code === "string"
  );
}
