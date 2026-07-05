import crypto from "node:crypto";
import { eq, and, or } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  classSections,
  exercises,
  exerciseAssignments,
  sectionWeeks,
} from "../db/schema.js";

// Default number of weeks in a course schedule. Instructors can extend this
// when a section needs extra make-up/project weeks.
export const TOTAL_WEEKS = 15;
const MAX_SCHEDULE_WEEK = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

export interface ScheduleError {
  error: { code: string; message: string };
}

export function isScheduleError(value: unknown): value is ScheduleError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as any).error?.code === "string"
  );
}

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
 * Verify a section exists and that the requester (instructor) owns it.
 * Admins bypass the ownership check.
 */
async function loadSectionForUser(
  sectionId: string,
  userId: string,
  role: string,
  database: Database
): Promise<{ section: any } | ScheduleError> {
  const section = await database.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });
  if (!section) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy lớp." } };
  }
  if (role !== "admin" && section.instructorId !== userId) {
    return { error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } };
  }
  return { section };
}

export interface ScheduleExercise {
  assignmentId: string;
  exerciseId: string;
  title: string;
  difficulty: string;
  oopTags: string[];
  isAssessment: boolean;
  week: number | null;
  deadline: string | null;
}

export interface ScheduleWeek {
  week: number;
  deadline: string | null;
  exercises: ScheduleExercise[];
}

export interface SectionSchedule {
  section: { id: string; name: string; semester: string };
  weeks: ScheduleWeek[];
  unscheduled: ScheduleExercise[];
  pool: Array<{
    id: string;
    title: string;
    difficulty: string;
    oopTags: string[];
  }>;
}

/**
 * Build the 15-week schedule view for a section: assigned exercises grouped by
 * week, per-week deadlines, plus the exercise library/system pool.
 */
export async function getSectionSchedule(
  sectionId: string,
  userId: string,
  role: string,
  database: Database = defaultDb
): Promise<SectionSchedule | ScheduleError> {
  const loaded = await loadSectionForUser(sectionId, userId, role, database);
  if (isScheduleError(loaded)) return loaded;
  const section = loaded.section;

  // Assigned exercises for this section.
  const assignments = await database
    .select({
      assignmentId: exerciseAssignments.id,
      exerciseId: exerciseAssignments.exerciseId,
      deadline: exerciseAssignments.deadline,
      isAssessment: exerciseAssignments.isAssessment,
      week: exerciseAssignments.week,
      title: exercises.title,
      difficulty: exercises.difficulty,
      oopTags: exercises.oopTags,
    })
    .from(exerciseAssignments)
    .innerJoin(exercises, eq(exerciseAssignments.exerciseId, exercises.id))
    .where(eq(exerciseAssignments.sectionId, sectionId));

  // Per-week deadlines.
  const weekRows = await database
    .select()
    .from(sectionWeeks)
    .where(eq(sectionWeeks.sectionId, sectionId));
  const deadlineByWeek = new Map<number, string | null>();
  for (const w of weekRows as any[]) deadlineByWeek.set(w.week, w.deadline ?? null);

  const toScheduleExercise = (a: any): ScheduleExercise => ({
    assignmentId: a.assignmentId,
    exerciseId: a.exerciseId,
    title: a.title,
    difficulty: a.difficulty,
    oopTags: parseOopTags(a.oopTags),
    isAssessment: Boolean(a.isAssessment),
    week: a.week ?? null,
    deadline: a.deadline ?? null,
  });

  const assignedExerciseIds = new Set<string>(
    (assignments as any[]).map((a) => String(a.exerciseId))
  );

  const maxConfiguredWeek = Math.max(
    TOTAL_WEEKS,
    ...((assignments as any[]).map((a) => Number(a.week) || 0)),
    ...((weekRows as any[]).map((w) => Number(w.week) || 0))
  );

  // Build weeks 1..maxConfiguredWeek.
  const weeks: ScheduleWeek[] = [];
  for (let i = 1; i <= maxConfiguredWeek; i++) {
    weeks.push({
      week: i,
      deadline: deadlineByWeek.get(i) ?? null,
      exercises: assignments
        .filter((a: any) => a.week === i)
        .map(toScheduleExercise),
    });
  }

  const unscheduled = assignments
    .filter((a: any) => !a.week || a.week < 1)
    .map(toScheduleExercise);

  // Pool: all unassigned system-library exercises plus the instructor's own
  // unassigned exercises. Assigned items live only in the week list.
  const poolSource =
    role === "admin"
      ? await database.query.exercises.findMany()
      : await database.query.exercises.findMany({
          where: or(eq(exercises.isLibrary, 1), eq(exercises.createdBy, userId)),
        });

  const pool = poolSource
    .filter((e: any) => !assignedExerciseIds.has(String(e.id)))
    .map((e: any) => ({
      id: e.id,
      title: e.title,
      difficulty: e.difficulty,
      oopTags: parseOopTags(e.oopTags),
    }));

  return {
    section: { id: section.id, name: section.name, semester: section.semester },
    weeks,
    unscheduled,
    pool,
  };
}

/**
 * Assign an exercise to a specific week of a section (or move it there if it is
 * already assigned). The assignment's deadline is synced to the week's deadline.
 */
export async function assignExerciseToWeek(
  sectionId: string,
  exerciseId: string,
  week: number,
  userId: string,
  role: string,
  database: Database = defaultDb
): Promise<{ success: true } | ScheduleError> {
  const loaded = await loadSectionForUser(sectionId, userId, role, database);
  if (isScheduleError(loaded)) return loaded;

  if (!isValidScheduleWeek(week)) {
    return { error: { code: "VALIDATION_ERROR", message: "Tuần không hợp lệ." } };
  }

  const exercise = await database.query.exercises.findFirst({
    where: eq(exercises.id, exerciseId),
  });
  if (!exercise) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy bài tập." } };
  }

  // Deadline to apply, taken from the week's configured deadline (if any).
  const weekRow = await database.query.sectionWeeks.findFirst({
    where: and(eq(sectionWeeks.sectionId, sectionId), eq(sectionWeeks.week, week)),
  });
  const weekDeadline = weekRow?.deadline ?? null;

  const existing = await database.query.exerciseAssignments.findFirst({
    where: and(
      eq(exerciseAssignments.exerciseId, exerciseId),
      eq(exerciseAssignments.sectionId, sectionId)
    ),
  });

  if (existing) {
    await database
      .update(exerciseAssignments)
      .set({ week, deadline: weekDeadline })
      .where(eq(exerciseAssignments.id, existing.id));
  } else {
    await database.insert(exerciseAssignments).values({
      id: crypto.randomUUID(),
      exerciseId,
      sectionId,
      deadline: weekDeadline,
      isAssessment: 0,
      week,
      assignedAt: new Date().toISOString(),
    });
  }

  return { success: true };
}

/**
 * Remove an exercise assignment from a section.
 */
export async function removeAssignment(
  sectionId: string,
  exerciseId: string,
  userId: string,
  role: string,
  database: Database = defaultDb
): Promise<{ success: true } | ScheduleError> {
  const loaded = await loadSectionForUser(sectionId, userId, role, database);
  if (isScheduleError(loaded)) return loaded;

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
 * Set (or clear) a week's deadline. Syncs the deadline to every assignment in
 * that week so submission deadline enforcement uses it.
 */
export async function setWeekDeadline(
  sectionId: string,
  week: number,
  deadline: string | null,
  userId: string,
  role: string,
  database: Database = defaultDb
): Promise<{ success: true; week: number; deadline: string | null } | ScheduleError> {
  const loaded = await loadSectionForUser(sectionId, userId, role, database);
  if (isScheduleError(loaded)) return loaded;

  if (!isValidScheduleWeek(week)) {
    return { error: { code: "VALIDATION_ERROR", message: "Tuần không hợp lệ." } };
  }

  const normalized = deadline && deadline.trim() ? deadline : null;

  const existing = await database.query.sectionWeeks.findFirst({
    where: and(eq(sectionWeeks.sectionId, sectionId), eq(sectionWeeks.week, week)),
  });

  if (existing) {
    await database
      .update(sectionWeeks)
      .set({ deadline: normalized })
      .where(eq(sectionWeeks.id, existing.id));
  } else {
    await database.insert(sectionWeeks).values({
      id: crypto.randomUUID(),
      sectionId,
      week,
      deadline: normalized,
    });
  }

  // Sync to all assignments in this week.
  await database
    .update(exerciseAssignments)
    .set({ deadline: normalized })
    .where(
      and(
        eq(exerciseAssignments.sectionId, sectionId),
        eq(exerciseAssignments.week, week)
      )
    );

  return { success: true, week, deadline: normalized };
}

/**
 * Toggle the visibility of an exercise assignment in a section.
 */
export async function toggleExerciseVisibility(
  sectionId: string,
  exerciseId: string,
  isVisible: boolean,
  userId: string,
  role: string,
  database: Database = defaultDb
): Promise<{ success: true; exerciseId: string; isVisible: boolean } | ScheduleError> {
  const loaded = await loadSectionForUser(sectionId, userId, role, database);
  if (isScheduleError(loaded)) return loaded;

  const existing = await database.query.exerciseAssignments.findFirst({
    where: and(
      eq(exerciseAssignments.exerciseId, exerciseId),
      eq(exerciseAssignments.sectionId, sectionId)
    ),
  });

  if (!existing) {
    return { error: { code: "NOT_FOUND", message: "Bài tập chưa được gán vào lớp." } };
  }

  await database
    .update(exerciseAssignments)
    .set({ isVisible: isVisible ? 1 : 0 })
    .where(eq(exerciseAssignments.id, existing.id));

  return { success: true, exerciseId, isVisible };
}

function isValidScheduleWeek(week: number): boolean {
  return Number.isInteger(week) && week >= 1 && week <= MAX_SCHEDULE_WEEK;
}
