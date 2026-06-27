import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { TEST_JWT_SECRET, generateTestToken } from "../../test/helpers.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.guard.js";

process.env.JWT_SECRET = TEST_JWT_SECRET;

// Mock the anticheat service
vi.mock("../../services/anticheat.service.js", () => ({
  getAnticheatLog: vi.fn(),
  isAnticheatError: (value: unknown): boolean => {
    return (
      typeof value === "object" &&
      value !== null &&
      "error" in value &&
      typeof (value as any).error?.code === "string"
    );
  },
}));

import { getAnticheatLog } from "../../services/anticheat.service.js";
import anticheatRoutes from "./anticheat.routes.js";

const mockedGetAnticheatLog = vi.mocked(getAnticheatLog);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/submissions", authMiddleware(), requireRole("instructor"), anticheatRoutes);
  return app;
}

describe("GET /api/submissions/:id/anticheat-log", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  it("should return 200 with anticheat events for instructor", async () => {
    const events = [
      {
        id: "ev-1",
        studentId: "student-1",
        exerciseId: "ex-1",
        eventType: "fullscreen_exit",
        warningCountAtEvent: 1,
        occurredAt: "2024-01-01T10:00:00.000Z",
        submissionId: null,
      },
      {
        id: "ev-2",
        studentId: "student-1",
        exerciseId: "ex-1",
        eventType: "visibility_hidden",
        warningCountAtEvent: 2,
        occurredAt: "2024-01-01T10:01:00.000Z",
        submissionId: null,
      },
    ];
    mockedGetAnticheatLog.mockResolvedValue(events);

    const token = generateTestToken("instructor-1", "instructor");
    const response = await request(app)
      .get("/api/submissions/sub-1/anticheat-log")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(events);
    expect(mockedGetAnticheatLog).toHaveBeenCalledWith("sub-1");
  });

  it("should return 200 with empty array when no events", async () => {
    mockedGetAnticheatLog.mockResolvedValue([]);
    const token = generateTestToken("instructor-1", "instructor");

    const response = await request(app)
      .get("/api/submissions/sub-1/anticheat-log")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("should return 404 when submission not found", async () => {
    mockedGetAnticheatLog.mockResolvedValue({
      error: { code: "NOT_FOUND", message: "Submission not found." },
    });
    const token = generateTestToken("instructor-1", "instructor");

    const response = await request(app)
      .get("/api/submissions/nonexistent/anticheat-log")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("should return 401 without auth token", async () => {
    const response = await request(app)
      .get("/api/submissions/sub-1/anticheat-log");

    expect(response.status).toBe(401);
  });

  it("should return 403 for student role", async () => {
    const token = generateTestToken("student-1", "student");

    const response = await request(app)
      .get("/api/submissions/sub-1/anticheat-log")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 500 on service error", async () => {
    mockedGetAnticheatLog.mockRejectedValue(new Error("DB error"));
    const token = generateTestToken("instructor-1", "instructor");

    const response = await request(app)
      .get("/api/submissions/sub-1/anticheat-log")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
  });
});
