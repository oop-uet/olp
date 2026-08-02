import {
  AlignmentType,
  Document,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from "docx";
import {
  type AssessmentPdfData,
  type AssessmentPdfQuestion,
} from "./assessment-pdf.service.js";

function cleanText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00a0/g, " ");
}

function score(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function objectiveAnswer(question: AssessmentPdfQuestion): string {
  if (question.type === "true_false") {
    if (question.answerKey === true) return "Đúng";
    if (question.answerKey === false) return "Sai";
    return "Chưa thiết lập đáp án.";
  }
  if (question.type === "single_choice") {
    if (typeof question.answerKey !== "number") return "Chưa thiết lập đáp án.";
    const option = question.options[question.answerKey];
    return option ? `${String.fromCharCode(65 + question.answerKey)}. ${cleanText(option.content)}` : "Đáp án không hợp lệ.";
  }
  return "";
}

function paragraph(
  text: string,
  options: { bold?: boolean; size?: number; indent?: number; center?: boolean; italic?: boolean } = {}
): Paragraph {
  return new Paragraph({
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    indent: options.indent ? { left: options.indent * 20 } : undefined,
    spacing: { after: 90, line: 260 },
    children: [new TextRun({
      text: cleanText(text),
      bold: options.bold,
      italics: options.italic,
      size: options.size ?? 20,
      font: "Times New Roman",
    })],
  });
}

function questionParagraphs(question: AssessmentPdfQuestion, number: number): Paragraph[] {
  const output: Paragraph[] = [
    paragraph(`${number}. (${score(question.points)} điểm)`, { bold: true }),
    paragraph(question.prompt, { indent: 360 }),
  ];
  if (question.type === "single_choice") {
    question.options.forEach((option, index) => {
      output.push(paragraph(`${String.fromCharCode(97 + index)}. ${option.content}`, { indent: 720 }));
    });
  }
  return output;
}

function answerParagraphs(question: AssessmentPdfQuestion, number: number): Paragraph[] {
  const answer = question.type === "true_false" || question.type === "single_choice"
    ? objectiveAnswer(question)
    : question.referenceAnswer?.trim() || "Chưa có đáp án gợi ý.";
  const output = [paragraph(`${number}. ${answer}`, { indent: 240 })];
  question.rubric?.forEach((criterion) => {
    output.push(paragraph(`- ${criterion.criterion} (${score(criterion.points)} điểm)`, { indent: 560 }));
  });
  if (question.gradingPrompt?.trim()) {
    output.push(paragraph(`Hướng dẫn chấm: ${question.gradingPrompt}`, { indent: 560 }));
  }
  return output;
}

export async function createAssessmentAnswerDocx(data: AssessmentPdfData): Promise<Buffer> {
  const children: Paragraph[] = [];
  children.push(paragraph(data.title, { center: true, bold: true, size: 32 }));
  const instruction = cleanText(data.instructions || "").trim();
  const examInstructions = /thời gian/i.test(instruction)
    ? instruction
    : `Thời gian: ${data.durationMinutes} phút.${instruction ? ` ${instruction}` : ""}`;
  children.push(paragraph(examInstructions, { center: true, italic: true, size: 20 }));

  let number = 1;
  data.sections.forEach((section) => {
    const title = cleanText(section.title);
    children.push(paragraph(/điểm/i.test(title) ? title : `${title} (${score(section.points)} điểm)`, { bold: true, size: 22 }));
    if (section.introContent?.trim()) children.push(paragraph(section.introContent, { indent: 360 }));
    section.questions.forEach((question) => {
      children.push(...questionParagraphs(question, number));
      number += 1;
    });
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(paragraph("ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM", { center: true, bold: true, size: 26 }));
  number = 1;
  data.sections.forEach((section) => {
    children.push(paragraph(section.title, { bold: true, size: 22 }));
    section.questions.forEach((question) => {
      children.push(...answerParagraphs(question, number));
      number += 1;
    });
  });

  const document = new Document({
    creator: "UETCodehub",
    title: `${cleanText(data.title)} - Đề thi và đáp án`,
    description: "Bản xuất đề thi dành cho giảng viên",
    sections: [{
      properties: {
        page: {
          margin: { top: 900, right: 1050, bottom: 900, left: 1050 },
        },
      },
      children,
    }],
  });
  return Packer.toBuffer(document);
}
