import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import {
  generateExerciseDraft,
  getAiConfigStatus,
  isAiServiceError,
  testAiConfig,
  updateAiConfig,
} from "./ai-exercise.service.js";

function getDb() {
  return drizzle(getTestSqlite(), { schema });
}

const ADMIN_ID = "admin-user";
const ORIGINAL_SECRET = process.env.JWT_SECRET;

function resetAiConfigRows() {
  const sqlite = getTestSqlite();
  sqlite.exec("PRAGMA foreign_keys = OFF;");
  sqlite.exec("DELETE FROM system_config WHERE key LIKE 'ai_generation_%';");
}

describe("AI Exercise Service", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-ai-secret";
    resetAiConfigRows();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.JWT_SECRET = ORIGINAL_SECRET;
  });

  it("creates disabled default AI config without exposing a key", async () => {
    const status = await getAiConfigStatus(getDb() as never);

    expect(status).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      enabled: false,
      keyConfigured: false,
      keyLast4: "",
      lastCheckStatus: "missing",
      encryptionReady: true,
    });
  });

  it("stores API key metadata and keeps generation disabled until the key is tested", async () => {
    const result = await updateAiConfig(
      {
        model: "gpt-4o-mini",
        apiKey: "sk-test-secret-key",
        enabled: true,
      },
      ADMIN_ID,
      getDb() as never
    );

    expect(isAiServiceError(result)).toBe(false);
    expect(result).toMatchObject({
      keyConfigured: true,
      keyLast4: "-key",
      lastCheckStatus: "untested",
      enabled: false,
    });
  });

  it("enables generation after a successful key test", async () => {
    const db = getDb();
    await updateAiConfig({ apiKey: "sk-test-secret-key" }, ADMIN_ID, db as never);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      })
    );

    const result = await testAiConfig(ADMIN_ID, db as never);

    expect(isAiServiceError(result)).toBe(false);
    expect(result).toMatchObject({
      enabled: true,
      lastCheckStatus: "ok",
      lastCheckError: "",
    });
  });

  it("generates an exercise draft through OpenAI Responses structured output", async () => {
    const db = getDb();
    await updateAiConfig({ apiKey: "sk-test-secret-key" }, ADMIN_ID, db as never);

    const draft = {
      format: "uet-oasis-oop-exercise-template",
      version: 1,
      title: "Quản lý phiếu mượn sách",
      description: "Viết các lớp quản lý phiếu mượn sách và kiểm tra trạng thái trả sách.",
      difficulty: "medium",
      oop_tags: ["classes and objects", "encapsulation"],
      starter_code: "",
      style_check_enabled: true,
      style_policy: {
        enabled: true,
        profile: "google",
        disabledRules: ["javadoc", "line_length"],
        weightPercent: 10,
        penaltyPerViolation: 5,
        maxViolations: 20,
      },
      test_cases: [
        {
          input_data: "__OOP_JAVA_TEST__\nLibraryLoanTest.java",
          expected_output: "public class LibraryLoanTest {}",
          is_visible: true,
          point_value: 50,
          time_limit_seconds: 5,
        },
        {
          input_data: "__OOP_JAVA_TEST__\nHiddenLibraryLoanTest.java",
          expected_output: "public class HiddenLibraryLoanTest {}",
          is_visible: false,
          point_value: 50,
          time_limit_seconds: 5,
        },
      ],
      authoring_notes: ["Draft for instructor review."],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output_text: JSON.stringify(draft) }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await testAiConfig(ADMIN_ID, db as never);
    const result = await generateExerciseDraft(
      {
        topic: "phiếu mượn sách",
        difficulty: "medium",
        test_count: 2,
        oop_tags: ["classes and objects", "encapsulation"],
        lecture_context: "",
        additional_requirements: "",
      },
      db as never
    );

    expect(isAiServiceError(result)).toBe(false);
    expect(result).toMatchObject({ draft });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-secret-key",
        }),
      })
    );
  });
});
