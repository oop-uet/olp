import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import { testAiConfig, updateAiConfig } from "./ai-exercise.service.js";
import {
  approveAllPredictedScores,
  assignAssessment,
  createAssessment,
  deleteAssessment,
  getAssessmentReview,
  getInstructorAssessment,
  getStudentAssessmentReview,
  getStudentAssessmentPreflight,
  getStudentAssessmentResult,
  getStudentAssessmentSession,
  isAssessmentError,
  listAssessmentSubmissions,
  listInstructorAssessments,
  listStudentAssessments,
  processPendingAssessmentAiRuns,
  recordAssessmentIntegrityEvent,
  reviewAssessmentAnswer,
  retryAssessmentAiGrade,
  saveAssessmentAnswers,
  setAssessmentQuestionFlag,
  startAssessmentSession,
  submitAssessmentSession,
  type AssessmentDraftInput,
  updateAssessment,
  updateAssessmentAssignmentWindow,
} from "./assessment.service.js";

function getDb() {
  return drizzle(getTestSqlite(), { schema }) as any;
}

const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

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
    process.env.JWT_SECRET = "test-assessment-ai-secret";
    getTestSqlite().exec("PRAGMA foreign_keys = ON;");
    getTestSqlite().exec("DELETE FROM system_config WHERE key LIKE 'ai_generation_%';");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    getTestSqlite().exec("DELETE FROM system_config WHERE key LIKE 'ai_generation_%';");
    process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
  });

  it("rejects a draft whose question points do not match total points", async () => {
    const db = getDb();
    const { instructorId } = seedUsersAndSection();
    const result = await createAssessment({ ...validDraft(), totalPoints: 9 }, instructorId, db);
    expect(isAssessmentError(result)).toBe(true);
    expect((result as any).error.code).toBe("VALIDATION_ERROR");
  });

  it("updates an assignment window without limiting it to the assessment duration", async () => {
    const db = getDb();
    const { instructorId, sectionId } = seedUsersAndSection();
    const created = await createAssessment(validDraft(), instructorId, db);
    const assigned = await assignAssessment(
      (created as any).data.id,
      {
        sectionId,
        opensAt: "2026-08-10T01:00:00.000Z",
        closesAt: "2026-08-10T03:00:00.000Z",
      },
      instructorId,
      db
    );

    const result = await updateAssessmentAssignmentWindow(
      (assigned as any).data.id,
      {
        opensAt: "2026-08-10T01:00:00.000Z",
        closesAt: "2026-08-17T01:00:00.000Z",
      },
      instructorId,
      db
    );

    expect(isAssessmentError(result)).toBe(false);
    expect((result as any).data).toMatchObject({
      opensAt: "2026-08-10T01:00:00.000Z",
      closesAt: "2026-08-17T01:00:00.000Z",
      durationMinutes: 90,
    });
  });

  it("rejects an assignment window whose closing time is not after opening", async () => {
    const db = getDb();
    const { instructorId, sectionId } = seedUsersAndSection();
    const created = await createAssessment(validDraft(), instructorId, db);
    const assigned = await assignAssessment(
      (created as any).data.id,
      {
        sectionId,
        opensAt: "2026-08-10T01:00:00.000Z",
        closesAt: "2026-08-10T03:00:00.000Z",
      },
      instructorId,
      db
    );

    const result = await updateAssessmentAssignmentWindow(
      (assigned as any).data.id,
      {
        opensAt: "2026-08-10T03:00:00.000Z",
        closesAt: "2026-08-10T03:00:00.000Z",
      },
      instructorId,
      db
    );

    expect(isAssessmentError(result)).toBe(true);
    expect((result as any).error.code).toBe("VALIDATION_ERROR");
  });

  it("does not let another instructor change an assessment assignment window", async () => {
    const db = getDb();
    const sqlite = getTestSqlite();
    const { instructorId, sectionId } = seedUsersAndSection();
    const created = await createAssessment(validDraft(), instructorId, db);
    const assigned = await assignAssessment(
      (created as any).data.id,
      {
        sectionId,
        opensAt: "2026-08-10T01:00:00.000Z",
        closesAt: "2026-08-10T03:00:00.000Z",
      },
      instructorId,
      db
    );
    const otherInstructorId = randomUUID();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, 'hash', 'instructor', ?, ?)`
      )
      .run(otherInstructorId, "other_teacher", "other_teacher@test.com", now, now);

    const result = await updateAssessmentAssignmentWindow(
      (assigned as any).data.id,
      {
        opensAt: "2026-08-11T01:00:00.000Z",
        closesAt: "2026-08-18T01:00:00.000Z",
      },
      otherInstructorId,
      db
    );

    expect(isAssessmentError(result)).toBe(true);
    expect((result as any).error.code).toBe("FORBIDDEN");
    const stored = sqlite
      .prepare("SELECT opens_at AS opensAt, closes_at AS closesAt FROM assessment_assignments WHERE id = ?")
      .get((assigned as any).data.id) as { opensAt: string; closesAt: string };
    expect(stored).toEqual({
      opensAt: "2026-08-10T01:00:00.000Z",
      closesAt: "2026-08-10T03:00:00.000Z",
    });
  });

  it("defaults to one attempt and creates separate sessions up to the configured limit", async () => {
    const db = getDb();
    const { instructorId, studentId, sectionId } = seedUsersAndSection();
    const created = await createAssessment(validDraft(), instructorId, db);
    const opensAt = new Date(Date.now() - 60_000).toISOString();
    const closesAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const assigned = await assignAssessment(
      (created as any).data.id,
      { sectionId, opensAt, closesAt },
      instructorId,
      db
    );
    const assignmentId = (assigned as any).data.id;
    expect((assigned as any).data.maxAttempts).toBe(1);

    const first = await startAssessmentSession(assignmentId, studentId, db);
    expect((first as any).data.attemptNumber).toBe(1);
    await submitAssessmentSession((first as any).data.id, studentId, "student", db);

    const deniedSecond = await startAssessmentSession(assignmentId, studentId, db);
    expect(isAssessmentError(deniedSecond)).toBe(true);
    expect((deniedSecond as any).error.code).toBe("ATTEMPT_LIMIT_REACHED");

    const updated = await updateAssessmentAssignmentWindow(
      assignmentId,
      { opensAt, closesAt, maxAttempts: 2 },
      instructorId,
      db
    );
    expect((updated as any).data.maxAttempts).toBe(2);

    const reloaded = await listInstructorAssessments(instructorId, db);
    expect((reloaded as any).data[0].assignments).toContainEqual(
      expect.objectContaining({
        id: assignmentId,
        durationMinutes: 90,
        maxAttempts: 2,
      })
    );

    const second = await startAssessmentSession(assignmentId, studentId, db);
    expect((second as any).data).toMatchObject({ attemptNumber: 2, status: "in_progress" });
    expect((second as any).data.id).not.toBe((first as any).data.id);
    const resumedSecond = await startAssessmentSession(assignmentId, studentId, db);
    expect((resumedSecond as any).data.id).toBe((second as any).data.id);

    const preflight = await getStudentAssessmentPreflight(assignmentId, studentId, db);
    expect((preflight as any).data).toMatchObject({
      maxAttempts: 2,
      attemptsUsed: 2,
      attemptsRemaining: 0,
      session: { id: (second as any).data.id, attemptNumber: 2 },
    });
    const studentList = await listStudentAssessments(studentId, db);
    expect((studentList as any).data[0]).toMatchObject({
      maxAttempts: 2,
      attemptsUsed: 2,
      session: { id: (second as any).data.id, attemptNumber: 2 },
    });
    const submissions = await listAssessmentSubmissions(assignmentId, instructorId, db);
    expect((submissions as any).data.submissions.map((row: any) => row.attemptNumber).sort()).toEqual([1, 2]);

    const invalidReduction = await updateAssessmentAssignmentWindow(
      assignmentId,
      { opensAt, closesAt, maxAttempts: 1 },
      instructorId,
      db
    );
    expect(isAssessmentError(invalidReduction)).toBe(true);
    expect((invalidReduction as any).error.code).toBe("VALIDATION_ERROR");

    await submitAssessmentSession((second as any).data.id, studentId, "student", db);
    const deniedThird = await startAssessmentSession(assignmentId, studentId, db);
    expect(isAssessmentError(deniedThird)).toBe(true);
    expect((deniedThird as any).error.code).toBe("ATTEMPT_LIMIT_REACHED");
  });

  it("bulk-saves only the newest client revision for each answer", async () => {
    const db = getDb();
    const { instructorId, studentId, sectionId } = seedUsersAndSection();
    const created = await createAssessment(validDraft(), instructorId, db);
    const assignment = await assignAssessment(
      (created as any).data.id,
      {
        sectionId,
        opensAt: new Date(Date.now() - 60_000).toISOString(),
        closesAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
      instructorId,
      db
    );
    const started = await startAssessmentSession((assignment as any).data.id, studentId, db);
    const sessionId = (started as any).data.id;
    const studentView = await getStudentAssessmentSession(sessionId, studentId, db);
    const questions = (studentView as any).data.assessment.sections[0].questions;

    await saveAssessmentAnswers(
      sessionId,
      studentId,
      [
        { questionId: questions[0].id, answer: { value: false }, clientRevision: 1 },
        { questionId: questions[1].id, answer: { text: "Bản nháp" }, clientRevision: 1 },
        { questionId: questions[1].id, answer: { text: "Bản mới nhất" }, clientRevision: 3 },
      ],
      db
    );
    await saveAssessmentAnswers(
      sessionId,
      studentId,
      [{ questionId: questions[1].id, answer: { text: "Bản cũ đến muộn" }, clientRevision: 2 }],
      db
    );

    const storedAnswers = getTestSqlite()
      .prepare(
        `SELECT question_id AS questionId, answer_json AS answerJson,
                client_revision AS clientRevision
         FROM assessment_answers WHERE session_id = ? ORDER BY question_id`
      )
      .all(sessionId) as Array<{
        questionId: string;
        answerJson: string;
        clientRevision: number;
      }>;
    expect(storedAnswers).toHaveLength(2);
    const essay = storedAnswers.find((answer) => answer.questionId === questions[1].id);
    expect(essay).toMatchObject({ clientRevision: 3 });
    expect(JSON.parse(essay!.answerJson)).toEqual({ text: "Bản mới nhất" });
  });

  it("defers future AI jobs and safely reclaims an expired worker lease", async () => {
    const db = getDb();
    const { instructorId, studentId, sectionId } = seedUsersAndSection();
    await updateAiConfig({ apiKey: "sk-test-assessment-key" }, instructorId, db);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "Tạm vượt giới hạn API." } }),
      });
    vi.stubGlobal("fetch", fetchMock);
    await testAiConfig(instructorId, db);
    const created = await createAssessment(validDraft(), instructorId, db);
    const assignment = await assignAssessment(
      (created as any).data.id,
      {
        sectionId,
        opensAt: new Date(Date.now() - 60_000).toISOString(),
        closesAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
      instructorId,
      db
    );
    const started = await startAssessmentSession((assignment as any).data.id, studentId, db);
    const sessionId = (started as any).data.id;
    const studentView = await getStudentAssessmentSession(sessionId, studentId, db);
    const questions = (studentView as any).data.assessment.sections[0].questions;
    await saveAssessmentAnswers(
      sessionId,
      studentId,
      [
        { questionId: questions[0].id, answer: { value: false }, clientRevision: 1 },
        {
          questionId: questions[1].id,
          answer: { text: "Upcasting chuyển tham chiếu lớp con lên lớp cha." },
          clientRevision: 1,
        },
      ],
      db
    );
    await submitAssessmentSession(sessionId, studentId, "student", db);

    const run = getTestSqlite()
      .prepare("SELECT id FROM assessment_ai_grading_runs WHERE status = 'queued'")
      .get() as { id: string };
    getTestSqlite()
      .prepare("UPDATE assessment_ai_grading_runs SET next_attempt_at = ? WHERE id = ?")
      .run(new Date(Date.now() + 60_000).toISOString(), run.id);
    expect((await processPendingAssessmentAiRuns(1, db)).processed).toBe(0);

    getTestSqlite()
      .prepare(
        `UPDATE assessment_ai_grading_runs
         SET status = 'running', next_attempt_at = NULL, locked_until = ? WHERE id = ?`
      )
      .run(new Date(Date.now() + 60_000).toISOString(), run.id);
    expect((await processPendingAssessmentAiRuns(1, db)).processed).toBe(0);

    getTestSqlite()
      .prepare("UPDATE assessment_ai_grading_runs SET locked_until = ? WHERE id = ?")
      .run(new Date(Date.now() - 1_000).toISOString(), run.id);
    expect((await processPendingAssessmentAiRuns(1, db)).processed).toBe(1);
    const reclaimed = getTestSqlite()
      .prepare(
        `SELECT status, attempt_count AS attemptCount, locked_until AS lockedUntil,
                next_attempt_at AS nextAttemptAt, error_code AS errorCode
         FROM assessment_ai_grading_runs WHERE id = ?`
      )
      .get(run.id) as {
        status: string;
        attemptCount: number;
        lockedUntil: string | null;
        nextAttemptAt: string;
        errorCode: string;
      };
    expect(reclaimed).toMatchObject({
      status: "queued",
      attemptCount: 1,
      lockedUntil: null,
      errorCode: "AI_REQUEST_FAILED",
    });
    expect(new Date(reclaimed.nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
    expect((await processPendingAssessmentAiRuns(1, db)).processed).toBe(0);
  });

  it("supports provisional score, approve all, then instructor override as official", async () => {
    const db = getDb();
    const { instructorId, studentId, sectionId } = seedUsersAndSection();
    const created = await createAssessment(validDraft(), instructorId, db);
    expect(isAssessmentError(created)).toBe(false);
    const assessment = (created as any).data;

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

    const reviewBeforeOfficial = await getStudentAssessmentReview(sessionId, studentId, db);
    expect(isAssessmentError(reviewBeforeOfficial)).toBe(true);
    expect((reviewBeforeOfficial as any).error.code).toBe("REVIEW_NOT_READY");

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

    const studentReview = await getStudentAssessmentReview(sessionId, studentId, db);
    expect(isAssessmentError(studentReview)).toBe(false);
    expect((studentReview as any).data.sections[0].questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "true_false",
          answer: { value: false },
          awardedPoints: 5,
        }),
        expect.objectContaining({
          type: "essay",
          answer: { text: "" },
          awardedPoints: 0,
          feedback: "Không có câu trả lời.",
        }),
      ])
    );
    expect(JSON.stringify(studentReview)).not.toContain("answerKey");
    expect(JSON.stringify(studentReview)).not.toContain("referenceAnswer");
    expect(JSON.stringify(studentReview)).not.toContain("gradingPrompt");

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

  it("stores one shuffled objective-question order per session and preserves it on reload", async () => {
    const db = getDb();
    const { instructorId, studentId, sectionId } = seedUsersAndSection();
    const draft: AssessmentDraftInput = {
      title: "Trộn câu OOP",
      instructions: "",
      durationMinutes: 60,
      totalPoints: 9,
      shuffleQuestions: true,
      sections: [
        {
          title: "Phần trắc nghiệm và tự luận",
          questions: [
            { type: "true_false", prompt: "Mệnh đề 1", points: 1, gradingMode: "auto", answerKey: true },
            {
              type: "single_choice",
              prompt: "Mệnh đề 2",
              points: 1,
              gradingMode: "auto",
              options: ["A", "B"],
              answerKey: 0,
            },
            {
              type: "essay",
              prompt: "Câu tự luận giữ vị trí.",
              points: 1,
              gradingMode: "llm_assisted",
              referenceAnswer: "Đáp án",
              rubric: [{ id: "criterion", criterion: "Đúng", points: 1 }],
            },
            ...Array.from({ length: 6 }, (_, index) => ({
              type: "true_false" as const,
              prompt: `Mệnh đề ${index + 3}`,
              points: 1,
              gradingMode: "auto" as const,
              answerKey: index % 2 === 0,
            })),
          ],
        },
      ],
    };
    const created = await createAssessment(draft, instructorId, db);
    expect(isAssessmentError(created)).toBe(false);
    const assessmentId = (created as any).data.id;
    expect((created as any).data.shuffleQuestions).toBe(1);
    const disabled = await createAssessment(
      { ...draft, title: "Không trộn câu OOP", shuffleQuestions: false },
      instructorId,
      db
    );
    expect(isAssessmentError(disabled)).toBe(false);
    expect((disabled as any).data.shuffleQuestions).toBe(0);
    const assignmentResult = await assignAssessment(
      assessmentId,
      {
        sectionId,
        opensAt: new Date(Date.now() - 60_000).toISOString(),
        closesAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
      instructorId,
      db
    );
    expect(isAssessmentError(assignmentResult)).toBe(false);

    const started = await startAssessmentSession((assignmentResult as any).data.id, studentId, db);
    expect(isAssessmentError(started)).toBe(false);
    const sessionId = (started as any).data.id;
    const firstView = await getStudentAssessmentSession(sessionId, studentId, db);
    const firstQuestions = (firstView as any).data.assessment.sections[0].questions;
    const firstIds = firstQuestions.map((question: any) => question.id);
    expect(firstQuestions.findIndex((question: any) => question.type === "essay")).toBe(2);

    const stored = getTestSqlite()
      .prepare("SELECT question_order_json AS questionOrderJson FROM assessment_sessions WHERE id = ?")
      .get(sessionId) as { questionOrderJson: string };
    expect(JSON.parse(stored.questionOrderJson)).toBeTruthy();

    const secondView = await getStudentAssessmentSession(sessionId, studentId, db);
    expect((secondView as any).data.assessment.sections[0].questions.map((question: any) => question.id)).toEqual(firstIds);
  });

  it("persists flagged questions and auto-submits after the integrity warning threshold", async () => {
    const db = getDb();
    const { instructorId, studentId, sectionId } = seedUsersAndSection();
    const created = await createAssessment(validDraft(), instructorId, db);
    const assignment = await assignAssessment(
      (created as any).data.id,
      {
        sectionId,
        opensAt: new Date(Date.now() - 60_000).toISOString(),
        closesAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        warningThreshold: 2,
      },
      instructorId,
      db
    );
    const started = await startAssessmentSession((assignment as any).data.id, studentId, db);
    const sessionId = (started as any).data.id;
    const firstView = await getStudentAssessmentSession(sessionId, studentId, db);
    const questionId = (firstView as any).data.assessment.sections[0].questions[0].id;

    const flagged = await setAssessmentQuestionFlag(sessionId, studentId, questionId, true, db);
    expect((flagged as any).data.flaggedQuestionIds).toEqual([questionId]);
    const reloaded = await getStudentAssessmentSession(sessionId, studentId, db);
    expect((reloaded as any).data.session.flaggedQuestionIds).toEqual([questionId]);
    expect((reloaded as any).data.integrity).toMatchObject({
      warningCount: 0,
      warningThreshold: 2,
      requireFullscreen: true,
    });

    const firstEvent = await recordAssessmentIntegrityEvent(
      sessionId,
      studentId,
      "copy_attempt",
      { clientTimestamp: new Date().toISOString() },
      db
    );
    expect((firstEvent as any).data).toMatchObject({ warningCount: 1, autoSubmitted: false });
    const thresholdEvent = await recordAssessmentIntegrityEvent(
      sessionId,
      studentId,
      "visibility_hidden",
      {},
      db
    );
    expect((thresholdEvent as any).data).toMatchObject({ warningCount: 2, autoSubmitted: true });
    const storedSession = await db.query.assessmentSessions.findFirst({
      where: (sessions: any, { eq }: any) => eq(sessions.id, sessionId),
    });
    expect(storedSession.status).not.toBe("in_progress");
    expect(storedSession.submitReason).toBe("integrity");
  });

  it("creates an immediately usable assessment and allows its owner to delete it", async () => {
    const db = getDb();
    const { instructorId, sectionId } = seedUsersAndSection();
    const created = await createAssessment(validDraft(), instructorId, db);
    expect(isAssessmentError(created)).toBe(false);
    const assessmentId = (created as any).data.id;
    expect((created as any).data.status).toBe("published");

    const updated = await updateAssessment(
      assessmentId,
      { ...validDraft(), title: "Đề đã chỉnh sửa" },
      instructorId,
      db
    );
    expect(isAssessmentError(updated)).toBe(false);
    expect((updated as any).data.title).toBe("Đề đã chỉnh sửa");

    const assigned = await assignAssessment(
      assessmentId,
      {
        sectionId,
        opensAt: new Date(Date.now() + 60_000).toISOString(),
        closesAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
      instructorId,
      db
    );
    expect(isAssessmentError(assigned)).toBe(false);

    const deleted = await deleteAssessment(assessmentId, instructorId, db);
    expect(deleted).toEqual({ data: { id: assessmentId } });
    const loaded = await getInstructorAssessment(assessmentId, instructorId, db);
    expect(isAssessmentError(loaded)).toBe(true);
    expect((loaded as any).error.code).toBe("NOT_FOUND");
  });
});
