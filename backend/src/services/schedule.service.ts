import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  classSections,
  exercises,
  exerciseAssignments,
  sectionWeeks,
  users,
} from "../db/schema.js";
import { userCanAccessSection } from "./section.service.js";

// Default number of weeks in a course schedule. Instructors can extend this
// when a section needs extra make-up/project weeks.
export const TOTAL_WEEKS = 10;
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

async function ensureSectionWeeksReady(database: Database = defaultDb) {
  const sqlite = database.session?.client;
  if (!sqlite) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS section_weeks (
      id TEXT PRIMARY KEY NOT NULL,
      section_id TEXT NOT NULL REFERENCES class_sections(id),
      week INTEGER NOT NULL,
      deadline TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS section_weeks_section_week_unique
      ON section_weeks (section_id, week)`,
  ];

  for (const statement of statements) {
    if (typeof sqlite.exec === "function") {
      sqlite.exec(statement);
    } else if (typeof sqlite.execute === "function") {
      await sqlite.execute(statement);
    }
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
  if (!(await userCanAccessSection(sectionId, userId, role, database))) {
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
  creatorUsername: string | null;
  isLibrary: boolean;
  isAssessment: boolean;
  isVisible: boolean;
  allowSubmission: boolean;
  maxSubmissions: number | null;
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
  pool: SchedulePoolExercise[];
  otherPool: SchedulePoolExercise[];
}

export interface SchedulePoolExercise {
    id: string;
    title: string;
    difficulty: string;
    oopTags: string[];
    creatorUsername: string | null;
    isLibrary: boolean;
}

/**
 * Build the default 10-week schedule view for a section: assigned exercises grouped by
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
  await ensureSectionWeeksReady(database);
  const section = loaded.section;

  // Assigned exercises for this section.
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
      title: exercises.title,
      difficulty: exercises.difficulty,
      oopTags: exercises.oopTags,
      isLibrary: exercises.isLibrary,
      creatorUsername: users.username,
    })
    .from(exerciseAssignments)
    .innerJoin(exercises, eq(exerciseAssignments.exerciseId, exercises.id))
    .leftJoin(users, eq(exercises.createdBy, users.id))
    .where(eq(exerciseAssignments.sectionId, sectionId));

  // Per-week deadlines.
  const weekRows = await database
    .select()
    .from(sectionWeeks)
    .where(eq(sectionWeeks.sectionId, sectionId));
  const toScheduleExercise = (a: any): ScheduleExercise => ({
    assignmentId: a.assignmentId,
    exerciseId: a.exerciseId,
    title: a.title,
    difficulty: a.difficulty,
    oopTags: parseOopTags(a.oopTags),
    creatorUsername: a.creatorUsername ?? null,
    isLibrary: Boolean(a.isLibrary),
    isAssessment: Boolean(a.isAssessment),
    isVisible: Boolean(a.isVisible),
    allowSubmission: Boolean(a.allowSubmission),
    maxSubmissions: a.maxSubmissions ?? null,
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
      deadline: resolveDefaultDeadline(weekRows as any[], i),
      exercises: assignments
        .filter((a: any) => a.week === i)
        .map(toScheduleExercise),
    });
  }

  const unscheduled = assignments
    .filter((a: any) => !a.week || a.week < 1)
    .map(toScheduleExercise);

  // Pool: unassigned system-library exercises and a separate "other" pool of
  // private exercises created by instructors/admins across the system.
  const poolSource = await database
    .select({
      id: exercises.id,
      title: exercises.title,
      difficulty: exercises.difficulty,
      oopTags: exercises.oopTags,
      isLibrary: exercises.isLibrary,
      creatorUsername: users.username,
    })
    .from(exercises)
    .leftJoin(users, eq(exercises.createdBy, users.id));

  const availablePool = (poolSource as any[])
    .filter((e) => !assignedExerciseIds.has(String(e.id)))
    .map((e): SchedulePoolExercise => ({
      id: e.id,
      title: e.title,
      difficulty: e.difficulty,
      oopTags: parseOopTags(e.oopTags),
      creatorUsername: e.creatorUsername ?? null,
      isLibrary: Boolean(e.isLibrary),
    }));

  const pool = availablePool.filter((exercise) => exercise.isLibrary);
  const otherPool = availablePool.filter((exercise) => !exercise.isLibrary);

  return {
    section: { id: section.id, name: section.name, semester: section.semester },
    weeks,
    unscheduled,
    pool,
    otherPool,
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
  await ensureSectionWeeksReady(database);

  if (!isValidScheduleWeek(week)) {
    return { error: { code: "VALIDATION_ERROR", message: "Tuần không hợp lệ." } };
  }

  const exercise = await database.query.exercises.findFirst({
    where: eq(exercises.id, exerciseId),
  });
  if (!exercise) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy bài tập." } };
  }

  // Deadline to apply, taken from the week's configured deadline or the
  // nearest configured week plus seven days per week.
  const weekRows = await database
    .select()
    .from(sectionWeeks)
    .where(eq(sectionWeeks.sectionId, sectionId));
  const weekDeadline = resolveDefaultDeadline(weekRows as any[], week);

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
      isVisible: 0,
      allowSubmission: 1,
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
  await ensureSectionWeeksReady(database);

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

export interface AssignmentSettingsInput {
  isVisible?: boolean;
  allowSubmission?: boolean;
  maxSubmissions?: number | null;
}

/**
 * Update per-section assignment controls used by instructors on the course
 * detail page: student visibility, whether submissions are accepted, and
 * maximum attempts for this assignment.
 */
export async function updateAssignmentSettings(
  sectionId: string,
  exerciseId: string,
  input: AssignmentSettingsInput,
  userId: string,
  role: string,
  database: Database = defaultDb
): Promise<{
  success: true;
  exerciseId: string;
  isVisible: boolean;
  allowSubmission: boolean;
  maxSubmissions: number | null;
} | ScheduleError> {
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

  const update: Record<string, number | null> = {};

  if (typeof input.isVisible === "boolean") {
    update.isVisible = input.isVisible ? 1 : 0;
  }
  if (typeof input.allowSubmission === "boolean") {
    update.allowSubmission = input.allowSubmission ? 1 : 0;
  }
  if ("maxSubmissions" in input) {
    const maxSubmissions = input.maxSubmissions;
    if (maxSubmissions === null) {
      update.maxSubmissions = null;
    } else if (
      typeof maxSubmissions === "number" &&
      Number.isInteger(maxSubmissions) &&
      maxSubmissions >= 0 &&
      maxSubmissions <= 100
    ) {
      update.maxSubmissions = maxSubmissions;
    } else {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "Số lần nộp phải là số nguyên từ 0 đến 100.",
        },
      };
    }
  }

  if (Object.keys(update).length === 0) {
    return {
      success: true,
      exerciseId,
      isVisible: Boolean(existing.isVisible),
      allowSubmission: Boolean(existing.allowSubmission),
      maxSubmissions: existing.maxSubmissions ?? null,
    };
  }

  await database
    .update(exerciseAssignments)
    .set(update)
    .where(eq(exerciseAssignments.id, existing.id));

  const next = { ...existing, ...update };

  return {
    success: true,
    exerciseId,
    isVisible: Boolean(next.isVisible),
    allowSubmission: Boolean(next.allowSubmission),
    maxSubmissions: next.maxSubmissions ?? null,
  };
}

function isValidScheduleWeek(week: number): boolean {
  return Number.isInteger(week) && week >= 1 && week <= MAX_SCHEDULE_WEEK;
}

function resolveDefaultDeadline(
  weekRows: Array<{ week: number; deadline?: string | null }>,
  targetWeek: number
): string | null {
  const explicit = weekRows.find((row) => row.week === targetWeek && row.deadline);
  if (explicit?.deadline) return explicit.deadline;

  const previous = weekRows
    .filter((row) => row.deadline && row.week < targetWeek)
    .sort((a, b) => b.week - a.week)[0];

  if (previous?.deadline) {
    return addDaysIso(previous.deadline, (targetWeek - previous.week) * 7);
  }

  const next = weekRows
    .filter((row) => row.deadline && row.week > targetWeek)
    .sort((a, b) => a.week - b.week)[0];

  if (next?.deadline) {
    return addDaysIso(next.deadline, (targetWeek - next.week) * 7);
  }

  return null;
}

function addDaysIso(iso: string, days: number): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
