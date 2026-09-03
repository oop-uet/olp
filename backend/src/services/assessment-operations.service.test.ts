import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import { getAssessmentOperationalStatus } from "./assessment-operations.service.js";

function getDb() {
  return drizzle(getTestSqlite(), { schema });
}

describe("assessment operational status", () => {
  it("exposes durable queue readiness and provider RPMs without a Queue secret", async () => {
    const status = await getAssessmentOperationalStatus(
      getDb() as never,
      {
        ASSESSMENT_AI_QUEUE_DELIVERY_MODE: "cloudflare_queue",
        CLOUDFLARE_ASSESSMENT_QUEUE_PRODUCER_URL: "https://queue.example.com/enqueue",
        CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET: "a".repeat(32),
        ASSESSMENT_AI_GEMINI_RPM: "5",
      }
    );

    expect(status.durableQueue).toMatchObject({ queued: expect.any(Number), running: expect.any(Number), failed: expect.any(Number) });
    expect(status.cloudflareDelivery).toEqual({
      mode: "cloudflare_queue",
      enabled: true,
      producerHost: "queue.example.com",
      reason: null,
    });
    expect(status.providers).toEqual(
      expect.arrayContaining([expect.objectContaining({ provider: "gemini", rpm: 5 })])
    );
    expect(JSON.stringify(status)).not.toContain("a".repeat(32));
  });
});
