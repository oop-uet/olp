import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../index.js";

describe("assessment AI Queue internal callback", () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET = "a".repeat(32);
    delete process.env.ASSESSMENT_AI_QUEUE_DELIVERY_MODE;
  });

  it("rejects unsigned callback messages before any grading work is attempted", async () => {
    const response = await request(app)
      .post("/api/internal/assessment-ai/process-group")
      .set("Content-Type", "application/json")
      .send({
        schemaVersion: 1,
        sessionId: "session-1",
        runGroupId: "agr_0123456789abcdef01234567",
        runIds: ["run-1"],
        correlationId: "request-id-0001",
        deliveryAttempt: 1,
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INTERNAL_CALLBACK_INVALID");
  });
});
