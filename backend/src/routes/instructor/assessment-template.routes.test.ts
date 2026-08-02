import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.guard.js";
import { createUetMidtermAssessmentTemplate } from "../../services/assessment-template.service.js";
import { generateTestToken, TEST_JWT_SECRET } from "../../test/helpers.js";
import assessmentRoutes from "./assessment.routes.js";

process.env.JWT_SECRET = TEST_JWT_SECRET;

function createApp() {
  const app = express();
  app.use(express.json({ limit: "6mb" }));
  app.use(
    "/api/instructor/assessments",
    authMiddleware(),
    requireRole("instructor"),
    assessmentRoutes
  );
  return app;
}

describe("assessment template routes", () => {
  const app = createApp();
  const instructorToken = generateTestToken("instructor-1", "instructor");

  it("downloads the UET midterm template as an Excel workbook", async () => {
    const response = await request(app)
      .get("/api/instructor/assessments/template")
      .set("Authorization", `Bearer ${instructorToken}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(response.headers["content-disposition"]).toContain("assessment-template.xlsx");
    expect(Number(response.headers["content-length"])).toBeGreaterThan(1_000);
  });

  it("imports an edited template into an assessment draft preview", async () => {
    const template = await createUetMidtermAssessmentTemplate();
    const response = await request(app)
      .post("/api/instructor/assessments/import-template")
      .set("Authorization", `Bearer ${instructorToken}`)
      .send({
        filename: "de-giua-ky.xlsx",
        fileBase64: template.toString("base64"),
      });

    expect(response.status).toBe(200);
    expect(response.body.data.sections).toHaveLength(4);
    expect(
      response.body.data.sections.reduce(
        (sum: number, section: { questions: unknown[] }) => sum + section.questions.length,
        0
      )
    ).toBe(34);
    expect(response.body.warnings).toHaveLength(30);
  });

  it("rejects template access from a student account", async () => {
    const studentToken = generateTestToken("student-1", "student");
    const response = await request(app)
      .get("/api/instructor/assessments/template")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(response.status).toBe(403);
  });
});
