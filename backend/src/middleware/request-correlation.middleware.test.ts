import { describe, expect, it, vi } from "vitest";
import { requestCorrelationMiddleware, resolveRequestId } from "./request-correlation.middleware.js";

describe("request correlation middleware", () => {
  it("preserves a safe caller-supplied ID", () => {
    expect(resolveRequestId("deploy-2026-09-03")).toBe("deploy-2026-09-03");
  });

  it("replaces invalid caller input before reflecting it in a response header", () => {
    const setHeader = vi.fn();
    const next = vi.fn();
    const req = { headers: { "x-request-id": "<script>alert(1)</script>" } } as any;
    requestCorrelationMiddleware(req, { setHeader } as any, next);
    expect(req.requestId).toMatch(/^[A-Za-z0-9._:-]{8,160}$/);
    expect(setHeader).toHaveBeenCalledWith("X-Request-Id", req.requestId);
    expect(next).toHaveBeenCalledOnce();
  });
});
