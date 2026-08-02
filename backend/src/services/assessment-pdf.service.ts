import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const REGULAR_FONT = fileURLToPath(
  new URL("../../assets/fonts/NotoSans-Regular.ttf", import.meta.url)
);
const BOLD_FONT = fileURLToPath(
  new URL("../../assets/fonts/NotoSans-Bold.ttf", import.meta.url)
);

export interface AssessmentPdfRubricCriterion {
  id?: string;
  criterion: string;
  points: number;
}

export interface AssessmentPdfQuestion {
  id: string;
  type: "true_false" | "single_choice" | "short_text" | "essay" | "code_analysis";
  prompt: string;
  points: number;
  gradingMode: "auto" | "llm_assisted" | "manual";
  options: Array<{ id: string; content: string }>;
  answerKey?: boolean | number | null;
  referenceAnswer?: string | null;
  gradingPrompt?: string | null;
  rubric?: AssessmentPdfRubricCriterion[];
}

export interface AssessmentPdfSection {
  id: string;
  title: string;
  introContent?: string | null;
  points: number;
  questions: AssessmentPdfQuestion[];
}

export interface AssessmentPdfData {
  id: string;
  title: string;
  instructions?: string | null;
  durationMinutes: number;
  totalPoints: number;
  shuffleQuestions: number | boolean;
  sections: AssessmentPdfSection[];
}

const PAGE = {
  left: 58,
  right: 58,
  top: 48,
  bottom: 48,
};

function cleanText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00a0/g, " ");
}

function formatScore(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function width(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE.left - PAGE.right;
}

function bottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - PAGE.bottom;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height > bottom(doc)) doc.addPage();
}

function drawText(
  doc: PDFKit.PDFDocument,
  text: string,
  options: { bold?: boolean; size?: number; indent?: number; lineGap?: number; align?: "left" | "center" } = {}
): void {
  const value = cleanText(text);
  if (!value) return;
  const indent = options.indent ?? 0;
  const size = options.size ?? 10;
  const lineGap = options.lineGap ?? 1.5;
  const available = width(doc) - indent;
  doc.font(options.bold ? "NotoSansBold" : "NotoSans").fontSize(size);
  const height = doc.heightOfString(value, { width: available, lineGap, align: options.align });
  ensureSpace(doc, height + 2);
  doc.text(value, PAGE.left + indent, doc.y, { width: available, lineGap, align: options.align });
  doc.y += 2;
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

function drawQuestion(doc: PDFKit.PDFDocument, question: AssessmentPdfQuestion, number: number): void {
  const points = `(${formatScore(question.points)} điểm)`;
  const heading = `${number}. ${points}`;
  drawText(doc, heading, { bold: true, size: 10.5 });
  drawText(doc, question.prompt, { size: 10, indent: 16, lineGap: 1.8 });

  if (question.type === "single_choice") {
    question.options.forEach((option, index) => {
      const label = `${String.fromCharCode(97 + index)}.`;
      const optionText = `${label} ${cleanText(option.content)}`;
      drawText(doc, optionText, { size: 9.8, indent: 32, lineGap: 1.5 });
    });
  }
  doc.y += 4;
}

function drawAnswer(doc: PDFKit.PDFDocument, question: AssessmentPdfQuestion, number: number): void {
  const answer = question.type === "true_false" || question.type === "single_choice"
    ? objectiveAnswer(question)
    : question.referenceAnswer?.trim() || "Chưa có đáp án gợi ý.";
  drawText(doc, `${number}. ${answer}`, { size: 9.8, indent: 12, lineGap: 1.5 });
  if (question.rubric?.length) {
    question.rubric.forEach((criterion) => {
      drawText(doc, `- ${cleanText(criterion.criterion)} (${formatScore(criterion.points)} điểm)`, {
        size: 9,
        indent: 28,
      });
    });
  }
  if (question.gradingPrompt?.trim()) {
    drawText(doc, `Hướng dẫn chấm: ${question.gradingPrompt}`, { size: 8.7, indent: 28, lineGap: 1.3 });
  }
}

function drawFooter(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const originalBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("NotoSans").fontSize(7.5).fillColor("#64748B").text(
      `UETCodehub - Trang ${index + 1}/${range.count}`,
      PAGE.left,
      doc.page.height - 27,
      { width: width(doc), align: "center", lineBreak: false }
    );
    doc.page.margins.bottom = originalBottom;
  }
}

export async function createAssessmentAnswerPdf(data: AssessmentPdfData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: PAGE.top, right: PAGE.right, bottom: PAGE.bottom, left: PAGE.left },
      bufferPages: true,
      info: {
        Title: `${cleanText(data.title)} - Đề thi và đáp án`,
        Author: "UETCodehub",
        Subject: "Đề thi dành cho giảng viên",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("NotoSans", REGULAR_FONT);
    doc.registerFont("NotoSansBold", BOLD_FONT);

    drawText(doc, cleanText(data.title), { bold: true, size: 17, align: "center" });
    const instruction = cleanText(data.instructions || "").trim();
    const examInstructions = /thời gian/i.test(instruction)
      ? instruction
      : `Thời gian: ${data.durationMinutes} phút.${instruction ? ` ${instruction}` : ""}`;
    drawText(doc, examInstructions, {
      size: 10,
      align: "center",
    });
    doc.y += 8;

    let number = 1;
    data.sections.forEach((section) => {
      const title = cleanText(section.title);
      drawText(doc, /điểm/i.test(title) ? title : `${title} (${formatScore(section.points)} điểm)`, { bold: true, size: 11 });
      if (section.introContent?.trim()) {
        drawText(doc, section.introContent, { size: 9.5, indent: 16, lineGap: 1.5 });
      }
      section.questions.forEach((question) => {
        drawQuestion(doc, question, number);
        number += 1;
      });
      doc.y += 5;
    });

    doc.addPage();
    drawText(doc, "ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM", { bold: true, size: 14, align: "center" });
    doc.y += 8;
    number = 1;
    data.sections.forEach((section) => {
      drawText(doc, cleanText(section.title), { bold: true, size: 11 });
      section.questions.forEach((question) => {
        drawAnswer(doc, question, number);
        number += 1;
      });
      doc.y += 4;
    });

    drawFooter(doc);
    doc.end();
  });
}
