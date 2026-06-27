import crypto from "node:crypto";
import * as XLSX from "xlsx";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import { users, sectionEnrollments, classSections } from "../db/schema.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RosterStudent {
  stt: number;
  studentId: string;
  fullName: string;
  dateOfBirth: string;
  className: string;
}

export interface RosterMetadata {
  courseName: string;
  courseCode: string;
  semester: string;
  instructor: string;
  sectionName: string;
}

export interface RosterImportReport {
  section: { id: string; name: string; semester: string };
  imported: number;
  skipped: Array<{ row: number; studentId?: string; reason: string }>;
  total: number;
}

// ─── Parser for Vietnamese university class roster (.xls/.xlsx) ──────────────

/**
 * Parse a Vietnamese university class roster Excel file.
 * These files have metadata in the header rows and student data in a table.
 * Format: STT | Mã SV | Họ và tên | Ngày sinh | Lớp
 */
export function parseRosterFile(buffer: Buffer): {
  metadata: RosterMetadata;
  students: RosterStudent[];
} {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found in file");

  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  // Extract metadata from header rows
  const metadata: RosterMetadata = {
    courseName: "",
    courseCode: "",
    semester: "",
    instructor: "",
    sectionName: "",
  };

  // Parse header rows for metadata
  for (let i = 0; i < Math.min(rawData.length, 15); i++) {
    const row = rawData[i];
    if (!row) continue;
    const rowStr = row.join(" ").trim();

    // Look for course info (INT2204 80)
    const courseMatch = rowStr.match(/([A-Z]{3}\d{4})\s*(\d+)/);
    if (courseMatch) {
      metadata.courseCode = courseMatch[1];
      metadata.sectionName = `${courseMatch[1]} ${courseMatch[2]}`;
    }

    // Look for semester info
    if (rowStr.includes("học kỳ") || rowStr.includes("học kì") || rowStr.includes("hoc ky")) {
      const semMatch = rowStr.match(/(\d{4}[-–]\d{4})\s*h[oọ]c\s*k[yỳì]\s*(\d)/i);
      if (semMatch) {
        metadata.semester = `${semMatch[1]}-HK${semMatch[2]}`;
      }
    }
    // Also try "Năm học 2025-2026 học kỳ 2"
    const yearMatch = rowStr.match(/[Nn][aăm]+\s*h[oọ]c\s*(\d{4})\s*[-–]\s*(\d{4})\s*h[oọ]c\s*k[yỳì]\s*(\d)/);
    if (yearMatch) {
      metadata.semester = `${yearMatch[1]}-${yearMatch[2]}-HK${yearMatch[3]}`;
    }

    // Look for instructor
    if (rowStr.includes("Giảng viên") || rowStr.includes("Gi ng vi n")) {
      const parts = rowStr.split(/[:\t]/);
      if (parts.length > 1) {
        metadata.instructor = parts[parts.length - 1].trim();
      }
    }

    // Look for course name
    if (rowStr.includes("Lập trình") || rowStr.includes("hướng đối tượng") || rowStr.includes("OOP")) {
      metadata.courseName = "Lập trình hướng đối tượng";
    }

    // Look for "Lớp học phần" label
    if (rowStr.includes("Lớp học phần") || rowStr.includes("L p h c ph n")) {
      metadata.sectionName = metadata.sectionName || rowStr.replace(/.*[:\t]\s*/, "").trim();
    }

    // Look for "Môn học" / course name
    if (rowStr.includes("Môn học") || rowStr.includes("M n h c")) {
      const mparts = rowStr.split(/[:\t]/);
      if (mparts.length > 1) {
        metadata.courseName = mparts[mparts.length - 1].trim();
      }
    }
  }

  // Fallback semester
  if (!metadata.semester) {
    metadata.semester = "2025-2026-HK2";
  }
  if (!metadata.sectionName) {
    metadata.sectionName = metadata.courseCode || "Unknown Section";
  }

  // Find the data table by looking for header row with STT / Mã SV
  let headerRowIdx = -1;
  let colMapping: { stt: number; mssv: number; name: number; dob: number; class: number } = {
    stt: -1, mssv: -1, name: -1, dob: -1, class: -1,
  };

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;

    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j]).trim().toLowerCase();
      if (cell === "stt" || cell === "tt") colMapping.stt = j;
      if (cell.includes("mã sv") || cell.includes("ma sv") || cell === "mã sv") colMapping.mssv = j;
      if (cell.includes("họ và tên") || cell.includes("ho va ten") || cell.includes("họ tên")) colMapping.name = j;
      if (cell.includes("ngày sinh") || cell.includes("ngay sinh")) colMapping.dob = j;
      if (cell.includes("lớp") || cell === "lop" || cell === "lớp") colMapping.class = j;
    }

    if (colMapping.stt >= 0 && colMapping.mssv >= 0 && colMapping.name >= 0) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx < 0) {
    throw new Error("Could not find student data table header (STT, Mã SV, Họ và tên)");
  }

  // Parse student rows
  const students: RosterStudent[] = [];
  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;

    const sttVal = String(row[colMapping.stt] || "").trim();
    const studentId = String(row[colMapping.mssv] || "").trim();
    const fullName = String(row[colMapping.name] || "").trim();
    const dob = colMapping.dob >= 0 ? String(row[colMapping.dob] || "").trim() : "";
    const className = colMapping.class >= 0 ? String(row[colMapping.class] || "").trim() : "";

    // Skip if no student ID (probably end of data or summary row)
    if (!studentId || !fullName) continue;
    // Skip summary rows like "Tổng số sinh viên"
    if (fullName.includes("Tổng số") || fullName.includes("sinh viên")) break;

    const stt = parseInt(sttVal) || students.length + 1;

    students.push({ stt, studentId, fullName, dateOfBirth: dob, className });
  }

  return { metadata, students };
}

// ─── Import Service ──────────────────────────────────────────────────────────

/**
 * Import a class roster: creates section, creates student accounts, enrolls students.
 * - Creates class section from file metadata
 * - Creates student accounts with username=password=MSSV, mustChangePassword=1
 * - Enrolls students in the section
 */
export async function importClassRoster(
  buffer: Buffer,
  instructorId: string | null,
  database = defaultDb
): Promise<RosterImportReport> {
  const { metadata, students } = parseRosterFile(buffer);

  const now = new Date().toISOString();

  // 1. Create or find the class section
  const sectionId = crypto.randomUUID();
  const sectionName = metadata.sectionName || "Imported Section";

  const [_section] = await database
    .insert(classSections)
    .values({
      id: sectionId,
      name: sectionName,
      semester: metadata.semester,
      instructorId: instructorId,
      createdAt: now,
    })
    .returning();

  // 2. Import students
  const report: RosterImportReport = {
    section: { id: sectionId, name: sectionName, semester: metadata.semester },
    imported: 0,
    skipped: [],
    total: students.length,
  };

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const rowNum = i + 1;

    if (!student.studentId) {
      report.skipped.push({ row: rowNum, reason: "Missing student ID" });
      continue;
    }

    try {
      // Check if user already exists by username (MSSV)
      let user = await database.query.users.findFirst({
        where: eq(users.username, student.studentId),
      });

      if (!user) {
        // Create new user: username=password=MSSV
        const userId = crypto.randomUUID();
        const passwordHash = await bcrypt.hash(student.studentId, 12);
        const email = `${student.studentId}@vnu.edu.vn`; // Generate email from MSSV

        const [newUser] = await database
          .insert(users)
          .values({
            id: userId,
            username: student.studentId,
            email,
            passwordHash,
            role: "student",
            fullName: student.fullName,
            mustChangePassword: 1,
            failedLoginAttempts: 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        user = newUser;
      }

      // Enroll in section
      const enrollmentId = crypto.randomUUID();
      await database
        .insert(sectionEnrollments)
        .values({
          id: enrollmentId,
          sectionId,
          studentId: user.id,
          studentExternalId: student.studentId,
          enrolledAt: now,
        })
        .onConflictDoNothing();

      report.imported++;
    } catch (err) {
      report.skipped.push({
        row: rowNum,
        studentId: student.studentId,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return report;
}
