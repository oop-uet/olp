import { eq, count } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  users,
  classSections,
  exercises,
  submissions,
} from "../db/schema.js";

/**
 * Aggregate dashboard statistics for the admin overview.
 */
export async function getAdminStats(database = defaultDb) {
  const [studentCount] = await database
    .select({ c: count() })
    .from(users)
    .where(eq(users.role, "student"));
  const [instructorCount] = await database
    .select({ c: count() })
    .from(users)
    .where(eq(users.role, "instructor"));
  const [sectionCount] = await database.select({ c: count() }).from(classSections);
  const [exerciseCount] = await database.select({ c: count() }).from(exercises);
  const [libraryCount] = await database
    .select({ c: count() })
    .from(exercises)
    .where(eq(exercises.isLibrary, 1));
  const [submissionCount] = await database.select({ c: count() }).from(submissions);

  return {
    students: studentCount?.c ?? 0,
    instructors: instructorCount?.c ?? 0,
    sections: sectionCount?.c ?? 0,
    exercises: exerciseCount?.c ?? 0,
    libraryExercises: libraryCount?.c ?? 0,
    submissions: submissionCount?.c ?? 0,
  };
}
