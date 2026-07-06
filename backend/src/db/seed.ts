import "dotenv/config";
import { db } from "./index.js";
import { users, systemConfig, classSections, sectionInstructors, sectionEnrollments, exercises, exerciseAssignments } from "./schema.js";
import bcrypt from "bcrypt";
import crypto from "node:crypto";

async function seed() {
  console.log("🌱 Seeding database...");

  const now = new Date().toISOString();

  // ─── Seed default admin account ──────────────────────────────────────────────

  const adminId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash("admin123", 12);

  await db
    .insert(users)
    .values({
      id: adminId,
      username: "admin",
      email: "admin@uet.vnu.edu.vn",
      passwordHash,
      role: "admin",
      failedLoginAttempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  console.log("✅ Default admin account created (username: admin)");

  // ─── Seed UET Instructor (credentials.txt) ───────────────────────────────────

  const instructorId = crypto.randomUUID();
  const instructorPasswordHash = await bcrypt.hash("@Kvt0789369259", 12);

  await db
    .insert(users)
    .values({
      id: instructorId,
      username: "tuyenkv",
      email: "tuyenkv@uet.vnu.edu.vn",
      fullName: "Nguyễn Văn Tuyên",
      passwordHash: instructorPasswordHash,
      role: "instructor",
      failedLoginAttempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  console.log("✅ Instructor account created (username: tuyenkv)");

  // ─── Seed UET Student (student_credential.text) ──────────────────────────────

  const studentId = crypto.randomUUID();
  const studentPasswordHash = await bcrypt.hash("20021287", 12);

  await db
    .insert(users)
    .values({
      id: studentId,
      username: "20021287",
      email: "20021287@vnu.edu.vn",
      fullName: "Phạm Văn Minh",
      passwordHash: studentPasswordHash,
      role: "student",
      failedLoginAttempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  console.log("✅ Student account created (username: 20021287)");

  // ─── Seed Class Section ──────────────────────────────────────────────────────

  const sectionId = crypto.randomUUID();
  await db
    .insert(classSections)
    .values({
      id: sectionId,
      name: "OOP Lớp INT2204 8",
      semester: "Học kỳ 1 2026-2027",
      instructorId: instructorId,
      createdAt: now,
    })
    .onConflictDoNothing();

  console.log("✅ Class section created: OOP Lớp INT2204 8");

  await db
    .insert(sectionInstructors)
    .values({
      id: crypto.randomUUID(),
      sectionId,
      instructorId,
      isPrimary: 1,
      assignedAt: now,
    })
    .onConflictDoNothing();

  console.log("✅ Primary instructor assigned to class section");

  // Enroll Student
  await db
    .insert(sectionEnrollments)
    .values({
      id: crypto.randomUUID(),
      sectionId: sectionId,
      studentId: studentId,
      studentExternalId: "20021287",
      enrolledAt: now,
    })
    .onConflictDoNothing();

  console.log("✅ Enrolled student 20021287 into class section");

  // ─── Seed system_config defaults ─────────────────────────────────────────────

  const configDefaults = [
    {
      key: "warning_threshold",
      value: "3",
      validRange: "1-10",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "time_limit",
      value: "60",
      validRange: "1-180",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "max_submissions",
      value: "10",
      validRange: "1-100",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "source_check_enabled",
      value: "0",
      validRange: "0-1",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "source_check_weekly_enabled",
      value: "0",
      validRange: "0-1",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "source_check_similarity_threshold",
      value: "70",
      validRange: "40-95",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "source_check_max_runtime_minutes",
      value: "20",
      validRange: "5-120",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "source_check_provider",
      value: "jplag",
      validRange: "enum:jplag,pmd_cpd,dolos",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "style_check_enabled",
      value: "1",
      validRange: "0-1",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "style_check_weight_percent",
      value: "10",
      validRange: "0-50",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "style_check_penalty_per_violation",
      value: "5",
      validRange: "1-20",
      updatedAt: now,
      updatedBy: null,
    },
    {
      key: "style_check_max_penalized_violations",
      value: "20",
      validRange: "1-100",
      updatedAt: now,
      updatedBy: null,
    },
  ];

  for (const config of configDefaults) {
    await db.insert(systemConfig).values(config).onConflictDoNothing();
  }

  console.log("✅ System configuration defaults seeded");

  // ─── Assign Exercises to Section ─────────────────────────────────────────────

  const libraryExercises = await db.select().from(exercises);
  if (libraryExercises.length > 0) {
    for (const ex of libraryExercises) {
      const weekMatch = ex.title.match(/Tuần\s+(\d+)/i);
      const week = weekMatch ? Number.parseInt(weekMatch[1], 10) : null;
      const isAssessment = ex.title.includes("Quản lý sinh viên") || ex.title.includes("Phân số") ? 1 : 0;
      await db
        .insert(exerciseAssignments)
        .values({
          id: crypto.randomUUID(),
          exerciseId: ex.id,
          sectionId: sectionId,
          isAssessment,
          isVisible: 0,
          allowSubmission: 1,
          deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days
          week,
          assignedAt: now,
        })
        .onConflictDoNothing();
    }
    console.log(`✅ Assigned ${libraryExercises.length} exercises to class section`);
  }

  console.log("\n🎉 Seeding complete!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seeding failed:", error);
  process.exit(1);
});
