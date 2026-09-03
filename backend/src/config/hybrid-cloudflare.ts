/**
 * Runtime switches for the staged Hybrid Cloudflare rollout.
 *
 * The durable libSQL grading-run table remains the source of truth regardless
 * of these switches.  An incomplete Cloudflare configuration therefore never
 * changes the synchronous assessment submit path.
 */
export type AssessmentAiQueueDeliveryMode = "durable_db" | "cloudflare_queue";

export interface AssessmentAiQueueDeliveryConfig {
  mode: AssessmentAiQueueDeliveryMode;
  enabled: boolean;
  producerUrl: string | null;
  sharedSecret: string | null;
  timeoutMs: number;
  reason: string | null;
}

const DEFAULT_DELIVERY_TIMEOUT_MS = 2_500;

function parseTimeout(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DELIVERY_TIMEOUT_MS;
  return Math.min(10_000, Math.max(500, Math.floor(parsed)));
}

function isHttpsUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Reads the delivery switch without leaking its secret.  The producer endpoint
 * must be HTTPS because assessment identifiers are still operational data.
 */
export function getAssessmentAiQueueDeliveryConfig(
  environment: NodeJS.ProcessEnv = process.env
): AssessmentAiQueueDeliveryConfig {
  const mode: AssessmentAiQueueDeliveryMode =
    environment.ASSESSMENT_AI_QUEUE_DELIVERY_MODE === "cloudflare_queue"
      ? "cloudflare_queue"
      : "durable_db";
  const producerUrl = environment.CLOUDFLARE_ASSESSMENT_QUEUE_PRODUCER_URL?.trim() || null;
  const sharedSecret = environment.CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET?.trim() || null;
  const usableSharedSecret = sharedSecret && sharedSecret.length >= 32 ? sharedSecret : null;

  if (mode === "durable_db") {
    return {
      mode,
      enabled: false,
      producerUrl: null,
      // A signed callback may be smoke-tested while producer delivery is off.
      // This secret is never returned by any HTTP status endpoint.
      sharedSecret: usableSharedSecret,
      timeoutMs: parseTimeout(environment.ASSESSMENT_AI_QUEUE_DELIVERY_TIMEOUT_MS),
      reason: "Delivery Cloudflare Queue chưa được bật; backend worker sẽ dùng hàng đợi bền vững trong database.",
    };
  }

  if (!isHttpsUrl(producerUrl)) {
    return {
      mode,
      enabled: false,
      producerUrl: null,
      sharedSecret: null,
      timeoutMs: parseTimeout(environment.ASSESSMENT_AI_QUEUE_DELIVERY_TIMEOUT_MS),
      reason: "Thiếu hoặc sai CLOUDFLARE_ASSESSMENT_QUEUE_PRODUCER_URL (bắt buộc HTTPS).",
    };
  }
  if (!usableSharedSecret) {
    return {
      mode,
      enabled: false,
      producerUrl,
      sharedSecret: null,
      timeoutMs: parseTimeout(environment.ASSESSMENT_AI_QUEUE_DELIVERY_TIMEOUT_MS),
      reason: "Thiếu CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET đủ mạnh (ít nhất 32 ký tự).",
    };
  }

  return {
    mode,
    enabled: true,
    producerUrl,
    sharedSecret: usableSharedSecret,
    timeoutMs: parseTimeout(environment.ASSESSMENT_AI_QUEUE_DELIVERY_TIMEOUT_MS),
    reason: null,
  };
}

/**
 * A Pages project name is deliberately opt-in.  Do not allow every *.pages.dev
 * origin: that would turn a CORS allow-list into a wildcard.
 */
export function getCloudflarePagesProject(
  environment: NodeJS.ProcessEnv = process.env
): string | null {
  const project = environment.CLOUDFLARE_PAGES_PROJECT?.trim().toLowerCase();
  return project && /^[a-z0-9-]{1,63}$/.test(project) ? project : null;
}
