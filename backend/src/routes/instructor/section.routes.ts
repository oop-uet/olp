import { Router, Request, Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { db } from "../../db/index.js";
import { classSections, sectionEnrollments, users, exerciseAssignments, exercises, submissions } from "../../db/schema.js";
import { getSectionDetail, unassignExercise, isSectionError } from "../../services/section.service.js";
import { getStudentProgress } from "../../services/submission.service.js";
import { registerScheduleRoutes } from "../schedule.helper.js";
import { importStudents, exportStudents, parseFile } from "../../services/import.service.js";

const router = Router();

/**
 * GET /api/instructor/sections
 * List sections assigned to the current instructor (admins see all).
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const sections =
      role === "admin"
        ? await db.query.classSections.findMany({ with: { instructor: true } })
        : await db.query.classSections.findMany({
            where: eq(classSections.instructorId, userId),
            with: { instructor: true },
          });
    res.status(200).json(sections);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * GET /api/instructor/sections/:id/detail
 * Section detail (students + assigned exercises). Instructor must own the section.
 */
router.get("/:id/detail", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const result = await getSectionDetail(req.params.id);
    if (isSectionError(result)) {
      res.status(404).json({ error: result.error });
      return;
    }
    // Ownership check (admins bypass)
    if (role !== "admin" && result.section.instructorId !== userId) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." },
      });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * DELETE /api/instructor/sections/:id/exercises/:exerciseId
 * Unassign an exercise from a section the instructor owns.
 */
router.delete("/:id/exercises/:exerciseId", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const detail = await getSectionDetail(req.params.id);
    if (isSectionError(detail)) {
      res.status(404).json({ error: detail.error });
      return;
    }
    if (role !== "admin" && detail.section.instructorId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }
    const result = await unassignExercise(req.params.id, req.params.exerciseId);
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * DELETE /api/instructor/sections/:id/students/:studentId
 * Remove a student's enrollment from a section the instructor owns.
 */
/**
 * DELETE /api/instructor/sections/:id/students/:studentId
 * Remove a student's enrollment from a section the instructor owns.
 */
router.delete("/:id/students/:studentId", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const section = await db.query.classSections.findFirst({
      where: eq(classSections.id, req.params.id),
    });
    if (!section) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Không tìm thấy lớp." } });
      return;
    }
    if (role !== "admin" && section.instructorId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }
    await db
      .delete(sectionEnrollments)
      .where(
        and(
          eq(sectionEnrollments.sectionId, req.params.id),
          eq(sectionEnrollments.studentId, req.params.studentId)
        )
      );
    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * POST /api/instructor/sections/:id/students
 * Manually enroll a student into a section the instructor owns.
 */
router.post("/:id/students", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const { studentId, fullName, email } = req.body;

    if (!studentId || !fullName || !email) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "MSSV, Họ tên và Email là bắt buộc." } });
      return;
    }

    const section = await db.query.classSections.findFirst({
      where: eq(classSections.id, req.params.id),
    });
    if (!section) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Không tìm thấy lớp." } });
      return;
    }
    if (role !== "admin" && section.instructorId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }

    // Check if enrollment already exists
    const existingEnrollment = await db.query.sectionEnrollments.findFirst({
      where: and(
        eq(sectionEnrollments.sectionId, req.params.id),
        eq(sectionEnrollments.studentExternalId, studentId)
      ),
    });
    if (existingEnrollment) {
      res.status(409).json({ error: { code: "DUPLICATE", message: "Sinh viên đã được ghi danh vào lớp này." } });
      return;
    }

    // Find or create user by email
    let studentUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase().trim()),
    });

    if (!studentUser) {
      const newUserId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(studentId, 12);
      const now = new Date().toISOString();

      const [newUser] = await db
        .insert(users)
        .values({
          id: newUserId,
          username: studentId,
          email: email.toLowerCase().trim(),
          passwordHash,
          role: "student",
          fullName,
          mustChangePassword: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      studentUser = newUser;
    }

    // Create enrollment
    const enrollmentId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.insert(sectionEnrollments).values({
      id: enrollmentId,
      sectionId: req.params.id,
      studentId: studentUser.id,
      studentExternalId: studentId,
      enrolledAt: now,
    });

    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * POST /api/instructor/sections/:id/students/:studentId/reset-password
 * Reset a student's password to their student code.
 */
router.post("/:id/students/:studentId/reset-password", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const section = await db.query.classSections.findFirst({
      where: eq(classSections.id, req.params.id),
    });
    if (!section) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Không tìm thấy lớp." } });
      return;
    }
    if (role !== "admin" && section.instructorId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }

    const studentUser = await db.query.users.findFirst({
      where: eq(users.id, req.params.studentId),
    });
    if (!studentUser) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Không tìm thấy tài khoản sinh viên." } });
      return;
    }

    // Default password is their username (student code)
    const newPasswordHash = await bcrypt.hash(studentUser.username, 12);
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        mustChangePassword: 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, req.params.studentId));

    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * PUT /api/instructor/sections/:id/students/:studentId
 * Update a student's profile information.
 */
router.put("/:id/students/:studentId", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const { fullName, email } = req.body;

    const section = await db.query.classSections.findFirst({
      where: eq(classSections.id, req.params.id),
    });
    if (!section) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Không tìm thấy lớp." } });
      return;
    }
    if (role !== "admin" && section.instructorId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }

    await db
      .update(users)
      .set({
        ...(fullName && { fullName }),
        ...(email && { email: email.toLowerCase().trim() }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, req.params.studentId));

    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * POST /api/instructor/sections/:id/import-students
 * Import student rosters.
 */
router.post("/:id/import-students", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const section = await db.query.classSections.findFirst({
      where: eq(classSections.id, req.params.id),
    });
    if (!section) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Không tìm thấy lớp." } });
      return;
    }
    if (role !== "admin" && section.instructorId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }

    let buffer: Buffer;
    const { data, filename } = req.body;
    if (data && typeof data === "string") {
      buffer = Buffer.from(data, "base64");
    } else {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "File data is missing." } });
      return;
    }

    const rows = parseFile(buffer, filename);
    if (rows.length === 0) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "File rỗng." } });
      return;
    }

    const report = await importStudents(req.params.id, rows);
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred during import." } });
  }
});

/**
 * GET /api/instructor/sections/:id/export-students
 * Export students enrolled.
 */
router.get("/:id/export-students", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const section = await db.query.classSections.findFirst({
      where: eq(classSections.id, req.params.id),
    });
    if (!section) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Không tìm thấy lớp." } });
      return;
    }
    if (role !== "admin" && section.instructorId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }

    const result = await exportStudents(req.params.id);
    if ("error" in result) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="students-${section.name}.csv"`);
    res.status(200).send(result.csv);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred during export." } });
  }
});

/**
 * GET /api/instructor/sections/:id/students/:studentId/progress
 * Return a student's progress in a section the instructor owns.
 */
router.get("/:id/students/:studentId/progress", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const section = await db.query.classSections.findFirst({
      where: eq(classSections.id, req.params.id),
    });
    if (!section) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Không tìm thấy lớp." } });
      return;
    }
    if (role !== "admin" && section.instructorId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }
    const progress = await getStudentProgress(req.params.studentId, req.params.id);
    res.status(200).json(progress);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

async function loadOwnedSection(sectionId: string, userId: string, role: string) {
  const section = await db.query.classSections.findFirst({
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

function scoreOf(submission: { score: number | null; manualScore?: number | null }) {
  return submission.manualScore ?? submission.score ?? 0;
}

function buildStudentStatistics(
  enrollments: any[],
  assigned: Array<{ exerciseId: string }>,
  sectionSubmissions: Array<{ studentId: string; exerciseId: string; score: number | null; manualScore?: number | null }>
) {
  const totalPossible = assigned.length * 100;
  const assignedIds = assigned.map((ex) => ex.exerciseId);

  const rows = enrollments.map((enrollment) => {
    const studentSubmissions = sectionSubmissions.filter((sub) => sub.studentId === enrollment.userId);
    const bestByExercise = new Map<string, number>();

    for (const sub of studentSubmissions) {
      if (!assignedIds.includes(sub.exerciseId)) continue;
      const currentBest = bestByExercise.get(sub.exerciseId) ?? 0;
      bestByExercise.set(sub.exerciseId, Math.max(currentBest, scoreOf(sub)));
    }

    let totalScore = 0;
    let completedExercises = 0;
    for (const exerciseId of assignedIds) {
      const score = bestByExercise.get(exerciseId) ?? 0;
      totalScore += score;
      if (score >= 100) completedExercises++;
    }

    return {
      userId: enrollment.userId,
      studentId: enrollment.studentExternalId || enrollment.username,
      username: enrollment.username,
      fullName: enrollment.fullName ?? enrollment.username,
      email: enrollment.email,
      className: enrollment.className ?? "",
      attemptedExercises: bestByExercise.size,
      completedExercises,
      attemptCount: studentSubmissions.length,
      totalScore: Math.round(totalScore * 100) / 100,
      totalPossible,
      completionPercent: totalPossible > 0 ? Math.round((totalScore / totalPossible) * 10000) / 100 : 0,
    };
  });

  const sorted = [...rows].sort((a, b) => b.totalScore - a.totalScore);
  return rows.map((row) => ({
    ...row,
    rank: sorted.findIndex((item) => item.userId === row.userId) + 1,
  }));
}

/**
 * GET /api/instructor/sections/:id/stats
 * Aggregate submission and completion stats for each assigned exercise.
 */
router.get("/:id/stats", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const sectionId = req.params.id;

    const loaded = await loadOwnedSection(sectionId, userId, role);
    if (loaded.error) {
      const error = loaded.error;
      res.status(error.code === "NOT_FOUND" ? 404 : 403).json({ error });
      return;
    }

    // Get all enrolled students
    const enrollments = await db
      .select({
        enrollmentId: sectionEnrollments.id,
        userId: users.id,
        username: users.username,
        email: users.email,
        fullName: users.fullName,
        studentExternalId: sectionEnrollments.studentExternalId,
      })
      .from(sectionEnrollments)
      .innerJoin(users, eq(sectionEnrollments.studentId, users.id))
      .where(eq(sectionEnrollments.sectionId, sectionId));
    const totalStudents = enrollments.length;

    // Get all assigned exercises
    const assigned = await db
      .select({
        assignmentId: exerciseAssignments.id,
        exerciseId: exerciseAssignments.exerciseId,
        title: exercises.title,
        difficulty: exercises.difficulty,
      })
      .from(exerciseAssignments)
      .innerJoin(exercises, eq(exerciseAssignments.exerciseId, exercises.id))
      .where(eq(exerciseAssignments.sectionId, sectionId));

    // For each exercise, calculate attempts and completion
    const sectionSubmissions = await db
      .select({
        id: submissions.id,
        studentId: submissions.studentId,
        exerciseId: submissions.exerciseId,
        score: submissions.score,
        manualScore: submissions.manualScore,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .where(eq(submissions.sectionId, sectionId));

    const statsList = [];
    for (const ex of assigned) {
      // Find highest score per student for this exercise and section
      const studentSubmissions = sectionSubmissions.filter((sub) => sub.exerciseId === ex.exerciseId);

      const highestScoresByStudent = new Map<string, number>();
      for (const sub of studentSubmissions) {
        const currentBest = highestScoresByStudent.get(sub.studentId) ?? 0;
        highestScoresByStudent.set(sub.studentId, Math.max(currentBest, scoreOf(sub)));
      }

      let attemptedCount = 0;
      let completedCount = 0;
      let totalScoreSum = 0;

      highestScoresByStudent.forEach((score) => {
        attemptedCount++;
        if (score >= 100) completedCount++;
        totalScoreSum += score;
      });

      const averageScore = attemptedCount > 0 ? totalScoreSum / attemptedCount : 0;

      statsList.push({
        exerciseId: ex.exerciseId,
        title: ex.title,
        difficulty: ex.difficulty,
        attemptedCount,
        completedCount,
        averageScore,
      });
    }

    res.status(200).json({
      totalStudents,
      exercises: statsList,
      students: buildStudentStatistics(enrollments, assigned, sectionSubmissions),
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * GET /api/instructor/sections/:id/students/:studentId/profile
 * Detailed student profile: summary, submission history and chart-ready data.
 */
router.get("/:id/students/:studentId/profile", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    const sectionId = req.params.id;
    const studentUserId = req.params.studentId;

    const loaded = await loadOwnedSection(sectionId, userId, role);
    if (loaded.error) {
      const error = loaded.error;
      res.status(error.code === "NOT_FOUND" ? 404 : 403).json({ error });
      return;
    }

    const enrollmentRows = await db
      .select({
        enrollmentId: sectionEnrollments.id,
        userId: users.id,
        username: users.username,
        email: users.email,
        fullName: users.fullName,
        studentExternalId: sectionEnrollments.studentExternalId,
      })
      .from(sectionEnrollments)
      .innerJoin(users, eq(sectionEnrollments.studentId, users.id))
      .where(eq(sectionEnrollments.sectionId, sectionId));

    const enrollment = enrollmentRows.find((row) => row.userId === studentUserId);
    if (!enrollment) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Sinh viên không thuộc lớp này." } });
      return;
    }

    const assigned = await db
      .select({
        exerciseId: exerciseAssignments.exerciseId,
        title: exercises.title,
        difficulty: exercises.difficulty,
        week: exerciseAssignments.week,
        deadline: exerciseAssignments.deadline,
      })
      .from(exerciseAssignments)
      .innerJoin(exercises, eq(exerciseAssignments.exerciseId, exercises.id))
      .where(eq(exerciseAssignments.sectionId, sectionId));

    const allSectionSubmissions = await db
      .select({
        id: submissions.id,
        studentId: submissions.studentId,
        exerciseId: submissions.exerciseId,
        score: submissions.score,
        manualScore: submissions.manualScore,
        attemptNumber: submissions.attemptNumber,
        submittedAt: submissions.submittedAt,
        exerciseTitle: exercises.title,
      })
      .from(submissions)
      .innerJoin(exercises, eq(submissions.exerciseId, exercises.id))
      .where(eq(submissions.sectionId, sectionId))
      .orderBy(desc(submissions.submittedAt));

    const statsRows = buildStudentStatistics(enrollmentRows, assigned, allSectionSubmissions);
    const summary = statsRows.find((row) => row.userId === studentUserId)!;
    const studentSubmissions = allSectionSubmissions.filter((sub) => sub.studentId === studentUserId);

    const progress = assigned.map((exercise) => {
      const related = studentSubmissions.filter((sub) => sub.exerciseId === exercise.exerciseId);
      const bestScore = related.reduce((best, sub) => Math.max(best, scoreOf(sub)), 0);
      const latest = related[0]?.submittedAt ?? null;
      return {
        exerciseId: exercise.exerciseId,
        title: exercise.title,
        difficulty: exercise.difficulty,
        week: exercise.week ?? null,
        deadline: exercise.deadline ?? null,
        bestScore,
        attemptCount: related.length,
        lastSubmittedAt: latest,
        status: bestScore >= 100 ? "completed" : related.length > 0 ? "in_progress" : "not_started",
      };
    });

    res.status(200).json({
      section: {
        id: loaded.section.id,
        name: loaded.section.name,
        semester: loaded.section.semester,
      },
      student: {
        userId: enrollment.userId,
        studentId: enrollment.studentExternalId || enrollment.username,
        username: enrollment.username,
        fullName: enrollment.fullName ?? enrollment.username,
        email: enrollment.email,
      },
      summary,
      submissions: studentSubmissions.map((sub) => ({
        id: sub.id,
        exerciseId: sub.exerciseId,
        exerciseTitle: sub.exerciseTitle,
        score: sub.score,
        manualScore: sub.manualScore,
        effectiveScore: scoreOf(sub),
        attemptNumber: sub.attemptNumber,
        submittedAt: sub.submittedAt,
        status: scoreOf(sub) >= 100 ? "finished" : "submitted",
      })),
      progress,
    });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

// Week-based schedule endpoints (GET/POST/PUT under /:id/schedule)
registerScheduleRoutes(router);

export default router;
