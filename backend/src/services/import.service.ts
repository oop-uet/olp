import crypto from "node:crypto";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import bcrypt from "bcrypt";
import { eq, and } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import { users, sectionEnrollments, classSections, submissions } from "../db/schema.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImportRow {
  student_id?: string;
  full_name?: string;
  email?: string;
}

export interface SkippedEntry {
  row: number;
  reason: string;
}

export interface ImportReport {
  imported: number;
  skipped: SkippedEntry[];
  total: number;
}

export interface ExportRow {
  student_id: string;
  full_name: string;
  email: string;
  enrollment_date: string;
  current_score: string;
}

// ─── Email Validation ────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// ─── File Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a CSV buffer into an array of row objects.
 */
export function parseCSV(buffer: Buffer): ImportRow[] {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  return records as ImportRow[];
}

/**
 * Parse an Excel (.xlsx) buffer into an array of row objects.
 */
export function parseExcel(buffer: Buffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: "" });
  return rows;
}

/**
 * Detect file type and parse accordingly.
 * Supports CSV (by default), Excel .xlsx (PK zip header), and .xls (legacy BIFF format).
 */
export function parseFile(buffer: Buffer, filename?: string): ImportRow[] {
  // Check for Excel magic bytes (PK zip header for .xlsx)
  const isXlsx =
    (buffer[0] === 0x50 && buffer[1] === 0x4b) ||
    (filename && filename.toLowerCase().endsWith(".xlsx"));

  // Check for .xls (legacy BIFF format: starts with 0xD0CF)
  const isXls =
    (buffer[0] === 0xd0 && buffer[1] === 0xcf) ||
    (filename && filename.toLowerCase().endsWith(".xls"));

  if (isXlsx || isXls) {
    return parseExcel(buffer);
  }
  return parseCSV(buffer);
}

// ─── Row Validation ──────────────────────────────────────────────────────────

/**
 * Validate a single import row. Returns null if valid, or an error reason string.
 */
export function validateStudentImportRow(row: ImportRow): string | null {
  const studentId = row.student_id?.toString().trim();
  const fullName = row.full_name?.toString().trim();
  const email = row.email?.toString().trim();

  if (!studentId) {
    return "Missing required field: student_id";
  }
  if (!fullName) {
    return "Missing required field: full_name";
  }
  if (!email) {
    return "Missing required field: email";
  }
  if (!isValidEmail(email)) {
    return `Malformed email address: ${email}`;
  }

  return null;
}

// ─── Import Service ──────────────────────────────────────────────────────────

/**
 * Import students from a parsed row array into a target section.
 * - For each valid row, creates a user (if not already existing by email) and enrolls in the section.
 * - Default password: student_id (hashed with bcrypt 12 rounds)
 * - Username: student_id (external student ID)
 * - Skips: missing required fields, malformed emails, duplicates in target section
 */
export async function importStudents(
  sectionId: string,
  rows: ImportRow[],
  database = defaultDb
): Promise<ImportReport> {
  // Verify section exists
  const section = await database.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });

  if (!section) {
    return { imported: 0, skipped: [{ row: 0, reason: "Section not found" }], total: rows.length };
  }

  // Get existing enrollments for the section (by studentExternalId)
  const existingEnrollments = await database.query.sectionEnrollments.findMany({
    where: eq(sectionEnrollments.sectionId, sectionId),
  });
  const enrolledExternalIds = new Set(
    existingEnrollments
      .map((e) => e.studentExternalId)
      .filter((id): id is string => id !== null)
  );

  const report: ImportReport = {
    imported: 0,
    skipped: [],
    total: rows.length,
  };

  // Track student_ids seen in this import batch to detect in-batch duplicates
  const seenStudentIds = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1; // 1-indexed for user-friendly reporting

    // Validate row
    const validationError = validateStudentImportRow(row);
    if (validationError) {
      report.skipped.push({ row: rowNumber, reason: validationError });
      continue;
    }

    const studentId = row.student_id!.toString().trim();
    const email = row.email!.toString().trim().toLowerCase();

    // Check for duplicates already enrolled in target section
    if (enrolledExternalIds.has(studentId)) {
      report.skipped.push({
        row: rowNumber,
        reason: `Student ID '${studentId}' is already enrolled in this section`,
      });
      continue;
    }

    // Check for in-batch duplicates
    if (seenStudentIds.has(studentId)) {
      report.skipped.push({
        row: rowNumber,
        reason: `Duplicate student_id '${studentId}' within import file`,
      });
      continue;
    }

    seenStudentIds.add(studentId);

    // Find or create user by email
    let user = await database.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      // Create new user with student_id as username and default password
      const userId = crypto.randomUUID();
      const now = new Date().toISOString();
      const passwordHash = await bcrypt.hash(studentId, 12);

      const [newUser] = await database
        .insert(users)
        .values({
          id: userId,
          username: studentId,
          email,
          passwordHash,
          role: "student",
          failedLoginAttempts: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      user = newUser;
    }

    // Create enrollment
    const enrollmentId = crypto.randomUUID();
    const now = new Date().toISOString();

    await database.insert(sectionEnrollments).values({
      id: enrollmentId,
      sectionId,
      studentId: user.id,
      studentExternalId: studentId,
      enrolledAt: now,
    });

    // Track that this student_id is now enrolled
    enrolledExternalIds.add(studentId);
    report.imported++;
  }

  return report;
}

// ─── Export Service ──────────────────────────────────────────────────────────

/**
 * Export all students enrolled in a section as CSV.
 * Columns: student_id, full_name, email, enrollment_date, current_score
 * current_score is computed from the highest submission score per exercise.
 */
export async function exportStudents(
  sectionId: string,
  database = defaultDb
): Promise<{ csv: string; rows: ExportRow[] } | { error: { code: string; message: string } }> {
  // Verify section exists
  const section = await database.query.classSections.findFirst({
    where: eq(classSections.id, sectionId),
  });

  if (!section) {
    return { error: { code: "NOT_FOUND", message: "Section not found" } };
  }

  // Get all enrollments for the section
  const enrollments = await database.query.sectionEnrollments.findMany({
    where: eq(sectionEnrollments.sectionId, sectionId),
    with: {
      student: true,
    },
  });

  const exportRows: ExportRow[] = [];

  for (const enrollment of enrollments) {
    const student = enrollment.student;
    if (!student) continue;

    // Get all submissions for this student in this section
    const studentSubmissions = await database.query.submissions.findMany({
      where: and(
        eq(submissions.studentId, student.id),
        eq(submissions.sectionId, sectionId)
      ),
    });

    // Compute current_score: average of highest scores per exercise
    const highestScoresByExercise = new Map<string, number>();
    for (const sub of studentSubmissions) {
      const score = sub.score ?? 0;
      const current = highestScoresByExercise.get(sub.exerciseId) ?? 0;
      if (score > current) {
        highestScoresByExercise.set(sub.exerciseId, score);
      }
    }

    let currentScore = "0.00";
    if (highestScoresByExercise.size > 0) {
      const totalScore = Array.from(highestScoresByExercise.values()).reduce((a, b) => a + b, 0);
      const avgScore = totalScore / highestScoresByExercise.size;
      currentScore = avgScore.toFixed(2);
    }

    exportRows.push({
      student_id: enrollment.studentExternalId || student.username,
      full_name: student.username, // Using username as full_name display
      email: student.email,
      enrollment_date: enrollment.enrolledAt,
      current_score: currentScore,
    });
  }

  // Generate CSV
  const csvHeader = "student_id,full_name,email,enrollment_date,current_score";
  const csvRows = exportRows.map(
    (row) =>
      `${escapeCSV(row.student_id)},${escapeCSV(row.full_name)},${escapeCSV(row.email)},${escapeCSV(row.enrollment_date)},${row.current_score}`
  );
  const csv = [csvHeader, ...csvRows].join("\n");

  return { csv, rows: exportRows };
}

/**
 * Escape a value for CSV output.
 */
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
