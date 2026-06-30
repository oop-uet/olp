import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import {
  parseCSV,
  parseExcel,
  parseFile,
  isValidEmail,
  validateStudentImportRow,
  importStudents,
  exportStudents,
} from "./import.service.js";

// ─── Helper: create a test database instance ────────────────────────────────

function getDb() {
  return drizzle(getTestSqlite(), { schema });
}

// ─── Helper: seed a class section ───────────────────────────────────────────

function seedSection(sectionId = "section-1") {
  const sqlite = getTestSqlite();
  sqlite.exec(`PRAGMA foreign_keys = OFF;`);
  sqlite.exec(`
    INSERT OR IGNORE INTO class_sections (id, name, semester, created_at)
    VALUES ('${sectionId}', 'OOP 2024', '2024-1', '${new Date().toISOString()}');
  `);
}

// ─── Helper: seed a student user and enrollment ─────────────────────────────

function seedStudentWithEnrollment(
  sectionId: string,
  studentExternalId: string,
  userId: string,
  email: string
) {
  const sqlite = getTestSqlite();
  sqlite.exec(`PRAGMA foreign_keys = OFF;`);
  const now = new Date().toISOString();
  sqlite.exec(`
    INSERT OR IGNORE INTO users (id, username, email, password_hash, role, failed_login_attempts, created_at, updated_at)
    VALUES ('${userId}', '${studentExternalId}', '${email}', 'hash', 'student', 0, '${now}', '${now}');
  `);
  sqlite.exec(`
    INSERT OR IGNORE INTO section_enrollments (id, section_id, student_id, student_external_id, enrolled_at)
    VALUES ('enr-${userId}', '${sectionId}', '${userId}', '${studentExternalId}', '${now}');
  `);
}

// ─── Unit Tests: Email Validation ───────────────────────────────────────────

describe("isValidEmail", () => {
  it("should return true for a valid email", () => {
    expect(isValidEmail("student@uet.vnu.edu.vn")).toBe(true);
  });

  it("should return true for common email formats", () => {
    expect(isValidEmail("user.name@example.com")).toBe(true);
    expect(isValidEmail("user+tag@domain.org")).toBe(true);
  });

  it("should return false for missing @", () => {
    expect(isValidEmail("invalidemail.com")).toBe(false);
  });

  it("should return false for missing domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("should return false for spaces in email", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
  });
});

// ─── Unit Tests: Row Validation ─────────────────────────────────────────────

describe("validateStudentImportRow", () => {
  it("should return null for a valid row", () => {
    const row = { student_id: "21020001", full_name: "Nguyen Van A", email: "a@uet.vnu.edu.vn" };
    expect(validateStudentImportRow(row)).toBeNull();
  });

  it("should return error for missing student_id", () => {
    const row = { student_id: "", full_name: "Nguyen Van A", email: "a@uet.vnu.edu.vn" };
    expect(validateStudentImportRow(row)).toContain("student_id");
  });

  it("should return error for missing full_name", () => {
    const row = { student_id: "21020001", full_name: "", email: "a@uet.vnu.edu.vn" };
    expect(validateStudentImportRow(row)).toContain("full_name");
  });

  it("should return error for missing email", () => {
    const row = { student_id: "21020001", full_name: "Nguyen Van A", email: "" };
    expect(validateStudentImportRow(row)).toContain("email");
  });

  it("should return error for malformed email", () => {
    const row = { student_id: "21020001", full_name: "Nguyen Van A", email: "not-an-email" };
    expect(validateStudentImportRow(row)).toContain("Malformed email");
  });

  it("should return error when student_id is undefined", () => {
    const row = { full_name: "Nguyen Van A", email: "a@uet.vnu.edu.vn" };
    expect(validateStudentImportRow(row)).toContain("student_id");
  });
});

// ─── Unit Tests: CSV Parsing ────────────────────────────────────────────────

describe("parseCSV", () => {
  it("should parse valid CSV data", () => {
    const csv = `student_id,full_name,email\n21020001,Nguyen Van A,a@example.com\n21020002,Tran Thi B,b@example.com`;
    const buffer = Buffer.from(csv, "utf-8");
    const rows = parseCSV(buffer);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      student_id: "21020001",
      full_name: "Nguyen Van A",
      email: "a@example.com",
    });
  });

  it("should handle UTF-8 BOM", () => {
    const csv = `\ufeffstudent_id,full_name,email\n21020001,Nguyễn Văn A,a@example.com`;
    const buffer = Buffer.from(csv, "utf-8");
    const rows = parseCSV(buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0].student_id).toBe("21020001");
  });

  it("should trim whitespace from fields", () => {
    const csv = `student_id,full_name,email\n  21020001 , Nguyen Van A , a@example.com `;
    const buffer = Buffer.from(csv, "utf-8");
    const rows = parseCSV(buffer);

    expect(rows[0].student_id).toBe("21020001");
    expect(rows[0].full_name).toBe("Nguyen Van A");
    expect(rows[0].email).toBe("a@example.com");
  });

  it("should return empty array for empty CSV (header only)", () => {
    const csv = `student_id,full_name,email\n`;
    const buffer = Buffer.from(csv, "utf-8");
    const rows = parseCSV(buffer);

    expect(rows).toHaveLength(0);
  });
});

// ─── Unit Tests: File Type Detection ────────────────────────────────────────

describe("parseFile", () => {
  it("should detect and parse CSV by default", () => {
    const csv = `student_id,full_name,email\n21020001,Name,a@ex.com`;
    const buffer = Buffer.from(csv, "utf-8");
    const rows = parseFile(buffer);

    expect(rows).toHaveLength(1);
  });

  it("should detect xlsx by filename extension", () => {
    // Create a minimal xlsx file with xlsx library
    const XLSX = require("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["student_id", "full_name", "email"],
      ["21020001", "Nguyen Van A", "a@example.com"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const rows = parseFile(buffer, "students.xlsx");
    expect(rows).toHaveLength(1);
    expect(rows[0].student_id).toBe("21020001");
  });
});

// ─── Integration Tests: importStudents ──────────────────────────────────────

describe("importStudents", () => {
  beforeEach(() => {
    seedSection("section-1");
  });

  it("should import valid students and return correct report", async () => {
    const db = getDb();
    const rows = [
      { student_id: "21020001", full_name: "Nguyen Van A", email: "a@uet.vnu.edu.vn" },
      { student_id: "21020002", full_name: "Tran Thi B", email: "b@uet.vnu.edu.vn" },
    ];

    const report = await importStudents("section-1", rows, db as any);

    expect(report.imported).toBe(2);
    expect(report.skipped).toHaveLength(0);
    expect(report.total).toBe(2);
  });

  it("should skip rows with missing required fields", async () => {
    const db = getDb();
    const rows = [
      { student_id: "", full_name: "No ID", email: "valid@email.com" },
      { student_id: "21020001", full_name: "", email: "a@uet.vnu.edu.vn" },
      { student_id: "21020002", full_name: "Valid", email: "b@uet.vnu.edu.vn" },
    ];

    const report = await importStudents("section-1", rows, db as any);

    expect(report.imported).toBe(1);
    expect(report.skipped).toHaveLength(2);
    expect(report.skipped[0].row).toBe(1);
    expect(report.skipped[0].reason).toContain("student_id");
    expect(report.skipped[1].row).toBe(2);
    expect(report.skipped[1].reason).toContain("full_name");
  });

  it("should skip rows with malformed emails", async () => {
    const db = getDb();
    const rows = [
      { student_id: "21020001", full_name: "Bad Email", email: "not-an-email" },
    ];

    const report = await importStudents("section-1", rows, db as any);

    expect(report.imported).toBe(0);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].reason).toContain("Malformed email");
  });

  it("should skip duplicate student_ids already in the section", async () => {
    const db = getDb();
    seedStudentWithEnrollment("section-1", "21020001", "user-existing-1", "existing@uet.vnu.edu.vn");

    const rows = [
      { student_id: "21020001", full_name: "Duplicate", email: "new@uet.vnu.edu.vn" },
      { student_id: "21020002", full_name: "New Student", email: "new2@uet.vnu.edu.vn" },
    ];

    const report = await importStudents("section-1", rows, db as any);

    expect(report.imported).toBe(1);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].reason).toContain("already enrolled");
  });

  it("should skip students already enrolled in another section", async () => {
    const db = getDb();
    seedSection("section-2");
    seedStudentWithEnrollment("section-2", "21020001", "user-existing-1", "existing@uet.vnu.edu.vn");

    const rows = [
      { student_id: "21020001", full_name: "Existing Student", email: "existing@uet.vnu.edu.vn" },
      { student_id: "21020002", full_name: "New Student", email: "new2@uet.vnu.edu.vn" },
    ];

    const report = await importStudents("section-1", rows, db as any);

    expect(report.imported).toBe(1);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].reason).toContain("already enrolled in another section");
  });

  it("should skip in-batch duplicate student_ids", async () => {
    const db = getDb();
    const rows = [
      { student_id: "21020001", full_name: "First", email: "first@uet.vnu.edu.vn" },
      { student_id: "21020001", full_name: "Duplicate", email: "dup@uet.vnu.edu.vn" },
    ];

    const report = await importStudents("section-1", rows, db as any);

    expect(report.imported).toBe(1);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].row).toBe(2);
    expect(report.skipped[0].reason).toContain("already enrolled");
  });

  it("should reuse existing user if email already exists", async () => {
    const db = getDb();
    const sqlite = getTestSqlite();
    const now = new Date().toISOString();
    sqlite.exec(`PRAGMA foreign_keys = OFF;`);
    sqlite.exec(`
      INSERT INTO users (id, username, email, password_hash, role, failed_login_attempts, created_at, updated_at)
      VALUES ('existing-user', '21020001', 'existing@uet.vnu.edu.vn', 'hash', 'student', 0, '${now}', '${now}');
    `);

    const rows = [
      { student_id: "21020001", full_name: "Existing User", email: "existing@uet.vnu.edu.vn" },
    ];

    const report = await importStudents("section-1", rows, db as any);

    expect(report.imported).toBe(1);

    // Verify enrollment was created for the existing user
    const enrollments = sqlite.prepare("SELECT * FROM section_enrollments WHERE student_id = 'existing-user'").all();
    expect(enrollments).toHaveLength(1);
  });

  it("should return section not found when section does not exist", async () => {
    const db = getDb();
    const rows = [
      { student_id: "21020001", full_name: "Student", email: "s@uet.vnu.edu.vn" },
    ];

    const report = await importStudents("nonexistent-section", rows, db as any);

    expect(report.imported).toBe(0);
    expect(report.skipped[0].reason).toBe("Section not found");
  });
});

// ─── Integration Tests: exportStudents ──────────────────────────────────────

describe("exportStudents", () => {
  beforeEach(() => {
    seedSection("section-1");
  });

  it("should export enrolled students as CSV", async () => {
    const db = getDb();
    seedStudentWithEnrollment("section-1", "21020001", "user-1", "a@uet.vnu.edu.vn");

    const result = await exportStudents("section-1", db as any);

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.csv).toContain("student_id,full_name,email,enrollment_date,current_score");
      expect(result.csv).toContain("21020001");
      expect(result.csv).toContain("a@uet.vnu.edu.vn");
      expect(result.rows).toHaveLength(1);
    }
  });

  it("should return error for non-existent section", async () => {
    const db = getDb();
    const result = await exportStudents("nonexistent", db as any);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("should return empty CSV (header only) for section with no enrollments", async () => {
    const db = getDb();
    const result = await exportStudents("section-1", db as any);

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.rows).toHaveLength(0);
      expect(result.csv).toBe("student_id,full_name,email,enrollment_date,current_score");
    }
  });

  it("should compute current_score from submissions", async () => {
    const db = getDb();
    const sqlite = getTestSqlite();
    sqlite.exec(`PRAGMA foreign_keys = OFF;`);
    const now = new Date().toISOString();

    // Create user, section enrollment, exercise, and submissions
    sqlite.exec(`
      INSERT INTO users (id, username, email, password_hash, role, failed_login_attempts, created_at, updated_at)
      VALUES ('student-1', '21020001', 'a@uet.vnu.edu.vn', 'hash', 'student', 0, '${now}', '${now}');
    `);
    sqlite.exec(`
      INSERT INTO section_enrollments (id, section_id, student_id, student_external_id, enrolled_at)
      VALUES ('enr-1', 'section-1', 'student-1', '21020001', '${now}');
    `);
    sqlite.exec(`
      INSERT INTO exercises (id, title, description, difficulty, oop_tags, created_at, updated_at)
      VALUES ('ex-1', 'Exercise 1', 'Desc', 'easy', '["classes"]', '${now}', '${now}');
    `);
    sqlite.exec(`
      INSERT INTO submissions (id, student_id, exercise_id, section_id, code, score, attempt_number, submitted_at)
      VALUES ('sub-1', 'student-1', 'ex-1', 'section-1', 'code', 85.5, 1, '${now}');
    `);
    sqlite.exec(`
      INSERT INTO submissions (id, student_id, exercise_id, section_id, code, score, attempt_number, submitted_at)
      VALUES ('sub-2', 'student-1', 'ex-1', 'section-1', 'code2', 92.0, 2, '${now}');
    `);

    const result = await exportStudents("section-1", db as any);

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_score).toBe("92.00"); // Highest score for ex-1
    }
  });
});
