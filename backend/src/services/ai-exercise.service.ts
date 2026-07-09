import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "../db/index.js";
import { systemConfig } from "../db/schema.js";

type Database = typeof defaultDb;

const CONFIG_KEYS = {
  provider: "ai_generation_provider",
  model: "ai_generation_model",
  enabled: "ai_generation_enabled",
  encryptedApiKey: "ai_generation_api_key_encrypted",
  keyLast4: "ai_generation_api_key_last4",
  lastCheckStatus: "ai_generation_last_check_status",
  lastCheckError: "ai_generation_last_check_error",
  lastCheckedAt: "ai_generation_last_checked_at",
} as const;

const DEFAULT_MODEL = "gpt-4o-mini";
const ENCRYPTION_PREFIX = "v1";

const DEFAULT_CONFIGS: Array<{ key: string; value: string; validRange: string }> = [
  { key: CONFIG_KEYS.provider, value: "openai", validRange: "enum:openai" },
  { key: CONFIG_KEYS.model, value: DEFAULT_MODEL, validRange: "text" },
  { key: CONFIG_KEYS.enabled, value: "0", validRange: "0-1" },
  { key: CONFIG_KEYS.encryptedApiKey, value: "", validRange: "secret" },
  { key: CONFIG_KEYS.keyLast4, value: "", validRange: "text" },
  { key: CONFIG_KEYS.lastCheckStatus, value: "missing", validRange: "enum:missing,untested,ok,error" },
  { key: CONFIG_KEYS.lastCheckError, value: "", validRange: "text" },
  { key: CONFIG_KEYS.lastCheckedAt, value: "", validRange: "text" },
];

export const aiGenerateExerciseSchema = z.object({
  topic: z.string().min(3).max(300),
  difficulty: z.enum(["easy", "medium", "hard"]),
  test_count: z.number().int().min(1).max(20),
  oop_tags: z.array(z.string().min(1).max(60)).max(5).optional().default([]),
  lecture_context: z.string().max(12000).optional().default(""),
  additional_requirements: z.string().max(2500).optional().default(""),
  template: z.unknown().optional(),
});

const stylePolicySchema = z.object({
  enabled: z.boolean(),
  profile: z.string(),
  disabledRules: z.array(z.string()),
  weightPercent: z.number().min(0).max(50),
  penaltyPerViolation: z.number().min(1).max(100),
  maxViolations: z.number().int().min(1).max(100),
});

const generatedTestCaseSchema = z.object({
  input_data: z.string(),
  expected_output: z.string().min(1),
  is_visible: z.boolean(),
  point_value: z.number().int().min(1).max(100),
  time_limit_seconds: z.number().int().min(1).max(30),
});

const generatedExerciseSchema = z.object({
  format: z.literal("uet-oasis-oop-exercise-template"),
  version: z.literal(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  difficulty: z.enum(["easy", "medium", "hard"]),
  oop_tags: z.array(z.string().min(1).max(60)).min(1).max(5),
  starter_code: z.string(),
  style_check_enabled: z.boolean(),
  style_policy: stylePolicySchema,
  test_cases: z.array(generatedTestCaseSchema).min(1).max(50),
  authoring_notes: z.array(z.string()).max(8).optional(),
});

export type AiGenerateExerciseInput = z.infer<typeof aiGenerateExerciseSchema>;
export type GeneratedExerciseDraft = z.infer<typeof generatedExerciseSchema>;

export interface AiConfigStatus {
  provider: "openai";
  model: string;
  enabled: boolean;
  keyConfigured: boolean;
  keyLast4: string;
  lastCheckStatus: "missing" | "untested" | "ok" | "error";
  lastCheckError: string;
  lastCheckedAt: string;
  encryptionReady: boolean;
}

export interface AiAvailability {
  enabled: boolean;
  provider: "openai";
  model: string;
  reason: string | null;
}

export interface AiServiceError {
  error: {
    code: string;
    message: string;
  };
}

export function isAiServiceError(value: unknown): value is AiServiceError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as AiServiceError).error?.code === "string"
  );
}

async function ensureAiConfigRows(database: Database = defaultDb): Promise<void> {
  const now = new Date().toISOString();
  for (const config of DEFAULT_CONFIGS) {
    await database
      .insert(systemConfig)
      .values({
        ...config,
        updatedAt: now,
        updatedBy: null,
      })
      .onConflictDoNothing();
  }
}

async function readConfigMap(database: Database = defaultDb): Promise<Record<string, string>> {
  await ensureAiConfigRows(database);
  const rows = await database.select().from(systemConfig);
  return rows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

async function setConfigValue(
  key: string,
  value: string,
  updatedBy: string | null,
  database: Database = defaultDb
): Promise<void> {
  await database
    .update(systemConfig)
    .set({
      value,
      updatedAt: new Date().toISOString(),
      updatedBy,
    })
    .where(eq(systemConfig.key, key));
}

function getEncryptionSecret(): string | null {
  const secret = process.env.AI_SECRET_ENCRYPTION_KEY || process.env.JWT_SECRET || "";
  return secret.trim() || null;
}

function getEncryptionKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptApiKey(apiKey: string): string | AiServiceError {
  const secret = getEncryptionSecret();
  if (!secret) {
    return {
      error: {
        code: "ENCRYPTION_KEY_MISSING",
        message:
          "Chưa cấu hình AI_SECRET_ENCRYPTION_KEY hoặc JWT_SECRET nên không thể lưu API key.",
      },
    };
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptApiKey(encryptedApiKey: string): string | AiServiceError {
  if (!encryptedApiKey) {
    return {
      error: {
        code: "AI_KEY_MISSING",
        message: "Chưa cấu hình API key cho tính năng tạo bài tập bằng AI.",
      },
    };
  }

  const secret = getEncryptionSecret();
  if (!secret) {
    return {
      error: {
        code: "ENCRYPTION_KEY_MISSING",
        message:
          "Chưa cấu hình AI_SECRET_ENCRYPTION_KEY hoặc JWT_SECRET nên không thể đọc API key.",
      },
    };
  }

  try {
    const [version, ivRaw, tagRaw, encryptedRaw] = encryptedApiKey.split(":");
    if (version !== ENCRYPTION_PREFIX || !ivRaw || !tagRaw || !encryptedRaw) {
      throw new Error("Invalid encrypted key format");
    }

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(secret),
      Buffer.from(ivRaw, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return {
      error: {
        code: "AI_KEY_DECRYPT_FAILED",
        message: "Không giải mã được API key AI. Vui lòng lưu lại key mới.",
      },
    };
  }
}

function toStatus(config: Record<string, string>): AiConfigStatus {
  const keyConfigured = Boolean(config[CONFIG_KEYS.encryptedApiKey]);
  const rawStatus = config[CONFIG_KEYS.lastCheckStatus] || "missing";
  const lastCheckStatus =
    rawStatus === "ok" || rawStatus === "error" || rawStatus === "untested"
      ? rawStatus
      : "missing";

  return {
    provider: "openai",
    model: config[CONFIG_KEYS.model] || DEFAULT_MODEL,
    enabled: config[CONFIG_KEYS.enabled] === "1" && keyConfigured && lastCheckStatus === "ok",
    keyConfigured,
    keyLast4: config[CONFIG_KEYS.keyLast4] || "",
    lastCheckStatus: keyConfigured ? lastCheckStatus : "missing",
    lastCheckError: config[CONFIG_KEYS.lastCheckError] || "",
    lastCheckedAt: config[CONFIG_KEYS.lastCheckedAt] || "",
    encryptionReady: Boolean(getEncryptionSecret()),
  };
}

export async function getAiConfigStatus(database: Database = defaultDb): Promise<AiConfigStatus> {
  const config = await readConfigMap(database);
  return toStatus(config);
}

export async function getAiAvailability(database: Database = defaultDb): Promise<AiAvailability> {
  const status = await getAiConfigStatus(database);
  let reason: string | null = null;

  if (!status.keyConfigured) {
    reason = "Quản trị viên chưa cấu hình API key AI.";
  } else if (!status.encryptionReady) {
    reason = "Backend thiếu AI_SECRET_ENCRYPTION_KEY hoặc JWT_SECRET để đọc API key.";
  } else if (status.lastCheckStatus !== "ok") {
    reason = "API key AI chưa được kiểm tra thành công.";
  } else if (!status.enabled) {
    reason = "Tính năng tạo bài tập bằng AI đang tắt trong cấu hình quản trị.";
  }

  return {
    enabled: !reason,
    provider: status.provider,
    model: status.model,
    reason,
  };
}

export async function updateAiConfig(
  input: {
    provider?: "openai";
    model?: string;
    apiKey?: string;
    enabled?: boolean;
    clearApiKey?: boolean;
  },
  updatedBy: string,
  database: Database = defaultDb
): Promise<AiConfigStatus | AiServiceError> {
  await ensureAiConfigRows(database);

  if (input.provider && input.provider !== "openai") {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Hiện tại hệ thống chỉ hỗ trợ provider OpenAI.",
      },
    };
  }

  const nextModel = input.model?.trim();
  if (nextModel !== undefined) {
    if (nextModel.length < 3 || nextModel.length > 120) {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: "Tên model AI phải có từ 3 đến 120 ký tự.",
        },
      };
    }
    await setConfigValue(CONFIG_KEYS.model, nextModel, updatedBy, database);
  }

  if (input.provider) {
    await setConfigValue(CONFIG_KEYS.provider, input.provider, updatedBy, database);
  }

  if (input.clearApiKey) {
    await setConfigValue(CONFIG_KEYS.encryptedApiKey, "", updatedBy, database);
    await setConfigValue(CONFIG_KEYS.keyLast4, "", updatedBy, database);
    await setConfigValue(CONFIG_KEYS.lastCheckStatus, "missing", updatedBy, database);
    await setConfigValue(CONFIG_KEYS.lastCheckError, "", updatedBy, database);
    await setConfigValue(CONFIG_KEYS.enabled, "0", updatedBy, database);
  } else if (input.apiKey?.trim()) {
    const apiKey = input.apiKey.trim();
    const encrypted = encryptApiKey(apiKey);
    if (isAiServiceError(encrypted)) return encrypted;

    await setConfigValue(CONFIG_KEYS.encryptedApiKey, encrypted, updatedBy, database);
    await setConfigValue(CONFIG_KEYS.keyLast4, apiKey.slice(-4), updatedBy, database);
    await setConfigValue(CONFIG_KEYS.lastCheckStatus, "untested", updatedBy, database);
    await setConfigValue(CONFIG_KEYS.lastCheckError, "", updatedBy, database);
    await setConfigValue(CONFIG_KEYS.lastCheckedAt, "", updatedBy, database);
    await setConfigValue(CONFIG_KEYS.enabled, "0", updatedBy, database);
  }

  if (typeof input.enabled === "boolean") {
    const currentStatus = await getAiConfigStatus(database);
    const canEnable =
      input.enabled &&
      currentStatus.keyConfigured &&
      currentStatus.encryptionReady &&
      currentStatus.lastCheckStatus === "ok";
    await setConfigValue(CONFIG_KEYS.enabled, canEnable ? "1" : "0", updatedBy, database);
  }

  return getAiConfigStatus(database);
}

export async function testAiConfig(
  updatedBy: string,
  database: Database = defaultDb
): Promise<AiConfigStatus | AiServiceError> {
  const config = await readConfigMap(database);
  const apiKey = decryptApiKey(config[CONFIG_KEYS.encryptedApiKey] || "");
  if (isAiServiceError(apiKey)) return apiKey;

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const message = await readOpenAiError(response);
      await setConfigValue(CONFIG_KEYS.lastCheckStatus, "error", updatedBy, database);
      await setConfigValue(CONFIG_KEYS.lastCheckError, message, updatedBy, database);
      await setConfigValue(CONFIG_KEYS.lastCheckedAt, new Date().toISOString(), updatedBy, database);
      await setConfigValue(CONFIG_KEYS.enabled, "0", updatedBy, database);
      return getAiConfigStatus(database);
    }

    await setConfigValue(CONFIG_KEYS.lastCheckStatus, "ok", updatedBy, database);
    await setConfigValue(CONFIG_KEYS.lastCheckError, "", updatedBy, database);
    await setConfigValue(CONFIG_KEYS.lastCheckedAt, new Date().toISOString(), updatedBy, database);
    await setConfigValue(CONFIG_KEYS.enabled, "1", updatedBy, database);
    return getAiConfigStatus(database);
  } catch {
    await setConfigValue(CONFIG_KEYS.lastCheckStatus, "error", updatedBy, database);
    await setConfigValue(
      CONFIG_KEYS.lastCheckError,
      "Không thể kết nối tới OpenAI để kiểm tra API key.",
      updatedBy,
      database
    );
    await setConfigValue(CONFIG_KEYS.lastCheckedAt, new Date().toISOString(), updatedBy, database);
    await setConfigValue(CONFIG_KEYS.enabled, "0", updatedBy, database);
    return getAiConfigStatus(database);
  }
}

export async function generateExerciseDraft(
  input: AiGenerateExerciseInput,
  database: Database = defaultDb
): Promise<{ draft: GeneratedExerciseDraft } | AiServiceError> {
  const config = await readConfigMap(database);
  const availability = await getAiAvailability(database);
  if (!availability.enabled) {
    return {
      error: {
        code: "AI_GENERATION_DISABLED",
        message: availability.reason || "Tính năng tạo bài tập bằng AI chưa sẵn sàng.",
      },
    };
  }

  const apiKey = decryptApiKey(config[CONFIG_KEYS.encryptedApiKey] || "");
  if (isAiServiceError(apiKey)) return apiKey;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenAiRequest(config[CONFIG_KEYS.model] || DEFAULT_MODEL, input)),
    });

    if (!response.ok) {
      return {
        error: {
          code: "OPENAI_REQUEST_FAILED",
          message: await readOpenAiError(response),
        },
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const text = extractOutputText(payload);
    if (!text) {
      return {
        error: {
          code: "OPENAI_EMPTY_RESPONSE",
          message: "OpenAI không trả về nội dung bài tập.",
        },
      };
    }

    const parsed = JSON.parse(text) as unknown;
    const draft = generatedExerciseSchema.parse(parsed);
    return { draft };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return {
        error: {
          code: "AI_RESPONSE_INVALID",
          message: "AI trả về dữ liệu không đúng schema template bài tập.",
        },
      };
    }

    return {
      error: {
        code: "AI_GENERATION_FAILED",
        message: "Không thể tạo bài tập bằng AI. Vui lòng thử lại sau.",
      },
    };
  }
}

function buildOpenAiRequest(model: string, input: AiGenerateExerciseInput) {
  return {
    model,
    instructions: [
      "Bạn là trợ lý ra đề lập trình Java OOP cho hệ thống UET OASIS.",
      "Luôn trả về JSON hợp lệ theo schema. Không trả markdown, không giải thích ngoài JSON.",
      "Đề bài phải mới, không sao chép đề có sẵn, phù hợp sinh viên đang học OOP Java.",
      "Ưu tiên test JUnit 4 cho bài OOP: input_data bắt đầu bằng __OOP_JAVA_TEST__\\nTênFileTest.java và expected_output là mã test đầy đủ.",
      "Starter code nên dùng JSON string format oop-java-files nếu bài cần nhiều file Java.",
      "Test case cần gồm cả visible và hidden nếu số lượng test từ 2 trở lên; tổng điểm nên xấp xỉ 100.",
      "Mô tả bài tập bằng tiếng Việt, rõ lớp, thuộc tính, constructor, phương thức và ràng buộc dữ liệu.",
    ].join("\n"),
    input: buildPrompt(input),
    temperature: 0.35,
    max_output_tokens: 7000,
    text: {
      format: {
        type: "json_schema",
        name: "oop_exercise_template",
        strict: true,
        schema: exerciseJsonSchema,
      },
    },
  };
}

function buildPrompt(input: AiGenerateExerciseInput): string {
  return JSON.stringify(
    {
      request: {
        topic: input.topic,
        difficulty: input.difficulty,
        desired_test_count: input.test_count,
        oop_tags: input.oop_tags,
        lecture_context: input.lecture_context || null,
        additional_requirements: input.additional_requirements || null,
      },
      current_template_to_follow: input.template ?? null,
      output_contract:
        "Sinh một template bài tập mới theo format uet-oasis-oop-exercise-template để giảng viên có thể áp dụng vào form.",
    },
    null,
    2
  );
}

const exerciseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    format: { type: "string", enum: ["uet-oasis-oop-exercise-template"] },
    version: { type: "number", enum: [1] },
    title: { type: "string" },
    description: { type: "string" },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    oop_tags: {
      type: "array",
      items: { type: "string" },
    },
    starter_code: { type: "string" },
    style_check_enabled: { type: "boolean" },
    style_policy: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        profile: { type: "string" },
        disabledRules: {
          type: "array",
          items: { type: "string" },
        },
        weightPercent: { type: "number" },
        penaltyPerViolation: { type: "number" },
        maxViolations: { type: "number" },
      },
      required: [
        "enabled",
        "profile",
        "disabledRules",
        "weightPercent",
        "penaltyPerViolation",
        "maxViolations",
      ],
    },
    test_cases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          input_data: { type: "string" },
          expected_output: { type: "string" },
          is_visible: { type: "boolean" },
          point_value: { type: "number" },
          time_limit_seconds: { type: "number" },
        },
        required: [
          "input_data",
          "expected_output",
          "is_visible",
          "point_value",
          "time_limit_seconds",
        ],
      },
    },
    authoring_notes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "format",
    "version",
    "title",
    "description",
    "difficulty",
    "oop_tags",
    "starter_code",
    "style_check_enabled",
    "style_policy",
    "test_cases",
    "authoring_notes",
  ],
};

async function readOpenAiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    return payload.error?.message || `OpenAI trả về lỗi HTTP ${response.status}.`;
  } catch {
    return `OpenAI trả về lỗi HTTP ${response.status}.`;
  }
}

function extractOutputText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;

  const output = payload.output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }

  return null;
}
