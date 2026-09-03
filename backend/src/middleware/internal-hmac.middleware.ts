import type { NextFunction, Request, Response } from "express";
import { getAssessmentAiQueueDeliveryConfig } from "../config/hybrid-cloudflare.js";
import { verifyAssessmentAiQueueRequest } from "../services/assessment-ai-queue-delivery.service.js";

const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const nonceSeenAt = new Map<string, number>();
const NONCE_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;

declare global {
  namespace Express {
    interface Request {
      rawBodyForSignature?: string;
    }
  }
}

function removeExpiredNonces(now: number) {
  for (const [nonce, seenAt] of nonceSeenAt) {
    if (now - seenAt > MAX_CLOCK_SKEW_MS) nonceSeenAt.delete(nonce);
  }
}

/**
 * Authenticates Worker-to-API callbacks without accepting user JWTs. A nonce is
 * replay-protected per API instance; the database claim lease remains the final
 * idempotency protection across horizontally scaled instances.
 */
export function requireAssessmentQueueHmac(expectedAudience: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const config = getAssessmentAiQueueDeliveryConfig();
    if (!config.sharedSecret) {
      res.status(503).json({ error: { code: "INTERNAL_CALLBACK_DISABLED", message: "Queue callback chưa được cấu hình." } });
      return;
    }
    const audience = req.header("x-uet-queue-audience");
    const timestamp = req.header("x-uet-queue-timestamp");
    const nonce = req.header("x-uet-queue-nonce");
    const signature = req.header("x-uet-queue-signature");
    const rawBody = req.rawBodyForSignature;
    const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN;
    const now = Date.now();

    if (
      audience !== expectedAudience ||
      !timestamp ||
      !nonce ||
      !signature ||
      rawBody === undefined ||
      !NONCE_PATTERN.test(nonce) ||
      !Number.isFinite(timestampMs) ||
      Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS
    ) {
      res.status(401).json({ error: { code: "INTERNAL_CALLBACK_INVALID", message: "Callback nội bộ không hợp lệ." } });
      return;
    }

    removeExpiredNonces(now);
    if (nonceSeenAt.has(nonce)) {
      res.status(409).json({ error: { code: "INTERNAL_CALLBACK_REPLAY", message: "Callback nội bộ đã được xử lý." } });
      return;
    }
    if (!verifyAssessmentAiQueueRequest(rawBody, config.sharedSecret, expectedAudience, timestamp, nonce, signature)) {
      res.status(401).json({ error: { code: "INTERNAL_CALLBACK_INVALID", message: "Callback nội bộ không hợp lệ." } });
      return;
    }
    nonceSeenAt.set(nonce, now);
    if (nonceSeenAt.size > 10_000) {
      removeExpiredNonces(now);
      // Keep a fixed memory ceiling even if a trusted Worker is misconfigured
      // and emits too many unique callbacks in one clock-skew window.
      for (const storedNonce of nonceSeenAt.keys()) {
        if (nonceSeenAt.size <= 10_000) break;
        nonceSeenAt.delete(storedNonce);
      }
    }
    next();
  };
}
