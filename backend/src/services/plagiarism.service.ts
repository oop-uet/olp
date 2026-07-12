import { eq, and, desc, inArray } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import { submissions, exercises, classSections } from "../db/schema.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlagiarismPair {
  studentAId: string;
  studentAUsername: string;
  studentAName: string;
  studentASectionName: string | null;
  studentASectionSemester: string | null;
  studentASubmittedAt: string;
  studentBId: string;
  studentBUsername: string;
  studentBName: string;
  studentBSectionName: string | null;
  studentBSectionSemester: string | null;
  studentBSubmittedAt: string;
  submissionAId: string;
  submissionBId: string;
  similarity: number; // 0..1, rounded to 4 decimals
}

export interface PlagiarismReport {
  exerciseId: string;
  totalSubmissions: number; // one representative submission per student
  comparedPairs: number;
  threshold: number;
  pairs: PlagiarismPair[];
}

export interface PlagiarismError {
  error: { code: string; message: string };
}

// ─── Database type ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

// ─── Constants ───────────────────────────────────────────────────────────────

const THRESHOLD = 0.35;
const MIN_THRESHOLD = 0.01;
const MAX_THRESHOLD = 1;
const SHINGLE_K = 5;
const SHINGLE_K_FALLBACK = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isPlagiarismError(value: unknown): value is PlagiarismError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as any).error?.code === "string"
  );
}

/**
 * Normalize a source code string for comparison:
 * - Remove // line comments and /* *\/ block comments
 * - Collapse all whitespace runs to a single space
 * - Lowercase and trim
 */
export function normalizeCode(code: string): string {
  if (!code) return "";

  const withoutComments = code
    // Block comments /* ... */ (non-greedy, across newlines)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // Line comments // ... to end of line
    .replace(/\/\/[^\n\r]*/g, " ");

  return withoutComments
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

export function extractComparableCode(code: string): string {
  if (!code) return "";

  try {
    const parsed = JSON.parse(code) as {
      format?: string;
      files?: Array<{ name?: string; content?: string }>;
    };

    if (parsed.format === "oop-java-files" && Array.isArray(parsed.files)) {
      return parsed.files
        .filter((file) => typeof file.content === "string")
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
        .map((file) => `// FILE: ${file.name ?? "Unknown.java"}\n${file.content}`)
        .join("\n\n");
    }
  } catch {
    // Legacy submissions are stored as raw Java source.
  }

  return code;
}

/**
 * Build a set of k-gram shingles (k consecutive tokens joined by a space)
 * from a list of word tokens. If there are fewer than k tokens, the whole
 * token sequence is returned as a single shingle (when non-empty).
 */
export function shingles(tokens: string[], k: number): Set<string> {
  const set = new Set<string>();
  if (tokens.length === 0) return set;

  if (tokens.length < k) {
    set.add(tokens.join(" "));
    return set;
  }

  for (let i = 0; i + k <= tokens.length; i++) {
    set.add(tokens.slice(i, i + k).join(" "));
  }
  return set;
}

/**
 * Jaccard similarity = |A ∩ B| / |A ∪ B|.
 * Returns 0 when either set is empty.
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  // Iterate over the smaller set for efficiency.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) {
    if (large.has(item)) intersection++;
  }

  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

interface StudentEntry {
  studentId: string;
  studentUsername: string;
  studentName: string;
  submissionId: string;
  submittedAt: string;
  sectionName: string | null;
  sectionSemester: string | null;
  tokens: string[];
}

export interface PlagiarismOptions {
  sectionId?: string;
  semester?: string;
  threshold?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Detect students whose submitted Java code is suspiciously similar for a
 * given exercise (optionally scoped to a section).
 *
 * Approach:
 * 1. Keep only each student's highest-scoring submission (tie-break: latest).
 * 2. Normalize code, tokenize, and build k-gram shingle sets.
 * 3. Compare every pair of students with Jaccard similarity.
 * 4. Return pairs with similarity >= 0.35, sorted by similarity DESC.
 */
export async function checkExercisePlagiarism(
  exerciseId: string,
  options: PlagiarismOptions = {},
  database: Database = defaultDb
): Promise<PlagiarismError | PlagiarismReport> {
  const threshold = normalizeThreshold(options.threshold);

  // 1. Verify exercise exists.
  const exercise = await database.query.exercises.findFirst({
    where: eq(exercises.id, exerciseId),
  });

  if (!exercise) {
    return {
      error: { code: "NOT_FOUND", message: "Không tìm thấy bài tập." },
    };
  }

  // 2. Load submissions for the exercise (filter by section if provided),
  //    including the student info for naming.
  let scopedSectionIds: string[] | null = null;
  if (options.sectionId) {
    scopedSectionIds = [options.sectionId];
  } else if (options.semester?.trim()) {
    const sectionRows = await database
      .select({ id: classSections.id })
      .from(classSections)
      .where(eq(classSections.semester, options.semester.trim()));
    const sectionIds = sectionRows.map((section: { id: string }) => section.id);

    if (sectionIds.length === 0) {
      return {
        exerciseId,
        totalSubmissions: 0,
        comparedPairs: 0,
        threshold,
        pairs: [],
      };
    }
    scopedSectionIds = sectionIds;
  }

  const whereClause = scopedSectionIds
    ? and(eq(submissions.exerciseId, exerciseId), inArray(submissions.sectionId, scopedSectionIds as string[]))
    : eq(submissions.exerciseId, exerciseId);

  const rows = await database.query.submissions.findMany({
    where: whereClause,
    orderBy: [desc(submissions.submittedAt)],
    with: {
      student: {
        columns: {
          id: true,
          username: true,
          fullName: true,
        },
      },
      section: {
        columns: {
          name: true,
          semester: true,
        },
      },
    },
  });

  // 3. Keep only the highest-scoring submission per student
  //    (tie-break: latest submittedAt).
  const bestByStudent = new Map<string, any>();
  for (const row of rows) {
    const existing = bestByStudent.get(row.studentId);
    if (!existing) {
      bestByStudent.set(row.studentId, row);
      continue;
    }

    const score = row.score ?? 0;
    const existingScore = existing.score ?? 0;
    if (score > existingScore) {
      bestByStudent.set(row.studentId, row);
    } else if (score === existingScore && row.submittedAt > existing.submittedAt) {
      bestByStudent.set(row.studentId, row);
    }
  }

  // 4. Build token lists per representative submission.
  const entries: StudentEntry[] = [];
  for (const row of bestByStudent.values()) {
    const normalized = normalizeCode(extractComparableCode(row.code ?? ""));
    const tokens = normalized.length > 0 ? normalized.split(" ").filter(Boolean) : [];
    entries.push({
      studentId: row.studentId,
      studentUsername: row.student?.username || row.studentId,
      studentName: row.student?.fullName || row.student?.username || "Sinh viên",
      submissionId: row.id,
      submittedAt: row.submittedAt,
      sectionName: row.section?.name ?? null,
      sectionSemester: row.section?.semester ?? null,
      tokens,
    });
  }

  // 5. Compare every pair of students.
  const pairs: PlagiarismPair[] = [];
  let comparedPairs = 0;

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      comparedPairs++;

      // Fallback to smaller shingles when either submission is too short
      // for 5-token grams.
      const k =
        a.tokens.length < SHINGLE_K || b.tokens.length < SHINGLE_K
          ? SHINGLE_K_FALLBACK
          : SHINGLE_K;

      const setA = shingles(a.tokens, k);
      const setB = shingles(b.tokens, k);
      const similarity = jaccard(setA, setB);

      if (similarity >= threshold) {
        pairs.push({
          studentAId: a.studentId,
          studentAUsername: a.studentUsername,
          studentAName: a.studentName,
          studentASectionName: a.sectionName,
          studentASectionSemester: a.sectionSemester,
          studentASubmittedAt: a.submittedAt,
          studentBId: b.studentId,
          studentBUsername: b.studentUsername,
          studentBName: b.studentName,
          studentBSectionName: b.sectionName,
          studentBSectionSemester: b.sectionSemester,
          studentBSubmittedAt: b.submittedAt,
          submissionAId: a.submissionId,
          submissionBId: b.submissionId,
          similarity: round4(similarity),
        });
      }
    }
  }

  // 6. Sort suspicious pairs by similarity DESC.
  pairs.sort((x, y) => y.similarity - x.similarity);

  return {
    exerciseId,
    totalSubmissions: entries.length,
    comparedPairs,
    threshold,
    pairs,
  };
}

function normalizeThreshold(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return THRESHOLD;
  const normalized = value > 1 ? value / 100 : value;
  if (normalized < MIN_THRESHOLD || normalized > MAX_THRESHOLD) return THRESHOLD;
  return round4(normalized);
}
