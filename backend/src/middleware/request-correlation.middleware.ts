import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;

export function resolveRequestId(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : crypto.randomUUID();
}

/**
 * Keeps a safe correlation ID across browser, API and asynchronous delivery.
 * It accepts no arbitrary text in logs or response headers.
 */
export function requestCorrelationMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = resolveRequestId(req.headers["x-request-id"]);
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
