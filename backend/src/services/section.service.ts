import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  classSections,
  users,
  sectionEnrollments,
  exerciseAssignments,
  submissions,
  submissionResults,
  anticheatEvents,
} from "../db/schema.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateSectionInput {
  name: string;
  semester: string;
  instructor_id?: string | null;
}

export interface UpdateSectionInput {
  name?: string;
  semester?: string;
  instructor_id?: string | null;
}

export interface AssignInstructorInput {
  instructor_id: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * List all class sections.
 */
export async function listSections(database = defaultDb) {
  const sections = await database.query.classSections.findMany({
    with: {
      instructor: true,
    },
  });
  return sections;
}

/**
 * Create a new class section.
 */
export async function createSection(
  input: CreateSectionInput,
  database = defaultDb
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // If instructor_id is provided, verify it belongs to an instructor or admin
  if (input.instructor_id) {
    const instructor = await database.query.users.findFirst({
      where: eq(users.id, input.instructor_id),
    });
    if (!instructor || (instructor.role !== "instructor" && instructor.role !== "admin")) {
      return {
        error: {
          code: "INVALID_INSTRUCTOR",
          message: "The specified instructor_id does not belong to a valid instructor.",
        },
      };
    }
  }

  const [section] = await database
    .insert(classSections)
    .values({
      id,
      name: input.name,
      semester: input.semester,
      instructorId: input.instructor_id || null,
      createdAt: now,
    })
    .returning();

  return section;
}

/**
 * Update an existing class section.
 */
export async function updateSection(
  id: string,
  input: UpdateSectionInput,
  database = defaultDb
) {
  // Verify section exists
  const existing = await database.query.classSections.findFirst({
    where: eq(classSections.id, id),
  });

  if (!existing) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Class section not found.",
      },
    };
  }

  // If instructor_id is provided, verify it belongs to an instructor or admin
  if (input.instructor_id) {
    const instructor = await database.query.users.findFirst({
      where: eq(users.id, input.instructor_id),
    });
    if (!instructor || (instructor.role !== "instructor" && instructor.role !== "admin")) {
      return {
        error: {
          code: "INVALID_INSTRUCTOR",
          message: "The specified instructor_id does not belong to a valid instructor.",
        },
      };
    }
  }

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.semester !== undefined) updateData.semester = input.semester;
  if (input.instructor_id !== undefined) updateData.instructorId = input.instructor_id;

  if (Object.keys(updateData).length === 0) {
    return existing;
  }

  const [updated] = await database
    .update(classSections)
    .set(updateData)
    .where(eq(classSections.id, id))
    .returning();

  return updated;
}

/**
 * Delete a class section by ID.
 */
export async function deleteSection(id: string, database = defaultDb) {
  const existing = await database.query.classSections.findFirst({
    where: eq(classSections.id, id),
  });

  if (!existing) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Class section not found.",
      },
    };
  }

  // Delete dependent records first to satisfy foreign key constraints.
  // Order: submission_results & anticheat_events → submissions → enrollments → assignments → section

  // Find all submissions in this section
  const sectionSubmissions = await database
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.sectionId, id));
  const submissionIds = sectionSubmissions.map((s: { id: string }) => s.id);

  if (submissionIds.length > 0) {
    await database
      .delete(submissionResults)
      .where(inArray(submissionResults.submissionId, submissionIds));
    await database
      .delete(anticheatEvents)
      .where(inArray(anticheatEvents.submissionId, submissionIds));
    await database.delete(submissions).where(eq(submissions.sectionId, id));
  }

  // Delete enrollments and exercise assignments for this section
  await database.delete(sectionEnrollments).where(eq(sectionEnrollments.sectionId, id));
  await database.delete(exerciseAssignments).where(eq(exerciseAssignments.sectionId, id));

  // Finally delete the section
  await database.delete(classSections).where(eq(classSections.id, id));

  return { success: true };
}

/**
 * Assign an instructor to a class section.
 */
export async function assignInstructor(
  sectionId: string,
  input: AssignInstructorInput,
  database = defaultDb
) {
  // Verify section exists
  const existing = await database.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });

  if (!existing) {
    return {
      error: {
        code: "NOT_FOUND",
        message: "Class section not found.",
      },
    };
  }

  // Verify instructor exists and has correct role
  const instructor = await database.query.users.findFirst({
    where: eq(users.id, input.instructor_id),
  });

  if (!instructor || (instructor.role !== "instructor" && instructor.role !== "admin")) {
    return {
      error: {
        code: "INVALID_INSTRUCTOR",
        message: "The specified instructor_id does not belong to a valid instructor.",
      },
    };
  }

  const [updated] = await database
    .update(classSections)
    .set({ instructorId: input.instructor_id })
    .where(eq(classSections.id, sectionId))
    .returning();

  return updated;
}

/**
 * Type guard to check if a service result is an error.
 */
export function isSectionError(
  value: unknown
): value is { error: { code: string; message: string } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as any).error?.code === "string"
  );
}
