import crypto from "node:crypto";
import { z } from "zod";
import { getAssessmentAiQueueDeliveryConfig } from "../config/hybrid-cloudflare.js";

export const ASSESSMENT_AI_QUEUE_SCHEMA_VERSION = 1;
const SIGNATURE_AUDIENCE = "assessment-ai-queue-producer-v1";
const REFERENCE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;

/**
 * This is the only data allowed to leave the API for Cloudflare Queue delivery.
 * It deliberately contains references only: never answers, rubrics, passwords,
 * prompts, JWTs, or provider credentials.
 */
export const assessmentAiQueueMessageSchema = z.object({
  schemaVersion: z.literal(ASSESSMENT_AI_QUEUE_SCHEMA_VERSION),
  sessionId: z.string().regex(REFERENCE_ID_PATTERN),
  runGroupId: z.string().regex(/^agr_[a-z0-9]{24}$/),
  runIds: z.array(z.string().regex(REFERENCE_ID_PATTERN)).min(1).max(200),
  correlationId: z.string().regex(CORRELATION_ID_PATTERN),
  deliveryAttempt: z.number().int().min(1).max(25),
});

export type AssessmentAiQueueMessage = z.infer<typeof assessmentAiQueueMessageSchema>;

export interface AssessmentAiQueueGroupInput {
  sessionId: string;
  runIds: string[];
  promptVersion: string;
  correlationId?: string;
  deliveryAttempt?: number;
}

export interface QueueDeliveryResult {
  delivered: boolean;
  skipped: boolean;
  status?: number;
  reason?: string;
}

export interface QueueDeliveryDependencies {
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => Date;
  randomUuid?: () => string;
}

function stableDigest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function normalizeRunIds(runIds: string[]) {
  return Array.from(new Set(runIds.map((id) => id.trim()).filter(Boolean))).sort();
}

/**
 * A deterministic ID for exactly one submitted/regraded batch. Including run
 * IDs makes a later full regrade a new revision, while redelivery of the same
 * batch keeps its group identity.
 */
export function createAssessmentAiRunGroupId(
  sessionId: string,
  promptVersion: string,
  runIds: string[]
) {
  return `agr_${stableDigest(`${sessionId}\n${promptVersion}\n${runIds.join("\n")}`)}`;
}

export function createAssessmentAiQueueMessage(
  input: AssessmentAiQueueGroupInput,
  randomUuid: () => string = crypto.randomUUID
): AssessmentAiQueueMessage {
  const runIds = normalizeRunIds(input.runIds);
  if (!input.sessionId.trim() || runIds.length === 0) {
    throw new Error("Assessment AI queue message requires a session and at least one run.");
  }
  const runGroupId = createAssessmentAiRunGroupId(input.sessionId.trim(), input.promptVersion.trim(), runIds);
  const correlationId =
    input.correlationId?.trim() || `aq_${stableDigest(`${runGroupId}\n${runIds.join("\n")}\n${randomUuid()}`)}`;
  return assessmentAiQueueMessageSchema.parse({
    schemaVersion: ASSESSMENT_AI_QUEUE_SCHEMA_VERSION,
    sessionId: input.sessionId.trim(),
    runGroupId,
    runIds,
    correlationId,
    deliveryAttempt: input.deliveryAttempt ?? 1,
  });
}

export function signAssessmentAiQueueRequest(
  rawBody: string,
  sharedSecret: string,
  audience: string,
  timestamp: string,
  nonce: string
) {
  return crypto
    .createHmac("sha256", sharedSecret)
    .update(`${audience}.${timestamp}.${nonce}.${rawBody}`)
    .digest("base64url");
}

export function verifyAssessmentAiQueueRequest(
  rawBody: string,
  sharedSecret: string,
  audience: string,
  timestamp: string,
  nonce: string,
  signature: string
) {
  const expected = signAssessmentAiQueueRequest(rawBody, sharedSecret, audience, timestamp, nonce);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

/**
 * Best-effort only: callers must have committed the grading run before invoking
 * this method and must never turn a delivery failure into a failed submit.
 */
export async function deliverAssessmentAiQueueGroup(
  input: AssessmentAiQueueGroupInput,
  dependencies: QueueDeliveryDependencies = {}
): Promise<QueueDeliveryResult> {
  const config = getAssessmentAiQueueDeliveryConfig(dependencies.environment);
  if (!config.enabled || !config.producerUrl || !config.sharedSecret) {
    return { delivered: false, skipped: true, reason: config.reason ?? "Delivery bị tắt." };
  }

  const now = dependencies.now ?? (() => new Date());
  const randomUuid = dependencies.randomUuid ?? crypto.randomUUID;
  const message = createAssessmentAiQueueMessage(input, randomUuid);
  const rawBody = JSON.stringify(message);
  const timestamp = now().toISOString();
  const nonce = randomUuid();
  const signature = signAssessmentAiQueueRequest(
    rawBody,
    config.sharedSecret,
    SIGNATURE_AUDIENCE,
    timestamp,
    nonce
  );
  const requestFetch = dependencies.fetch ?? fetch;

  try {
    const response = await requestFetch(config.producerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-uet-queue-audience": SIGNATURE_AUDIENCE,
        "x-uet-queue-timestamp": timestamp,
        "x-uet-queue-nonce": nonce,
        "x-uet-queue-signature": signature,
        "x-request-id": message.correlationId,
      },
      body: rawBody,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) {
      return { delivered: false, skipped: false, status: response.status, reason: "Producer từ chối delivery." };
    }
    return { delivered: true, skipped: false, status: response.status };
  } catch {
    // Do not return a transport error verbatim: it may contain a provider URL.
    return { delivered: false, skipped: false, reason: "Không thể gửi wake-up đến Cloudflare Queue." };
  }
}

/**
 * Fire-and-forget helper used after the durable database insert.  Logs only a
 * correlation ID so diagnostics never expose grading material.
 */
export function queueAssessmentAiDelivery(input: AssessmentAiQueueGroupInput) {
  void deliverAssessmentAiQueueGroup(input).then((result) => {
    if (!result.delivered && !result.skipped) {
      const correlation = input.correlationId?.slice(0, 160) ?? "unknown";
      console.warn(`[assessment-ai-queue] delivery wake-up failed (${correlation}): ${result.reason ?? "unknown"}`);
    }
  });
}

export const assessmentAiQueueSignatureAudience = SIGNATURE_AUDIENCE;
