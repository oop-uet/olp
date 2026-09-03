import { describe, expect, it } from "vitest";
import { getAssessmentAiQueueDeliveryConfig, getCloudflarePagesProject } from "./hybrid-cloudflare.js";

describe("Hybrid Cloudflare runtime configuration", () => {
  it("keeps durable database delivery as the safe default", () => {
    const config = getAssessmentAiQueueDeliveryConfig({});
    expect(config).toMatchObject({ mode: "durable_db", enabled: false, producerUrl: null, sharedSecret: null });
  });

  it("permits a signed callback smoke test without enabling producer delivery", () => {
    const config = getAssessmentAiQueueDeliveryConfig({
      CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET: "a".repeat(32),
    });
    expect(config).toMatchObject({ mode: "durable_db", enabled: false, sharedSecret: "a".repeat(32) });
  });

  it("does not enable the queue with incomplete or insecure configuration", () => {
    expect(
      getAssessmentAiQueueDeliveryConfig({
        ASSESSMENT_AI_QUEUE_DELIVERY_MODE: "cloudflare_queue",
        CLOUDFLARE_ASSESSMENT_QUEUE_PRODUCER_URL: "http://queue.example.com/enqueue",
        CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET: "a".repeat(32),
      })
    ).toMatchObject({ enabled: false, producerUrl: null });
    expect(
      getAssessmentAiQueueDeliveryConfig({
        ASSESSMENT_AI_QUEUE_DELIVERY_MODE: "cloudflare_queue",
        CLOUDFLARE_ASSESSMENT_QUEUE_PRODUCER_URL: "https://queue.example.com/enqueue",
        CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET: "short",
      })
    ).toMatchObject({ enabled: false });
  });

  it("enables only a complete HTTPS configuration and normalizes a Pages project", () => {
    const config = getAssessmentAiQueueDeliveryConfig({
      ASSESSMENT_AI_QUEUE_DELIVERY_MODE: "cloudflare_queue",
      CLOUDFLARE_ASSESSMENT_QUEUE_PRODUCER_URL: "https://queue.example.com/enqueue",
      CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET: "a".repeat(32),
      ASSESSMENT_AI_QUEUE_DELIVERY_TIMEOUT_MS: "99999",
    });
    expect(config).toMatchObject({ mode: "cloudflare_queue", enabled: true, timeoutMs: 10_000 });
    expect(getCloudflarePagesProject({ CLOUDFLARE_PAGES_PROJECT: "UETCodehub-App" })).toBe("uetcodehub-app");
    expect(getCloudflarePagesProject({ CLOUDFLARE_PAGES_PROJECT: "not/a-project" })).toBeNull();
  });
});
