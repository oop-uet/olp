import crypto from "node:crypto";
import { eq, and, max } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  classSections,
  exercises,
  exerciseAssignments,
  assessments,
  assessmentAssignments,
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

async function ensureAssessmentAssignmentWeekReady(database: Database = defaultDb) {
  const sqlite = database.session?.client;
  if (!sqlite) return;
  const statement = "ALTER TABLE assessment_assignments ADD COLUMN week INTEGER";
  try {
    if (typeof sqlite.exec === "function") {
      sqlite.exec(statement);
    } else if (typeof sqlite.execute === "function") {
      await sqlite.execute(statement);
    }
  } catch (error: any) {
    const message = String(error?.message ?? error).toLowerCase();
    if (!message.includes("duplicate column") && !message.includes("no such table")) throw error;
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
  sortOrder: number;
}

export interface ScheduleWeek {
  week: number;
  deadline: string | null;
  exercises: ScheduleExercise[];
  assessments: ScheduleAssessment[];
}

export interface SectionSchedule {
  section: { id: string; name: string; semester: string };
  weeks: ScheduleWeek[];
  unscheduled: ScheduleExercise[];
  pool: SchedulePoolExercise[];
  otherPool: SchedulePoolExercise[];
  assessmentUnscheduled: ScheduleAssessment[];
  assessmentPool: SchedulePoolAssessment[];
}

export interface SchedulePoolExercise {
    id: string;
    title: string;
    difficulty: string;
    oopTags: string[];
    creatorUsername: string | null;
    isLibrary: boolean;
}

export interface ScheduleAssessment {
  assignmentId: string;
  assessmentId: string;
  title: string;
  totalPoints: number;
  durationMinutes: number;
  maxAttempts: number;
  creatorUsername: string | null;
  week: number | null;
  deadline: string | null;
  opensAt: string;
  closesAt: string;
  isVisible: boolean;
  sortOrder: number;
}

export interface SchedulePoolAssessment {
  id: string;
  title: string;
  totalPoints: number;
  durationMinutes: number;
  creatorUsername: string | null;
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
  await ensureAssessmentAssignmentWeekReady(database);
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
      sortOrder: exerciseAssignments.sortOrder,
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

  const assessmentRows = await database
    .select({
      assignmentId: assessmentAssignments.id,
      assessmentId: assessmentAssignments.assessmentId,
      title: assessments.title,
      totalPoints: assessments.totalPoints,
      durationMinutes: assessmentAssignments.durationMinutes,
      maxAttempts: assessmentAssignments.maxAttempts,
      creatorUsername: users.username,
      week: assessmentAssignments.week,
      opensAt: assessmentAssignments.opensAt,
      closesAt: assessmentAssignments.closesAt,
      isVisible: assessmentAssignments.isVisible,
      sortOrder: assessmentAssignments.sortOrder,
    })
    .from(assessmentAssignments)
    .innerJoin(assessments, eq(assessmentAssignments.assessmentId, assessments.id))
    .leftJoin(users, eq(assessments.createdBy, users.id))
    .where(eq(assessmentAssignments.sectionId, sectionId));

  const toScheduleAssessment = (a: any): ScheduleAssessment => ({
    assignmentId: a.assignmentId,
    assessmentId: a.assessmentId,
    title: a.title,
    totalPoints: Number(a.totalPoints) || 0,
    durationMinutes: Number(a.durationMinutes) || 0,
    maxAttempts: Number(a.maxAttempts) || 1,
    creatorUsername: a.creatorUsername ?? null,
    week: a.week ?? null,
    deadline: a.closesAt ?? null,
    opensAt: a.opensAt,
    closesAt: a.closesAt,
    isVisible: Boolean(a.isVisible),
    sortOrder: Number(a.sortOrder) || 0,
  });
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
    sortOrder: Number(a.sortOrder) || 0,
  });

  const assignedExerciseIds = new Set<string>(
    (assignments as any[]).map((a) => String(a.exerciseId))
  );

  const maxConfiguredWeek = Math.max(
    TOTAL_WEEKS,
    ...((assignments as any[]).map((a) => Number(a.week) || 0)),
    ...((assessmentRows as any[]).map((a) => Number(a.week) || 0)),
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
        .sort((a: any, b: any) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
        .map(toScheduleExercise),
      assessments: assessmentRows
        .filter((a: any) => a.week === i)
        .sort((a: any, b: any) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
        .map(toScheduleAssessment),
    });
  }

  const unscheduled = assignments
    .filter((a: any) => !a.week || a.week < 1)
    .map(toScheduleExercise);
  const assessmentUnscheduled = assessmentRows
    .filter((a: any) => !a.week || a.week < 1)
    .map(toScheduleAssessment);
  const assignedAssessmentIds = new Set<string>(
    (assessmentRows as any[]).map((a) => String(a.assessmentId))
  );

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

  const assessmentPoolSource = await database
    .select({
      id: assessments.id,
      title: assessments.title,
      totalPoints: assessments.totalPoints,
      durationMinutes: assessments.durationMinutes,
      creatorUsername: users.username,
    })
    .from(assessments)
    .leftJoin(users, eq(assessments.createdBy, users.id));
  const assessmentPool = (assessmentPoolSource as any[])
    .filter((assessment) => !assignedAssessmentIds.has(String(assessment.id)))
    .map((assessment): SchedulePoolAssessment => ({
      id: assessment.id,
      title: assessment.title,
      totalPoints: Number(assessment.totalPoints) || 0,
      durationMinutes: Number(assessment.durationMinutes) || 0,
      creatorUsername: assessment.creatorUsername ?? null,
    }));

  return {
    section: { id: section.id, name: section.name, semester: section.semester },
    weeks,
    unscheduled,
    pool,
    otherPool,
    assessmentUnscheduled,
    assessmentPool,
  };
}

/**
 * Assign an exercise to a specific week of a section (or move it there if it is
 * already assigned). The assignment's deadline is synced to the week's deadline.
 */
async function nextScheduleSortOrder(
  sectionId: string,
  week: number,
  database: Database
): Promise<number> {
  const [exerciseMax] = await database
    .select({ value: max(exerciseAssignments.sortOrder) })
    .from(exerciseAssignments)
    .where(and(eq(exerciseAssignments.sectionId, sectionId), eq(exerciseAssignments.week, week)));
  const [assessmentMax] = await database
    .select({ value: max(assessmentAssignments.sortOrder) })
    .from(assessmentAssignments)
    .where(and(eq(assessmentAssignments.sectionId, sectionId), eq(assessmentAssignments.week, week)));
  const exerciseOrder = exerciseMax?.value == null ? -1 : Number(exerciseMax.value);
  const assessmentOrder = assessmentMax?.value == null ? -1 : Number(assessmentMax.value);
  return Math.max(exerciseOrder, assessmentOrder) + 1;
}

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
    const sortOrder = existing.week === week
      ? existing.sortOrder
      : await nextScheduleSortOrder(sectionId, week, database);
    await database
      .update(exerciseAssignments)
      .set({ week, deadline: weekDeadline, sortOrder })
      .where(eq(exerciseAssignments.id, existing.id));
  } else {
    const sortOrder = await nextScheduleSortOrder(sectionId, week, database);
    await database.insert(exerciseAssignments).values({
      id: crypto.randomUUID(),
      exerciseId,
      sectionId,
      deadline: weekDeadline,
      isAssessment: 0,
      isVisible: 0,
      allowSubmission: 1,
      week,
      sortOrder,
      assignedAt: new Date().toISOString(),
    });
  }

  return { success: true };
}

/**
 * Add an assessment to a week. The weekly deadline becomes the
 * closing time for the exam; when no deadline exists, a safe future window is
 * generated from the exam duration.
 */
export async function assignAssessmentToWeek(
  sectionId: string,
  assessmentId: string,
  week: number,
  userId: string,
  role: string,
  database: Database = defaultDb
): Promise<{ success: true; assignmentId: string; week: number } | ScheduleError> {
  const loaded = await loadSectionForUser(sectionId, userId, role, database);
  if (isScheduleError(loaded)) return loaded;
  await ensureSectionWeeksReady(database);
  await ensureAssessmentAssignmentWeekReady(database);

  if (!isValidScheduleWeek(week)) {
    return { error: { code: "VALIDATION_ERROR", message: "Tuần không hợp lệ." } };
  }

  const assessment = await database.query.assessments.findFirst({
    where: eq(assessments.id, assessmentId),
  });
  if (!assessment) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy bài kiểm tra." } };
  }
  const weekRows = await database
    .select()
    .from(sectionWeeks)
    .where(eq(sectionWeeks.sectionId, sectionId));
  const weekDeadline = resolveDefaultDeadline(weekRows as any[], week);
  const existing = await database.query.assessmentAssignments.findFirst({
    where: and(
      eq(assessmentAssignments.assessmentId, assessmentId),
      eq(assessmentAssignments.sectionId, sectionId)
    ),
  });
  const now = new Date();
  const fallbackClose = new Date(now.getTime() + Math.max(assessment.durationMinutes + 30, 7 * 24 * 60) * 60_000);
  const requestedClose = weekDeadline ? new Date(weekDeadline) : fallbackClose;
  const closesAt = Number.isNaN(requestedClose.getTime()) || requestedClose <= now
    ? fallbackClose.toISOString()
    : requestedClose.toISOString();
  const closeDate = new Date(closesAt);
  const weekStart = new Date(closeDate.getTime() - 7 * 24 * 60 * 60_000);
  const opensAt = weekStart > now ? weekStart.toISOString() : now.toISOString();

  if (existing) {
    const sortOrder = existing.week === week
      ? existing.sortOrder
      : await nextScheduleSortOrder(sectionId, week, database);
    await database
      .update(assessmentAssignments)
      .set({ week, closesAt, isVisible: 1, sortOrder })
      .where(eq(assessmentAssignments.id, existing.id));
    return { success: true, assignmentId: existing.id, week };
  }

  const assignmentId = crypto.randomUUID();
  const sortOrder = await nextScheduleSortOrder(sectionId, week, database);
  await database.insert(assessmentAssignments).values({
    id: assignmentId,
    assessmentId,
    sectionId,
    opensAt,
    closesAt,
    durationMinutes: assessment.durationMinutes,
    isVisible: 1,
    requireFullscreen: 1,
    warningThreshold: 3,
    showPredictedScore: 1,
    week,
    sortOrder,
    assignedBy: userId,
    assignedAt: now.toISOString(),
  });
  return { success: true, assignmentId, week };
}

export type ScheduleOrderItemInput = {
  type: "exercise" | "assessment";
  id: string;
};

export async function reorderScheduleWeek(
  sectionId: string,
  week: number,
  items: ScheduleOrderItemInput[],
  userId: string,
  role: string,
  database: Database = defaultDb
): Promise<{ success: true; week: number } | ScheduleError> {
  const loaded = await loadSectionForUser(sectionId, userId, role, database);
  if (isScheduleError(loaded)) return loaded;
  await ensureAssessmentAssignmentWeekReady(database);
  if (!isValidScheduleWeek(week)) {
    return { error: { code: "VALIDATION_ERROR", message: "Tuần không hợp lệ." } };
  }
  if (!Array.isArray(items) || items.length > 200) {
    return { error: { code: "VALIDATION_ERROR", message: "Danh sách thứ tự không hợp lệ." } };
  }

  const exerciseRows = await database
    .select({ id: exerciseAssignments.id, exerciseId: exerciseAssignments.exerciseId })
    .from(exerciseAssignments)
    .where(and(eq(exerciseAssignments.sectionId, sectionId), eq(exerciseAssignments.week, week)));
  const assessmentRows = await database
    .select({ id: assessmentAssignments.id, assessmentId: assessmentAssignments.assessmentId })
    .from(assessmentAssignments)
    .where(and(eq(assessmentAssignments.sectionId, sectionId), eq(assessmentAssignments.week, week)));
  const expected = new Set([
    ...exerciseRows.map((row: { exerciseId: string }) => `exercise:${row.exerciseId}`),
    ...assessmentRows.map((row: { assessmentId: string }) => `assessment:${row.assessmentId}`),
  ]);
  const received = items.map((item) => `${item.type}:${item.id}`);
  if (
    items.some((item) => !["exercise", "assessment"].includes(item.type) || !item.id) ||
    received.length !== expected.size ||
    new Set(received).size !== received.length ||
    received.some((item) => !expected.has(item))
  ) {
    return { error: { code: "VALIDATION_ERROR", message: "Thứ tự bài trong tuần không hợp lệ." } };
  }

  for (const [sortOrder, item] of items.entries()) {
    if (item.type === "exercise") {
      const assignment = exerciseRows.find((row: { id: string; exerciseId: string }) => row.exerciseId === item.id);
      if (!assignment) continue;
      await database
        .update(exerciseAssignments)
        .set({ sortOrder })
        .where(eq(exerciseAssignments.id, assignment.id));
    } else {
      const assignment = assessmentRows.find((row: { id: string; assessmentId: string }) => row.assessmentId === item.id);
      if (!assignment) continue;
      await database
        .update(assessmentAssignments)
        .set({ sortOrder })
        .where(eq(assessmentAssignments.id, assignment.id));
    }
  }
  return { success: true, week };
}

/** Remove an assessment from its week while keeping the assignment record for audit/history. */
export async function removeAssessmentAssignment(
  sectionId: string,
  assessmentId: string,
  userId: string,
  role: string,
  database: Database = defaultDb
): Promise<{ success: true } | ScheduleError> {
  const loaded = await loadSectionForUser(sectionId, userId, role, database);
  if (isScheduleError(loaded)) return loaded;
  await ensureAssessmentAssignmentWeekReady(database);
  const existing = await database.query.assessmentAssignments.findFirst({
    where: and(
      eq(assessmentAssignments.assessmentId, assessmentId),
      eq(assessmentAssignments.sectionId, sectionId)
    ),
  });
  if (!existing) return { success: true };

  await database
    .update(assessmentAssignments)
    .set({ week: null, isVisible: 0 })
    .where(eq(assessmentAssignments.id, existing.id));
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

  if (normalized) {
    await ensureAssessmentAssignmentWeekReady(database);
    await database
      .update(assessmentAssignments)
      .set({ closesAt: normalized })
      .where(
        and(
          eq(assessmentAssignments.sectionId, sectionId),
          eq(assessmentAssignments.week, week)
        )
      );
  }

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
  isAssessment?: boolean;
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
  isAssessment: boolean;
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
  if (typeof input.isAssessment === "boolean") {
    update.isAssessment = input.isAssessment ? 1 : 0;
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
      isAssessment: Boolean(existing.isAssessment),
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
    isAssessment: Boolean(next.isAssessment),
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
