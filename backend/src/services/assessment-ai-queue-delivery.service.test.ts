import { describe, expect, it, vi } from "vitest";
import {
  createAssessmentAiQueueMessage,
  deliverAssessmentAiQueueGroup,
  verifyAssessmentAiQueueRequest,
} from "./assessment-ai-queue-delivery.service.js";

const QUEUE_ENV: NodeJS.ProcessEnv = {
  ASSESSMENT_AI_QUEUE_DELIVERY_MODE: "cloudflare_queue",
  CLOUDFLARE_ASSESSMENT_QUEUE_PRODUCER_URL: "https://queue.example.com/enqueue",
  CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET: "a".repeat(32),
};

describe("assessment AI Queue delivery contract", () => {
  it("creates a stable batch ID per grading revision and keeps only reference data in the message", () => {
    const first = createAssessmentAiQueueMessage(
      { sessionId: "session-1", runIds: ["run-b", "run-a", "run-a"], promptVersion: "assessment-grading-v2" },
      () => "request-id-0001"
    );
    const second = createAssessmentAiQueueMessage(
      { sessionId: "session-1", runIds: ["run-a", "run-b"], promptVersion: "assessment-grading-v2" },
      () => "request-id-0002"
    );
    const regrade = createAssessmentAiQueueMessage(
      { sessionId: "session-1", runIds: ["new-run-a", "new-run-b"], promptVersion: "assessment-grading-v2" },
      () => "request-id-0003"
    );
    expect(first.runGroupId).toBe(second.runGroupId);
    expect(regrade.runGroupId).not.toBe(first.runGroupId);
    expect(first.runIds).toEqual(["run-a", "run-b"]);
    expect(JSON.stringify(first)).not.toMatch(/answer|rubric|prompt|password|token/i);
  });

  it("skips delivery when the Cloudflare feature flag is not ready", async () => {
    const requestFetch = vi.fn();
    const result = await deliverAssessmentAiQueueGroup(
      { sessionId: "session-1", runIds: ["run-1"], promptVersion: "assessment-grading-v2" },
      { environment: {}, fetch: requestFetch }
    );
    expect(result).toMatchObject({ delivered: false, skipped: true });
    expect(requestFetch).not.toHaveBeenCalled();
  });

  it("signs an ID-only delivery request with audience binding", async () => {
    const requestFetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const result = await deliverAssessmentAiQueueGroup(
      {
        sessionId: "session-1",
        runIds: ["run-1"],
        promptVersion: "assessment-grading-v2",
        correlationId: "request-id-0001",
      },
      {
        environment: QUEUE_ENV,
        fetch: requestFetch,
        now: () => new Date("2026-09-03T00:00:00.000Z"),
        randomUuid: () => "nonce-value-0001",
      }
    );
    expect(result).toMatchObject({ delivered: true, skipped: false, status: 202 });
    const [url, init] = requestFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    const body = String(init.body);
    expect(url).toBe("https://queue.example.com/enqueue");
    expect(headers.get("x-uet-queue-audience")).toBe("assessment-ai-queue-producer-v1");
    expect(
      verifyAssessmentAiQueueRequest(
        body,
        QUEUE_ENV.CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET!,
        "assessment-ai-queue-producer-v1",
        headers.get("x-uet-queue-timestamp")!,
        headers.get("x-uet-queue-nonce")!,
        headers.get("x-uet-queue-signature")!
      )
    ).toBe(true);
    expect(
      verifyAssessmentAiQueueRequest(
        body,
        QUEUE_ENV.CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET!,
        "assessment-ai-queue-consumer-v1",
        headers.get("x-uet-queue-timestamp")!,
        headers.get("x-uet-queue-nonce")!,
        headers.get("x-uet-queue-signature")!
      )
    ).toBe(false);
  });
});
