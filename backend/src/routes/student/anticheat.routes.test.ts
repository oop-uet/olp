import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { TEST_JWT_SECRET, generateTestToken } from "../../test/helpers.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.guard.js";

process.env.JWT_SECRET = TEST_JWT_SECRET;

// Mock the anticheat service
vi.mock("../../services/anticheat.service.js", () => ({
  logEvent: vi.fn(),
  isAnticheatError: (value: unknown): boolean => {
    return (
      typeof value === "object" &&
      value !== null &&
      "error" in value &&
      typeof (value as any).error?.code === "string"
    );
  },
}));

import { logEvent } from "../../services/anticheat.service.js";
import anticheatRoutes from "./anticheat.routes.js";

const mockedLogEvent = vi.mocked(logEvent);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/anticheat", authMiddleware(), requireRole("student"), anticheatRoutes);
  return app;
}

describe("POST /api/anticheat/events", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  it("should return 201 on successful event logging", async () => {
    const eventResult = {
      id: "event-1",
      studentId: "student-1",
      exerciseId: "ex-1",
      eventType: "fullscreen_exit",
      warningCountAtEvent: 1,
      occurredAt: "2024-01-01T10:00:00.000Z",
      submissionId: null,
    };
    mockedLogEvent.mockResolvedValue(eventResult);

    const token = generateTestToken("student-1", "student");
    const response = await request(app)
      .post("/api/anticheat/events")
      .set("Authorization", `Bearer ${token}`)
      .send({
        exercise_id: "ex-1",
        event_type: "fullscreen_exit",
        warning_count: 1,
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(eventResult);
    expect(mockedLogEvent).toHaveBeenCalledWith({
      studentId: "student-1",
      exerciseId: "ex-1",
      eventType: "fullscreen_exit",
      warningCount: 1,
      submissionId: undefined,
    });
  });

  it("should accept visibility_hidden event type", async () => {
    mockedLogEvent.mockResolvedValue({ id: "event-2" });
    const token = generateTestToken("student-1", "student");

    const response = await request(app)
      .post("/api/anticheat/events")
      .set("Authorization", `Bearer ${token}`)
      .send({
        exercise_id: "ex-1",
        event_type: "visibility_hidden",
        warning_count: 2,
      });

    expect(response.status).toBe(201);
  });

  it("should accept window_blur event type", async () => {
    mockedLogEvent.mockResolvedValue({ id: "event-3" });
    const token = generateTestToken("student-1", "student");

    const response = await request(app)
      .post("/api/anticheat/events")
      .set("Authorization", `Bearer ${token}`)
      .send({
        exercise_id: "ex-1",
        event_type: "window_blur",
        warning_count: 3,
      });

    expect(response.status).toBe(201);
  });

  it("should accept optional submission_id", async () => {
    mockedLogEvent.mockResolvedValue({ id: "event-4", submissionId: "sub-1" });
    const token = generateTestToken("student-1", "student");

    const response = await request(app)
      .post("/api/anticheat/events")
      .set("Authorization", `Bearer ${token}`)
      .send({
        exercise_id: "ex-1",
        event_type: "fullscreen_exit",
        warning_count: 1,
        submission_id: "sub-1",
      });

    expect(response.status).toBe(201);
    expect(mockedLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: "sub-1" })
    );
  });

  it("should return 400 for invalid event_type", async () => {
    const token = generateTestToken("student-1", "student");

    const response = await request(app)
      .post("/api/anticheat/events")
      .set("Authorization", `Bearer ${token}`)
      .send({
        exercise_id: "ex-1",
        event_type: "invalid_type",
        warning_count: 1,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for missing exercise_id", async () => {
    const token = generateTestToken("student-1", "student");

    const response = await request(app)
      .post("/api/anticheat/events")
      .set("Authorization", `Bearer ${token}`)
      .send({
        event_type: "fullscreen_exit",
        warning_count: 1,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for missing warning_count", async () => {
    const token = generateTestToken("student-1", "student");

    const response = await request(app)
      .post("/api/anticheat/events")
      .set("Authorization", `Bearer ${token}`)
      .send({
        exercise_id: "ex-1",
        event_type: "fullscreen_exit",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 401 without auth token", async () => {
    const response = await request(app)
      .post("/api/anticheat/events")
      .send({
        exercise_id: "ex-1",
        event_type: "fullscreen_exit",
        warning_count: 1,
      });

    expect(response.status).toBe(401);
  });

  it("should return 403 for instructor role", async () => {
    const token = generateTestToken("instructor-1", "instructor");

    const response = await request(app)
      .post("/api/anticheat/events")
      .set("Authorization", `Bearer ${token}`)
      .send({
        exercise_id: "ex-1",
        event_type: "fullscreen_exit",
        warning_count: 1,
      });

    expect(response.status).toBe(403);
  });

  it("should return 500 on service error", async () => {
    mockedLogEvent.mockRejectedValue(new Error("DB error"));
    const token = generateTestToken("student-1", "student");

    const response = await request(app)
      .post("/api/anticheat/events")
      .set("Authorization", `Bearer ${token}`)
      .send({
        exercise_id: "ex-1",
        event_type: "fullscreen_exit",
        warning_count: 1,
      });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
  });
});
