import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import { exerciseAssignments, exercises } from "../db/schema.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

export interface DefaultAssignmentReport {
  assigned: number;
  skipped: number;
}

function extractWeekFromTitle(title: string): number | null {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const match = normalized.match(/\btuan\s*(\d{1,2})\b/);
  if (!match) return null;
  const week = Number(match[1]);
  return Number.isInteger(week) && week > 0 ? week : null;
}

/**
 * Assign all system-library exercises whose title contains "Tuần N" to the
 * matching week of a newly created section. Project exercises stay in the
 * library pool so instructors can add them manually when needed.
 */
export async function assignDefaultExercisesByTitleToSection(
  sectionId: string,
  database: Database = defaultDb
): Promise<DefaultAssignmentReport> {
  const libraryExercises = await database.query.exercises.findMany({
    where: eq(exercises.isLibrary, 1),
  });

  let assigned = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const exercise of libraryExercises) {
    const week = extractWeekFromTitle(exercise.title);
    if (!week) {
      skipped += 1;
      continue;
    }

    await database
      .insert(exerciseAssignments)
      .values({
        id: crypto.randomUUID(),
        exerciseId: exercise.id,
        sectionId,
        deadline: null,
        isAssessment: 0,
        isVisible: 0,
        allowSubmission: 1,
        maxSubmissions: null,
        week,
        assignedAt: now,
      })
      .onConflictDoNothing();

    assigned += 1;
  }

  return { assigned, skipped };
}
