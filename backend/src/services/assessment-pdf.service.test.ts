import { describe, expect, it } from "vitest";
import { createAssessmentAnswerPdf, type AssessmentPdfData } from "./assessment-pdf.service.js";
import { createAssessmentAnswerDocx } from "./assessment-docx.service.js";

function sampleAssessment(): AssessmentPdfData {
  return {
    id: "assessment-pdf-test",
    title: "Kiểm tra giữa kỳ Lập trình hướng đối tượng",
    instructions: "Thời gian làm bài 90 phút. Không sử dụng tài liệu.",
    durationMinutes: 90,
    totalPoints: 3,
    shuffleQuestions: 1,
    sections: [
      {
        id: "section-1",
        title: "Phần 1 - Trắc nghiệm",
        points: 2,
        questions: [
          {
            id: "question-1",
            type: "true_false",
            prompt: "Một interface có thể được kế thừa bởi interface khác.",
            points: 1,
            gradingMode: "auto",
            options: [],
            answerKey: true,
          },
          {
            id: "question-2",
            type: "single_choice",
            prompt: "Từ khóa nào tham chiếu đến lớp cha?",
            points: 1,
            gradingMode: "auto",
            options: [
              { id: "option-a", content: "this" },
              { id: "option-b", content: "super" },
            ],
            answerKey: 1,
          },
        ],
      },
      {
        id: "section-2",
        title: "Phần 2 - Tự luận",
        introContent: "class A {\n    private int value;\n}",
        points: 1,
        questions: [
          {
            id: "question-3",
            type: "essay",
            prompt: "Giải thích phạm vi truy cập private trong lớp con.",
            points: 1,
            gradingMode: "llm_assisted",
            options: [],
            referenceAnswer: "Lớp con không thể truy cập trực tiếp thuộc tính private của lớp cha.",
            gradingPrompt: "Chấp nhận cách diễn đạt tương đương nếu ví dụ Java hợp lệ.",
            rubric: [
              { id: "concept", criterion: "Giải thích đúng phạm vi private", points: 0.5 },
              { id: "example", criterion: "Có ví dụ phù hợp", points: 0.5 },
            ],
          },
        ],
      },
    ],
  };
}

describe("assessment PDF service", () => {
  it("creates a non-empty PDF containing the exam and answer key layout", async () => {
    const pdf = await createAssessmentAnswerPdf(sampleAssessment());

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
    expect(pdf.subarray(-20).toString()).toContain("%%EOF");
  });

  it("creates a Word document with the same simple exam and answer-key layout", async () => {
    const document = await createAssessmentAnswerDocx(sampleAssessment());

    expect(document.subarray(0, 2).toString()).toBe("PK");
    expect(document.length).toBeGreaterThan(5_000);
  });
});
