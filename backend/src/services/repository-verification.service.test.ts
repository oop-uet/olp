import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isRepositoryVerificationError,
  verifyProjectRepository,
} from "./repository-verification.service.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Repository verification service", () => {
  beforeEach(() => {
    process.env.PROJECT_REPOSITORY_GITHUB_TOKEN = "github-token";
    process.env.PROJECT_REPOSITORY_REQUIRED_COLLABORATOR = "oasis-uet";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PROJECT_REPOSITORY_GITHUB_TOKEN;
    delete process.env.PROJECT_REPOSITORY_REQUIRED_COLLABORATOR;
  });

  it("accepts a pending invitation before verifying a private repository", async () => {
    let repoLookupCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/user")) {
        return jsonResponse({ login: "oasis-uet" });
      }

      if (url.endsWith("/repos/alice/project")) {
        repoLookupCount += 1;
        return repoLookupCount === 1
          ? jsonResponse({ message: "Not Found" }, 404)
          : jsonResponse({ private: true, full_name: "alice/project" });
      }

      if (url.includes("/user/repository_invitations?")) {
        return jsonResponse([{ id: 44, repository: { full_name: "alice/project" } }]);
      }

      if (url.endsWith("/user/repository_invitations/44") && method === "PATCH") {
        return new Response(null, { status: 204 });
      }

      return jsonResponse({ message: "Unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyProjectRepository("https://github.com/alice/project");

    expect(isRepositoryVerificationError(result)).toBe(false);
    expect(result).toMatchObject({
      owner: "alice",
      repo: "project",
      fullName: "alice/project",
      private: true,
      collaborator: "oasis-uet",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user/repository_invitations/44",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(repoLookupCount).toBe(2);
  });

  it("returns collaborator required when no pending invitation exists", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/user")) {
        return jsonResponse({ login: "oasis-uet" });
      }

      if (url.endsWith("/repos/alice/project")) {
        return jsonResponse({ message: "Not Found" }, 404);
      }

      if (url.includes("/user/repository_invitations?")) {
        return jsonResponse([]);
      }

      return jsonResponse({ message: "Unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyProjectRepository("https://github.com/alice/project");

    expect(isRepositoryVerificationError(result)).toBe(true);
    if (isRepositoryVerificationError(result)) {
      expect(result.error.code).toBe("COLLABORATOR_REQUIRED");
      expect(result.error.message).toContain("oasis-uet");
    }
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/user/repository_invitations/"),
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("does not auto-accept an invitation with a token from the wrong GitHub user", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/user")) {
        return jsonResponse({ login: "another-account" });
      }

      if (url.endsWith("/repos/alice/project")) {
        return jsonResponse({ message: "Not Found" }, 404);
      }

      return jsonResponse({ message: "Unexpected request" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyProjectRepository("https://github.com/alice/project");

    expect(isRepositoryVerificationError(result)).toBe(true);
    if (isRepositoryVerificationError(result)) {
      expect(result.error.code).toBe("CONFIGURATION_ERROR");
      expect(result.error.message).toContain("oasis-uet");
    }
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/user/repository_invitations"),
      expect.anything()
    );
  });
});
