import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import {
  approveAllPredictedScores,
  assignAssessment,
  createAssessment,
  getAssessmentReview,
  getStudentAssessmentResult,
  getStudentAssessmentSession,
  isAssessmentError,
  processPendingAssessmentAiRuns,
  publishAssessment,
  reviewAssessmentAnswer,
  retryAssessmentAiGrade,
  saveAssessmentAnswers,
  startAssessmentSession,
  submitAssessmentSession,
  type AssessmentDraftInput,
} from "./assessment.service.js";

function getDb() {
  return drizzle(getTestSqlite(), { schema }) as any;
}

function seedUsersAndSection() {
  const sqlite = getTestSqlite();
  const instructorId = randomUUID();
  const studentId = randomUUID();
  const sectionId = randomUUID();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, 'hash', 'instructor', ?, ?)`
    )
    .run(instructorId, "teacher_assessment", "teacher_assessment@test.com", now, now);
  sqlite
    .prepare(
      `INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, 'hash', 'student', ?, ?)`
    )
    .run(studentId, "24000001", "24000001@test.com", now, now);
  sqlite
    .prepare(
      `INSERT INTO class_sections (id, name, semester, instructor_id, created_at)
       VALUES (?, 'OOP Assessment', '2026-1', ?, ?)`
    )
    .run(sectionId, instructorId, now);
  sqlite
    .prepare(
      `INSERT INTO section_instructors (id, section_id, instructor_id, is_primary, assigned_at)
       VALUES (?, ?, ?, 1, ?)`
    )
    .run(randomUUID(), sectionId, instructorId, now);
  sqlite
    .prepare(
      `INSERT INTO section_enrollments (id, section_id, student_id, student_external_id, enrolled_at)
       VALUES (?, ?, ?, '24000001', ?)`
    )
    .run(randomUUID(), sectionId, studentId, now);
  return { instructorId, studentId, sectionId };
}

function validDraft(): AssessmentDraftInput {
  return {
    title: "Giữa kỳ OOP",
    instructions: "Không dùng tài liệu",
    durationMinutes: 90,
    totalPoints: 10,
    sections: [
      {
        title: "Phần 1",
        questions: [
          {
            type: "true_false",
            prompt: "Interface bắt buộc có ít nhất một phương thức.",
            points: 5,
            gradingMode: "auto",
            answerKey: false,
          },
          {
            type: "essay",
            prompt: "Giải thích upcasting và downcasting.",
            points: 5,
            gradingMode: "llm_assisted",
            referenceAnswer: "Upcasting chuyển tham chiếu lớp con lên lớp cha; downcasting theo chiều ngược lại.",
            gradingPrompt: "Chấp nhận ví dụ tương đương.",
            rubric: [
              { id: "upcasting", criterion: "Giải thích upcasting", points: 2.5 },
              { id: "downcasting", criterion: "Giải thích downcasting", points: 2.5 },
            ],
          },
        ],
      },
    ],
  };
}

describe("Assessment service", () => {
  beforeEach(() => {
    getTestSqlite().exec("PRAGMA foreign_keys = ON;");
  });

  it("rejects a draft whose question points do not match total points", async () => {
    const db = getDb();
    const { instructorId } = seedUsersAndSection();
    const result = await createAssessment({ ...validDraft(), totalPoints: 9 }, instructorId, db);
    expect(isAssessmentError(result)).toBe(true);
    expect((result as any).error.code).toBe("VALIDATION_ERROR");
  });

  it("supports provisional score, approve all, then instructor override as official", async () => {
    const db = getDb();
    const { instructorId, studentId, sectionId } = seedUsersAndSection();
    const created = await createAssessment(validDraft(), instructorId, db);
    expect(isAssessmentError(created)).toBe(false);
    const assessment = (created as any).data;

    const published = await publishAssessment(assessment.id, instructorId, db);
    expect(isAssessmentError(published)).toBe(false);
    const assignmentResult = await assignAssessment(
      assessment.id,
      {
        sectionId,
        opensAt: new Date(Date.now() - 60_000).toISOString(),
        closesAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        durationMinutes: 90,
        showPredictedScore: true,
      },
      instructorId,
      db
    );
    expect(isAssessmentError(assignmentResult)).toBe(false);
    const assignment = (assignmentResult as any).data;

    const started = await startAssessmentSession(assignment.id, studentId, db);
    expect(isAssessmentError(started)).toBe(false);
    const sessionId = (started as any).data.id;
    const prematureApproval = await approveAllPredictedScores(assignment.id, instructorId, db);
    expect((prematureApproval as any).data.sessionsSkippedInProgress).toBe(1);
    const stillInProgress = await getStudentAssessmentSession(sessionId, studentId, db);
    expect((stillInProgress as any).data.session.status).toBe("in_progress");
    const studentView = await getStudentAssessmentSession(sessionId, studentId, db);
    expect(JSON.stringify(studentView)).not.toContain("answerKey");
    expect(JSON.stringify(studentView)).not.toContain("referenceAnswer");
    const questions = (studentView as any).data.assessment.sections[0].questions;

    await saveAssessmentAnswers(
      sessionId,
      studentId,
      [
        { questionId: questions[0].id, answer: { value: false }, clientRevision: 1 },
        { questionId: questions[1].id, answer: { text: "" }, clientRevision: 1 },
      ],
      db
    );
    const submitted = await submitAssessmentSession(sessionId, studentId, "student", db);
    expect(isAssessmentError(submitted)).toBe(false);

    const provisional = await getStudentAssessmentResult(sessionId, studentId, db);
    expect((provisional as any).data.autoScore).toBe(5);
    expect((provisional as any).data.predictedScore).toBe(5);
    expect((provisional as any).data.officialScore).toBeNull();
    expect(JSON.stringify(provisional)).not.toContain("aiSuggestedPoints");
    expect(JSON.stringify(provisional)).not.toContain("aiFeedback");

    getTestSqlite()
      .prepare("UPDATE assessment_assignments SET show_predicted_score = 0 WHERE id = ?")
      .run(assignment.id);
    const hiddenProvisional = await getStudentAssessmentResult(sessionId, studentId, db);
    expect((hiddenProvisional as any).data.predictedReady).toBe(true);
    expect((hiddenProvisional as any).data.predictedScore).toBeNull();
    getTestSqlite()
      .prepare("UPDATE assessment_assignments SET show_predicted_score = 1 WHERE id = ?")
      .run(assignment.id);

    const approved = await approveAllPredictedScores(assignment.id, instructorId, db);
    expect((approved as any).data.sessionsOfficial).toBe(1);
    const official = await getStudentAssessmentResult(sessionId, studentId, db);
    expect((official as any).data.officialScore).toBe(5);
    expect((official as any).data.reviewStatus).toBe("official");

    const review = await getAssessmentReview(sessionId, instructorId, db);
    const essayAnswer = (review as any).data.answers.find(
      (answer: any) => answer.question.gradingMode === "llm_assisted"
    );
    const adjusted = await reviewAssessmentAnswer(
      essayAnswer.id,
      {
        decision: "adjust",
        points: 4,
        feedback: "Giảng viên chấm lại: đạt phần lớn yêu cầu.",
        adjustmentReason: "Câu bỏ trống trong fixture được chấm lại để kiểm tra luồng override.",
      },
      instructorId,
      db
    );
    expect((adjusted as any).data.session.officialScore).toBe(9);
    expect((adjusted as any).data.session.reviewStatus).toBe("official");

    const retried = await retryAssessmentAiGrade(essayAnswer.id, instructorId, db);
    expect(isAssessmentError(retried)).toBe(false);
    expect((await processPendingAssessmentAiRuns(1, db)).processed).toBe(1);
    const preservedAnswer = await db.query.assessmentAnswers.findFirst({
      where: (answers: any, { eq }: any) => eq(answers.id, essayAnswer.id),
    });
    expect(preservedAnswer.finalPoints).toBe(4);
    expect(preservedAnswer.gradingState).toBe("human_adjusted");
    const preservedOfficial = await getStudentAssessmentResult(sessionId, studentId, db);
    expect((preservedOfficial as any).data.officialScore).toBe(9);
    expect((preservedOfficial as any).data.reviewStatus).toBe("official");
  });
});
