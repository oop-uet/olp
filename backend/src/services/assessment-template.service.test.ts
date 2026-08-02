import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  AssessmentTemplateImportError,
  createUetMidtermAssessmentTemplate,
  parseAssessmentTemplate,
} from "./assessment-template.service.js";

describe("assessment template service", () => {
  it("creates an editable workbook matching the sample UET midterm structure", async () => {
    const buffer = await createUetMidtermAssessmentTemplate();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const questions = XLSX.utils.sheet_to_json(workbook.Sheets.CauHoi);

    expect(workbook.SheetNames).toEqual(["HuongDan", "ThongTinDe", "CauHoi", "Rubric"]);
    expect(questions).toHaveLength(34);
  });

  it("imports the generated workbook into an assessment draft with answer warnings", async () => {
    const result = parseAssessmentTemplate(await createUetMidtermAssessmentTemplate());
    const questionCount = result.draft.sections.reduce(
      (sum, section) => sum + section.questions.length,
      0
    );

    expect(result.draft.title).toContain("2020-2021");
    expect(result.draft.durationMinutes).toBe(90);
    expect(result.draft.totalPoints).toBe(10);
    expect(result.draft.shuffleQuestions).toBe(true);
    expect(result.draft.sections).toHaveLength(4);
    expect(questionCount).toBe(34);
    expect(result.draft.sections[3].introContent).toContain("abstract class Person");
    expect(result.warnings).toHaveLength(30);
  });

  it("parses teacher-edited true/false and choice answer keys", async () => {
    const workbook = XLSX.read(await createUetMidtermAssessmentTemplate(), { type: "buffer" });
    workbook.Sheets.CauHoi.M2.v = "Đúng";
    workbook.Sheets.CauHoi.M29.v = "C";
    const edited = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const result = parseAssessmentTemplate(Buffer.from(edited));

    expect(result.draft.sections[0].questions[0].answerKey).toBe(true);
    expect(result.draft.sections[2].questions[0].answerKey).toBe(2);
    expect(result.warnings).toHaveLength(28);
  });

  it("imports the lecturer's shuffle toggle from the metadata sheet", async () => {
    const workbook = XLSX.read(await createUetMidtermAssessmentTemplate(), { type: "buffer" });
    workbook.Sheets.ThongTinDe.B6.v = "Tắt";
    const edited = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const result = parseAssessmentTemplate(Buffer.from(edited));

    expect(result.draft.shuffleQuestions).toBe(false);
  });

  it("rejects workbooks that do not follow the template sheets", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["invalid"]]), "Sheet1");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    expect(() => parseAssessmentTemplate(Buffer.from(buffer))).toThrow(AssessmentTemplateImportError);
  });
});
