import crypto from "node:crypto";
import { eq, inArray, and } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  classSections,
  sectionInstructors,
  users,
  sectionEnrollments,
  exerciseAssignments,
  exercises,
  submissions,
  submissionResults,
  anticheatEvents,
} from "../db/schema.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateSectionInput {
  name: string;
  semester: string;
  instructor_id?: string | null;
  instructor_ids?: string[];
}

export interface UpdateSectionInput {
  name?: string;
  semester?: string;
  instructor_id?: string | null;
  instructor_ids?: string[];
}

export interface AssignInstructorInput {
  instructor_id: string;
  instructor_ids?: string[];
}

export interface SectionInstructorSummary {
  id: string;
  username: string;
  fullName: string | null;
  email: string;
  isPrimary: boolean;
}

type Database = typeof defaultDb;

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * List all class sections.
 */
export async function listSections(database = defaultDb) {
  await ensureSectionInstructorsReady(database);
  const sections = await database.query.classSections.findMany({
    with: {
      instructor: true,
    },
  });
  return attachInstructorLists(sections, database);
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
  await ensureSectionInstructorsReady(database);

  const instructorIds = normalizeInstructorIds(input.instructor_ids, input.instructor_id);
  const validationError = await validateInstructorIds(instructorIds, database);
  if (validationError) {
    return validationError;
  }

  const [section] = await database
    .insert(classSections)
    .values({
      id,
      name: input.name,
      semester: input.semester,
      instructorId: instructorIds[0] || null,
      createdAt: now,
    })
    .returning();

  await replaceSectionInstructors(id, instructorIds, database);
  return attachInstructorList(section, database);
}

/**
 * Update an existing class section.
 */
export async function updateSection(
  id: string,
  input: UpdateSectionInput,
  database = defaultDb
) {
  await ensureSectionInstructorsReady(database);
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

  const shouldUpdateInstructors =
    input.instructor_ids !== undefined || input.instructor_id !== undefined;
  const instructorIds = shouldUpdateInstructors
    ? normalizeInstructorIds(input.instructor_ids, input.instructor_id)
    : undefined;

  if (instructorIds) {
    const validationError = await validateInstructorIds(instructorIds, database);
    if (validationError) {
      return validationError;
    }
  }

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.semester !== undefined) updateData.semester = input.semester;
  if (instructorIds) updateData.instructorId = instructorIds[0] || null;

  if (Object.keys(updateData).length === 0) {
    if (instructorIds) {
      await replaceSectionInstructors(id, instructorIds, database);
      return attachInstructorList(existing, database);
    }
    return attachInstructorList(existing, database);
  }

  const [updated] = await database
    .update(classSections)
    .set(updateData)
    .where(eq(classSections.id, id))
    .returning();

  if (instructorIds) {
    await replaceSectionInstructors(id, instructorIds, database);
  }

  return attachInstructorList(updated, database);
}

/**
 * Delete a class section by ID.
 */
export async function deleteSection(id: string, database = defaultDb) {
  await ensureSectionInstructorsReady(database);
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
  await database.delete(sectionInstructors).where(eq(sectionInstructors.sectionId, id));
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
  await ensureSectionInstructorsReady(database);
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

  const instructorIds = normalizeInstructorIds(input.instructor_ids, input.instructor_id);
  const validationError = await validateInstructorIds(instructorIds, database);
  if (validationError) {
    return validationError;
  }

  const [updated] = await database
    .update(classSections)
    .set({ instructorId: instructorIds[0] })
    .where(eq(classSections.id, sectionId))
    .returning();

  await replaceSectionInstructors(sectionId, instructorIds, database);
  return attachInstructorList(updated, database);
}

/**
 * Get full detail of a class section: info, enrolled students, assigned exercises.
 */
export async function getSectionDetail(id: string, database = defaultDb) {
  await ensureSectionInstructorsReady(database);
  const section = await database.query.classSections.findFirst({
    where: eq(classSections.id, id),
    with: { instructor: true },
  });

  if (!section) {
    return { error: { code: "NOT_FOUND", message: "Class section not found." } };
  }

  // Enrolled students (join users)
  const enrollments = await database
    .select({
      enrollmentId: sectionEnrollments.id,
      studentExternalId: sectionEnrollments.studentExternalId,
      enrolledAt: sectionEnrollments.enrolledAt,
      userId: users.id,
      username: users.username,
      email: users.email,
      fullName: users.fullName,
    })
    .from(sectionEnrollments)
    .innerJoin(users, eq(sectionEnrollments.studentId, users.id))
    .where(eq(sectionEnrollments.sectionId, id));

  // Assigned exercises (join exercises)
  const assignments = await database
    .select({
      assignmentId: exerciseAssignments.id,
      exerciseId: exerciseAssignments.exerciseId,
      deadline: exerciseAssignments.deadline,
      isAssessment: exerciseAssignments.isAssessment,
      isVisible: exerciseAssignments.isVisible,
      allowSubmission: exerciseAssignments.allowSubmission,
      maxSubmissions: exerciseAssignments.maxSubmissions,
      week: exerciseAssignments.week,
      assignedAt: exerciseAssignments.assignedAt,
      title: exercises.title,
      difficulty: exercises.difficulty,
    })
    .from(exerciseAssignments)
    .innerJoin(exercises, eq(exerciseAssignments.exerciseId, exercises.id))
    .where(eq(exerciseAssignments.sectionId, id));

  return {
    section: {
      id: section.id,
      name: section.name,
      semester: section.semester,
      instructorId: section.instructorId,
      instructor: section.instructor
        ? {
            id: section.instructor.id,
            username: section.instructor.username,
            fullName: section.instructor.fullName ?? null,
            email: section.instructor.email,
          }
        : null,
      instructors: await getSectionInstructors(id, database),
      createdAt: section.createdAt,
    },
    students: enrollments.map((e: any) => ({
      enrollmentId: e.enrollmentId,
      userId: e.userId,
      studentId: e.studentExternalId || e.username,
      username: e.username,
      fullName: e.fullName ?? null,
      email: e.email,
      enrolledAt: e.enrolledAt,
    })),
    exercises: assignments.map((a: any) => ({
      assignmentId: a.assignmentId,
      exerciseId: a.exerciseId,
      title: a.title,
      difficulty: a.difficulty,
      deadline: a.deadline,
      isAssessment: Boolean(a.isAssessment),
      isVisible: Boolean(a.isVisible),
      allowSubmission: Boolean(a.allowSubmission),
      maxSubmissions: a.maxSubmissions ?? null,
      week: a.week ?? null,
      assignedAt: a.assignedAt,
    })),
    studentCount: enrollments.length,
    exerciseCount: assignments.length,
  };
}

export async function userCanAccessSection(
  sectionId: string,
  userId: string,
  role: string,
  database = defaultDb
) {
  if (role === "admin") return true;
  await ensureSectionInstructorsReady(database);
  const section = await database.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (!section) return false;
  if (section.instructorId === userId) return true;

  const membership = await database.query.sectionInstructors.findFirst({
    where: and(
      eq(sectionInstructors.sectionId, sectionId),
      eq(sectionInstructors.instructorId, userId)
    ),
  });
  return Boolean(membership);
}

export async function listSectionsForInstructor(
  userId: string,
  role: string,
  database = defaultDb
) {
  await ensureSectionInstructorsReady(database);
  if (role === "admin") return listSections(database);

  const memberships = await database
    .select({ sectionId: sectionInstructors.sectionId })
    .from(sectionInstructors)
    .where(eq(sectionInstructors.instructorId, userId));
  const sectionIds = [...new Set(memberships.map((membership: { sectionId: string }) => membership.sectionId))];

  if (sectionIds.length === 0) return [];
  const sections = await database.query.classSections.findMany({
    where: inArray(classSections.id, sectionIds),
    with: { instructor: true },
  });
  return attachInstructorLists(sections, database);
}

/**
 * Remove a student enrollment from a section (does NOT delete the user account).
 */
export async function removeStudentFromSection(
  sectionId: string,
  studentUserId: string,
  database = defaultDb
) {
  const enrollment = await database
    .select({ id: sectionEnrollments.id })
    .from(sectionEnrollments)
    .where(
      and(
        eq(sectionEnrollments.sectionId, sectionId),
        eq(sectionEnrollments.studentId, studentUserId)
      )
    );

  if (enrollment.length === 0) {
    return { error: { code: "NOT_FOUND", message: "Student is not enrolled in this section." } };
  }

  await database
    .delete(sectionEnrollments)
    .where(
      and(
        eq(sectionEnrollments.sectionId, sectionId),
        eq(sectionEnrollments.studentId, studentUserId)
      )
    );

  return { success: true };
}

/**
 * Unassign an exercise from a section.
 */
export async function unassignExercise(
  sectionId: string,
  exerciseId: string,
  database = defaultDb
) {
  await database
    .delete(exerciseAssignments)
    .where(
      and(
        eq(exerciseAssignments.sectionId, sectionId),
        eq(exerciseAssignments.exerciseId, exerciseId)
      )
    );
  return { success: true };
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

function normalizeInstructorIds(instructorIds?: string[], primaryInstructorId?: string | null) {
  const ids = [
    ...(primaryInstructorId ? [primaryInstructorId] : []),
    ...(Array.isArray(instructorIds) ? instructorIds : []),
  ];
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))];
}

async function validateInstructorIds(instructorIds: string[], database: Database = defaultDb) {
  if (instructorIds.length === 0) return null;

  const instructorRows = await database.query.users.findMany({
    where: inArray(users.id, instructorIds),
  });
  const validIds = new Set(
    instructorRows
      .filter((user: typeof users.$inferSelect) => user.role === "instructor" || user.role === "admin")
      .map((user: typeof users.$inferSelect) => user.id)
  );

  if (instructorIds.some((id) => !validIds.has(id))) {
    return {
      error: {
        code: "INVALID_INSTRUCTOR",
        message: "One or more instructor_ids do not belong to valid instructors.",
      },
    };
  }

  return null;
}

async function ensureSectionInstructorsReady(database: Database = defaultDb) {
  const sqlite = (database as any).session?.client;
  if (!sqlite) return;

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS section_instructors (
      id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL REFERENCES class_sections(id),
      instructor_id TEXT NOT NULL REFERENCES users(id),
      is_primary INTEGER NOT NULL DEFAULT 0,
      assigned_at TEXT NOT NULL
    );
  `;
  const createIndexSql = `
    CREATE UNIQUE INDEX IF NOT EXISTS section_instructors_section_instructor_unique
      ON section_instructors(section_id, instructor_id);
  `;

  try {
    if (typeof sqlite.exec === "function") {
      sqlite.exec(createTableSql + "\n" + createIndexSql);
    } else if (typeof sqlite.executeMultiple === "function") {
      await sqlite.executeMultiple(createTableSql + "\n" + createIndexSql);
    } else if (typeof sqlite.execute === "function") {
      await sqlite.execute(createTableSql);
      await sqlite.execute(createIndexSql);
    }
  } catch (err) {
    console.error("ensureSectionInstructorsReady table creation error:", err);
  }

  const legacyRows = await database
    .select({
      sectionId: classSections.id,
      instructorId: classSections.instructorId,
    })
    .from(classSections);

  const now = new Date().toISOString();
  for (const row of legacyRows as Array<{ sectionId: string; instructorId: string | null }>) {
    if (!row.instructorId) continue;
    await database
      .insert(sectionInstructors)
      .values({
        id: crypto.randomUUID(),
        sectionId: row.sectionId,
        instructorId: row.instructorId,
        isPrimary: 1,
        assignedAt: now,
      })
      .onConflictDoNothing();
  }
}

async function replaceSectionInstructors(
  sectionId: string,
  instructorIds: string[],
  database: Database = defaultDb
) {
  await ensureSectionInstructorsReady(database);
  await database.delete(sectionInstructors).where(eq(sectionInstructors.sectionId, sectionId));

  const now = new Date().toISOString();
  for (const [index, instructorId] of instructorIds.entries()) {
    await database.insert(sectionInstructors).values({
      id: crypto.randomUUID(),
      sectionId,
      instructorId,
      isPrimary: index === 0 ? 1 : 0,
      assignedAt: now,
    });
  }
}

async function getSectionInstructors(
  sectionId: string,
  database: Database = defaultDb
): Promise<SectionInstructorSummary[]> {
  await ensureSectionInstructorsReady(database);
  const rows = await database
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      email: users.email,
      isPrimary: sectionInstructors.isPrimary,
    })
    .from(sectionInstructors)
    .innerJoin(users, eq(sectionInstructors.instructorId, users.id))
    .where(eq(sectionInstructors.sectionId, sectionId));

  return rows.map((row: any) => ({
    id: row.id,
    username: row.username,
    fullName: row.fullName ?? null,
    email: row.email,
    isPrimary: Boolean(row.isPrimary),
  }));
}

async function attachInstructorList<T extends { id: string; instructorId?: string | null; instructor?: any }>(
  section: T,
  database: Database = defaultDb
) {
  const instructors = await getSectionInstructors(section.id, database);
  return {
    ...section,
    instructors,
    instructor: section.instructor ?? instructors.find((instructor) => instructor.isPrimary) ?? null,
  };
}

async function attachInstructorLists<T extends { id: string; instructorId?: string | null; instructor?: any }>(
  sections: T[],
  database: Database = defaultDb
) {
  return Promise.all(sections.map((section) => attachInstructorList(section, database)));
}
