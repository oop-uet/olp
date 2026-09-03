interface AssessmentAiQueueMessage {
  schemaVersion: 1;
  sessionId: string;
  runGroupId: string;
  runIds: string[];
  correlationId: string;
  deliveryAttempt: number;
}

interface Env {
  ASSESSMENT_AI_QUEUE: Queue<AssessmentAiQueueMessage>;
  /** e.g. https://<render-service>.onrender.com (no trailing slash required) */
  INTERNAL_API_BASE_URL: string;
  /** Shared with CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET in the API service. */
  QUEUE_SHARED_SECRET: string;
}

const PRODUCER_AUDIENCE = "assessment-ai-queue-producer-v1";
const CONSUMER_AUDIENCE = "assessment-ai-queue-consumer-v1";
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const CORRELATION_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;
const RUN_GROUP_PATTERN = /^agr_[a-z0-9]{24}$/;
const producerNonceSeenAt = new Map<string, number>();

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function asMessage(value: unknown): AssessmentAiQueueMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    typeof record.sessionId !== "string" ||
    !ID_PATTERN.test(record.sessionId) ||
    typeof record.runGroupId !== "string" ||
    !RUN_GROUP_PATTERN.test(record.runGroupId) ||
    !Array.isArray(record.runIds) ||
    record.runIds.length === 0 ||
    record.runIds.length > 200 ||
    !record.runIds.every((runId) => typeof runId === "string" && ID_PATTERN.test(runId)) ||
    typeof record.correlationId !== "string" ||
    !CORRELATION_PATTERN.test(record.correlationId) ||
    !Number.isInteger(record.deliveryAttempt) ||
    (record.deliveryAttempt as number) < 1 ||
    (record.deliveryAttempt as number) > 25
  ) {
    return null;
  }
  return record as unknown as AssessmentAiQueueMessage;
}

function base64Url(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(secret: string, audience: string, timestamp: string, nonce: string, rawBody: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64Url(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${audience}.${timestamp}.${nonce}.${rawBody}`)
    )
  );
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function consumeProducerNonce(nonce: string, now: number) {
  for (const [storedNonce, seenAt] of producerNonceSeenAt) {
    if (now - seenAt > MAX_CLOCK_SKEW_MS) producerNonceSeenAt.delete(storedNonce);
  }
  if (producerNonceSeenAt.has(nonce)) return false;
  producerNonceSeenAt.set(nonce, now);
  if (producerNonceSeenAt.size > 10_000) {
    for (const storedNonce of producerNonceSeenAt.keys()) {
      if (producerNonceSeenAt.size <= 10_000) break;
      producerNonceSeenAt.delete(storedNonce);
    }
  }
  return true;
}

async function verifyProducerRequest(request: Request, rawBody: string, env: Env) {
  const audience = request.headers.get("x-uet-queue-audience");
  const timestamp = request.headers.get("x-uet-queue-timestamp");
  const nonce = request.headers.get("x-uet-queue-nonce");
  const signature = request.headers.get("x-uet-queue-signature");
  const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN;
  const now = Date.now();
  if (
    audience !== PRODUCER_AUDIENCE ||
    !timestamp ||
    !nonce ||
    !signature ||
    !CORRELATION_PATTERN.test(nonce) ||
    !Number.isFinite(timestampMs) ||
    Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS
  ) {
    return false;
  }
  const expected = await hmac(env.QUEUE_SHARED_SECRET, PRODUCER_AUDIENCE, timestamp, nonce, rawBody);
  return constantTimeEqual(signature, expected) && consumeProducerNonce(nonce, now);
}

function internalUrl(base: string) {
  return `${base.replace(/\/+$/, "")}/api/internal/assessment-ai/process-group`;
}

async function enqueue(request: Request, env: Env) {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const rawBody = await request.text();
  if (!(await verifyProducerRequest(request, rawBody, env))) {
    return json(401, { error: "invalid_signature" });
  }
  let rawMessage: unknown;
  try {
    rawMessage = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_message" });
  }
  const message = asMessage(rawMessage);
  if (!message) return json(400, { error: "invalid_message" });
  await env.ASSESSMENT_AI_QUEUE.send(message);
  return json(202, { accepted: true, correlationId: message.correlationId });
}

async function forwardToTransactionalApi(message: AssessmentAiQueueMessage, env: Env) {
  const rawBody = JSON.stringify(message);
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const signature = await hmac(env.QUEUE_SHARED_SECRET, CONSUMER_AUDIENCE, timestamp, nonce, rawBody);
  return fetch(internalUrl(env.INTERNAL_API_BASE_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-uet-queue-audience": CONSUMER_AUDIENCE,
      "x-uet-queue-timestamp": timestamp,
      "x-uet-queue-nonce": nonce,
      "x-uet-queue-signature": signature,
      "x-request-id": message.correlationId,
    },
    body: rawBody,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/enqueue") return enqueue(request, env);
    if (url.pathname === "/health") return json(200, { status: "ok" });
    return json(404, { error: "not_found" });
  },

  async queue(batch: MessageBatch<AssessmentAiQueueMessage>, env: Env): Promise<void> {
    for (const queuedMessage of batch.messages) {
      const original = asMessage(queuedMessage.body);
      if (!original) {
        // The durable database is not affected by an invalid delivery envelope.
        queuedMessage.ack();
        continue;
      }
      const message: AssessmentAiQueueMessage = {
        ...original,
        deliveryAttempt: Math.min(25, Math.max(original.deliveryAttempt, queuedMessage.attempts)),
      };
      try {
        const response = await forwardToTransactionalApi(message, env);
        if (response.ok) {
          queuedMessage.ack();
        } else {
          // Never log raw message body. A retry goes to the DLQ after bounded
          // attempts, while the database worker/manual grading remains usable.
          queuedMessage.retry({ delaySeconds: 60 });
        }
      } catch {
        queuedMessage.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<Env, AssessmentAiQueueMessage>;
