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

function createDraft() {
  return {
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
    expect(status.providers.map((provider) => provider.value)).toEqual([
      "openai",
      "anthropic",
      "gemini",
      "groq",
      "openrouter",
    ]);
  });

  it("switches provider and applies the provider default model", async () => {
    const result = await updateAiConfig(
      {
        provider: "anthropic",
      },
      ADMIN_ID,
      getDb() as never
    );

    expect(isAiServiceError(result)).toBe(false);
    expect(result).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      enabled: false,
      keyConfigured: false,
      lastCheckStatus: "missing",
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

  it("tests a Gemini API key through the selected provider", async () => {
    const db = getDb();
    await updateAiConfig(
      { provider: "gemini", apiKey: "AIza-test-key" },
      ADMIN_ID,
      db as never
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await testAiConfig(ADMIN_ID, db as never);

    expect(isAiServiceError(result)).toBe(false);
    expect(result).toMatchObject({
      provider: "gemini",
      model: "gemini-2.5-flash",
      enabled: true,
      lastCheckStatus: "ok",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?key=AIza-test-key"
    );
  });

  it("tests a Groq API key through the selected provider", async () => {
    const db = getDb();
    await updateAiConfig(
      { provider: "groq", apiKey: "gsk_test_key" },
      ADMIN_ID,
      db as never
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await testAiConfig(ADMIN_ID, db as never);

    expect(isAiServiceError(result)).toBe(false);
    expect(result).toMatchObject({
      provider: "groq",
      model: "openai/gpt-oss-20b",
      enabled: true,
      lastCheckStatus: "ok",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer gsk_test_key",
        }),
      })
    );
  });

  it("generates an exercise draft through OpenAI Responses structured output", async () => {
    const db = getDb();
    await updateAiConfig({ apiKey: "sk-test-secret-key" }, ADMIN_ID, db as never);

    const draft = createDraft();

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

  it("generates an exercise draft through Anthropic tool use", async () => {
    const db = getDb();
    await updateAiConfig(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        apiKey: "sk-ant-test-secret-key",
      },
      ADMIN_ID,
      db as never
    );

    const draft = createDraft();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: "text", text: "OK" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "tool_use",
              name: "create_oop_exercise_template",
              input: draft,
            },
          ],
        }),
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
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "sk-ant-test-secret-key",
          "anthropic-version": "2023-06-01",
        }),
      })
    );
  });

  it("generates an exercise draft through Gemini structured JSON", async () => {
    const db = getDb();
    await updateAiConfig(
      {
        provider: "gemini",
        model: "gemini-2.5-flash",
        apiKey: "AIza-test-key",
      },
      ADMIN_ID,
      db as never
    );

    const draft = createDraft();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(draft) }],
              },
            },
          ],
        }),
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
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIza-test-key",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
    const [, request] = fetchMock.mock.calls[1];
    const body = JSON.parse(String(request?.body)) as {
      generationConfig: { responseSchema: unknown };
    };
    expect(JSON.stringify(body.generationConfig.responseSchema)).not.toContain("additionalProperties");
    expect(JSON.stringify(body.generationConfig.responseSchema)).not.toContain("\"enum\":[1]");
  });

  it("generates an exercise draft through Groq structured chat output", async () => {
    const db = getDb();
    await updateAiConfig(
      {
        provider: "groq",
        model: "openai/gpt-oss-20b",
        apiKey: "gsk_test_key",
      },
      ADMIN_ID,
      db as never
    );

    const draft = createDraft();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(draft) } }],
        }),
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
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gsk_test_key",
        }),
      })
    );
  });

  it("generates an exercise draft through OpenRouter free router", async () => {
    const db = getDb();
    await updateAiConfig(
      {
        provider: "openrouter",
        model: "openrouter/free",
        apiKey: "sk-or-v1-test-key",
      },
      ADMIN_ID,
      db as never
    );

    const draft = createDraft();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "OK" } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(draft) } }],
        }),
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
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-or-v1-test-key",
        }),
      })
    );
  });
});
