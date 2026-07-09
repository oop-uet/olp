import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "../db/index.js";
import { systemConfig } from "../db/schema.js";

type Database = typeof defaultDb;
type AiProvider = "openai" | "anthropic" | "gemini" | "groq" | "openrouter";

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

const DEFAULT_PROVIDER: AiProvider = "openai";
const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
  groq: "openai/gpt-oss-20b",
  openrouter: "openrouter/free",
};
const ENCRYPTION_PREFIX = "v1";

const DEFAULT_CONFIGS: Array<{ key: string; value: string; validRange: string }> = [
  { key: CONFIG_KEYS.provider, value: DEFAULT_PROVIDER, validRange: "enum:openai,anthropic,gemini,groq,openrouter" },
  { key: CONFIG_KEYS.model, value: DEFAULT_MODELS.openai, validRange: "text" },
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
  provider: AiProvider;
  providers: Array<{ value: AiProvider; label: string; defaultModel: string; keyPlaceholder: string }>;
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
  provider: AiProvider;
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
  const provider = parseProvider(config[CONFIG_KEYS.provider]);
  const rawStatus = config[CONFIG_KEYS.lastCheckStatus] || "missing";
  const lastCheckStatus =
    rawStatus === "ok" || rawStatus === "error" || rawStatus === "untested"
      ? rawStatus
      : "missing";

  return {
    provider,
    providers: getProviderOptions(),
    model: config[CONFIG_KEYS.model] || DEFAULT_MODELS[provider],
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
    provider?: AiProvider;
    model?: string;
    apiKey?: string;
    enabled?: boolean;
    clearApiKey?: boolean;
  },
  updatedBy: string,
  database: Database = defaultDb
): Promise<AiConfigStatus | AiServiceError> {
  await ensureAiConfigRows(database);

  if (input.provider && !isSupportedProvider(input.provider)) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Provider AI không được hỗ trợ.",
      },
    };
  }

  const currentConfig = await readConfigMap(database);
  const currentProvider = parseProvider(currentConfig[CONFIG_KEYS.provider]);
  const providerChanged = Boolean(input.provider && input.provider !== currentProvider);

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
    if (nextModel === undefined) {
      await setConfigValue(CONFIG_KEYS.model, DEFAULT_MODELS[input.provider], updatedBy, database);
    }
    if (providerChanged && !input.apiKey?.trim()) {
      await setConfigValue(CONFIG_KEYS.lastCheckStatus, "untested", updatedBy, database);
      await setConfigValue(CONFIG_KEYS.lastCheckError, "Provider đã thay đổi, vui lòng lưu API key phù hợp và kiểm tra lại.", updatedBy, database);
      await setConfigValue(CONFIG_KEYS.enabled, "0", updatedBy, database);
    }
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
  const provider = parseProvider(config[CONFIG_KEYS.provider]);
  const model = config[CONFIG_KEYS.model] || DEFAULT_MODELS[provider];

  try {
    const testResult = await testProviderKey(provider, model, apiKey);

    if (!testResult.ok) {
      await setConfigValue(CONFIG_KEYS.lastCheckStatus, "error", updatedBy, database);
      await setConfigValue(CONFIG_KEYS.lastCheckError, testResult.message, updatedBy, database);
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
      `Không thể kết nối tới ${getProviderLabel(provider)} để kiểm tra API key.`,
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
  const provider = parseProvider(config[CONFIG_KEYS.provider]);
  const model = config[CONFIG_KEYS.model] || DEFAULT_MODELS[provider];

  try {
    const text = await generateWithProvider(provider, model, apiKey, input);
    if (isAiServiceError(text)) return text;
    if (!text) {
      return {
        error: {
          code: "AI_EMPTY_RESPONSE",
          message: `${getProviderLabel(provider)} không trả về nội dung bài tập.`,
        },
      };
    }

    const parsed = JSON.parse(text) as unknown;
    const draft = generatedExerciseSchema.parse(normalizeGeneratedExercise(parsed));
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
    instructions: getGenerationInstructions(),
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

function buildAnthropicRequest(model: string, input: AiGenerateExerciseInput) {
  return {
    model,
    max_tokens: 7000,
    temperature: 0.35,
    system: getGenerationInstructions(),
    messages: [
      {
        role: "user",
        content: buildPrompt(input),
      },
    ],
    tools: [
      {
        name: "create_oop_exercise_template",
        description: "Create one Java OOP exercise template for UET OASIS.",
        input_schema: exerciseJsonSchema,
      },
    ],
    tool_choice: {
      type: "tool",
      name: "create_oop_exercise_template",
    },
  };
}

function buildGeminiRequest(input: AiGenerateExerciseInput) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${getGenerationInstructions()}\n\n${buildPrompt(input)}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 7000,
      responseMimeType: "application/json",
      responseSchema: toGeminiResponseSchema(exerciseJsonSchema),
    },
  };
}

function toGeminiResponseSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(toGeminiResponseSchema);
  }

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    if (key === "enum" && Array.isArray(value) && !value.every((item) => typeof item === "string")) {
      continue;
    }
    output[key] = toGeminiResponseSchema(value);
  }

  return output;
}

function buildOpenAiCompatibleChatRequest(model: string, input: AiGenerateExerciseInput) {
  return {
    model,
    messages: [
      {
        role: "system",
        content: getGenerationInstructions(),
      },
      {
        role: "user",
        content: buildPrompt(input),
      },
    ],
    temperature: 0.35,
    max_tokens: 7000,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "oop_exercise_template",
        strict: true,
        schema: exerciseJsonSchema,
      },
    },
  };
}

function getGenerationInstructions(): string {
  return [
    "Bạn là trợ lý ra đề lập trình Java OOP cho hệ thống UET OASIS.",
    "Luôn trả về JSON hợp lệ theo schema. Không trả markdown, không giải thích ngoài JSON.",
    "Đề bài phải mới, không sao chép đề có sẵn, phù hợp sinh viên đang học OOP Java.",
    "Ưu tiên test JUnit 4 cho bài OOP: input_data bắt đầu bằng __OOP_JAVA_TEST__\\nTênFileTest.java và expected_output là mã test đầy đủ.",
    "Starter code nhiều file phải là JSON string có dạng {\"format\":\"oop-java-files\",\"version\":1,\"files\":[{\"name\":\"Book.java\",\"content\":\"...\"}]}; không dùng key \"oop-java-files\" ở cấp gốc và không dùng field \"filename\".",
    "Mã Java trong starter_code và expected_output phải được xuống dòng, thụt lề dễ đọc; không nén cả file Java thành một dòng.",
    "starter_code phải biên dịch được ngay cả khi còn TODO: method chưa cài phải có thân hàm placeholder hợp lệ; không thêm Main.java demo nếu nó gọi method chưa tồn tại hoặc có lỗi cú pháp.",
    "Test case cần gồm cả visible và hidden nếu số lượng test từ 2 trở lên; tổng điểm nên xấp xỉ 100.",
    "Mô tả bài tập bằng tiếng Việt, rõ lớp, thuộc tính, constructor, phương thức và ràng buộc dữ liệu.",
  ].join("\n");
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

function normalizeGeneratedExercise(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const draft = value as Record<string, unknown>;
  return {
    ...draft,
    starter_code: normalizeStarterCode(draft.starter_code),
    test_cases: Array.isArray(draft.test_cases)
      ? draft.test_cases.map(normalizeGeneratedTestCase)
      : draft.test_cases,
  };
}

function normalizeGeneratedTestCase(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const testCase = value as Record<string, unknown>;
  const expectedOutput = testCase.expected_output;
  return {
    ...testCase,
    expected_output:
      typeof expectedOutput === "string" && isJUnitTestCaseInput(testCase.input_data)
        ? formatJavaSource(expectedOutput)
        : expectedOutput,
  };
}

function isJUnitTestCaseInput(inputData: unknown): boolean {
  return typeof inputData === "string" && inputData.trimStart().startsWith("__OOP_JAVA_TEST__");
}

function normalizeStarterCode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = normalizeJavaFilesJson(value);
  if (normalized) return normalized;
  return looksLikeJavaSource(value) ? formatJavaSource(value) : value;
}

function normalizeJavaFilesJson(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const container = parsed as Record<string, unknown>;
    const rawFiles =
      container.format === "oop-java-files" && Array.isArray(container.files)
        ? container.files
        : Array.isArray(container["oop-java-files"])
          ? container["oop-java-files"]
          : null;

    if (!rawFiles) return null;
    const files = rawFiles
      .map((file) => {
        if (!file || typeof file !== "object" || Array.isArray(file)) return null;
        const rawFile = file as Record<string, unknown>;
        const name = typeof rawFile.name === "string"
          ? rawFile.name
          : typeof rawFile.filename === "string"
            ? rawFile.filename
            : "";
        const content = typeof rawFile.content === "string" ? rawFile.content : "";
        if (!name.endsWith(".java") || !content.trim()) return null;
        return {
          name,
          content: formatJavaSource(content),
        };
      })
      .filter((file): file is { name: string; content: string } => Boolean(file));

    if (files.length === 0) return null;
    return JSON.stringify({ format: "oop-java-files", version: 1, files }, null, 2);
  } catch {
    return null;
  }
}

function looksLikeJavaSource(value: string): boolean {
  const text = value.trim();
  return /(?:^|\s)(?:public\s+)?(?:class|interface|enum|record)\s+[A-Z]\w*/.test(text);
}

function formatJavaSource(source: string): string {
  const text = source.trim();
  if (!text) return source;
  const lines = text.split(/\r?\n/);
  if (lines.length === 1 && text.length < 120 && !text.includes(";")) {
    return text;
  }
  if (lines.length > 1 && Math.max(...lines.map((line) => line.length)) < 160) {
    return `${text}\n`;
  }

  const rough = breakJavaTokens(text);
  const formatted: string[] = [];
  let indent = 0;
  for (const rawLine of rough.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("}")) indent = Math.max(0, indent - 1);
    formatted.push(`${"    ".repeat(indent)}${line}`);
    if (line.endsWith("{")) indent += 1;
  }

  return `${formatted.join("\n")}\n`;
}

function breakJavaTokens(source: string): string {
  let result = "";
  let state: "normal" | "string" | "char" | "lineComment" | "blockComment" = "normal";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "lineComment") {
      result += char;
      if (char === "\n") state = "normal";
      continue;
    }

    if (state === "blockComment") {
      result += char;
      if (char === "*" && next === "/") {
        result += next;
        index += 1;
        state = "normal";
      }
      continue;
    }

    if (state === "string" || state === "char") {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if ((state === "string" && char === "\"") || (state === "char" && char === "'")) {
        state = "normal";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      result += char + next;
      index += 1;
      state = "lineComment";
      continue;
    }
    if (char === "/" && next === "*") {
      result += char + next;
      index += 1;
      state = "blockComment";
      continue;
    }
    if (char === "\"") {
      result += char;
      state = "string";
      continue;
    }
    if (char === "'") {
      result += char;
      state = "char";
      continue;
    }
    if (char === "{") {
      result = result.trimEnd() + " {\n";
      continue;
    }
    if (char === "}") {
      result = result.trimEnd() + "\n}\n";
      continue;
    }
    if (char === ";") {
      result += ";\n";
      continue;
    }

    result += char;
  }

  return result;
}

function isSupportedProvider(value: string): value is AiProvider {
  return (
    value === "openai" ||
    value === "anthropic" ||
    value === "gemini" ||
    value === "groq" ||
    value === "openrouter"
  );
}

function parseProvider(value: string | undefined): AiProvider {
  return value && isSupportedProvider(value) ? value : DEFAULT_PROVIDER;
}

function getProviderOptions() {
  return [
    {
      value: "openai" as const,
      label: "OpenAI",
      defaultModel: DEFAULT_MODELS.openai,
      keyPlaceholder: "sk-...",
    },
    {
      value: "anthropic" as const,
      label: "Anthropic Claude",
      defaultModel: DEFAULT_MODELS.anthropic,
      keyPlaceholder: "sk-ant-...",
    },
    {
      value: "gemini" as const,
      label: "Google Gemini",
      defaultModel: DEFAULT_MODELS.gemini,
      keyPlaceholder: "AIza...",
    },
    {
      value: "groq" as const,
      label: "Groq",
      defaultModel: DEFAULT_MODELS.groq,
      keyPlaceholder: "gsk_...",
    },
    {
      value: "openrouter" as const,
      label: "OpenRouter",
      defaultModel: DEFAULT_MODELS.openrouter,
      keyPlaceholder: "sk-or-v1-...",
    },
  ];
}

function getProviderLabel(provider: AiProvider): string {
  return getProviderOptions().find((option) => option.value === provider)?.label ?? provider;
}

async function testProviderKey(
  provider: AiProvider,
  model: string,
  apiKey: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const response =
    provider === "openai"
      ? await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      : provider === "anthropic"
        ? await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 8,
            messages: [{ role: "user", content: "Reply OK" }],
          }),
        })
        : provider === "gemini"
          ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`)
          : provider === "groq"
            ? await fetch("https://api.groq.com/openai/v1/models", {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            })
            : await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: "Reply OK" }],
                max_tokens: 8,
              }),
            });

  if (response.ok) return { ok: true };
  return { ok: false, message: await readProviderError(response, provider) };
}

async function generateWithProvider(
  provider: AiProvider,
  model: string,
  apiKey: string,
  input: AiGenerateExerciseInput
): Promise<string | AiServiceError> {
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenAiRequest(model, input)),
    });
    if (!response.ok) {
      return {
        error: {
          code: "AI_REQUEST_FAILED",
          message: await readProviderError(response, provider),
        },
      };
    }
    return extractOpenAiOutputText((await response.json()) as Record<string, unknown>) || "";
  }

  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(buildAnthropicRequest(model, input)),
    });
    if (!response.ok) {
      return {
        error: {
          code: "AI_REQUEST_FAILED",
          message: await readProviderError(response, provider),
        },
      };
    }
    const toolInput = extractAnthropicToolInput((await response.json()) as Record<string, unknown>);
    return JSON.stringify(toolInput);
  }

  if (provider === "groq" || provider === "openrouter") {
    const endpoint =
      provider === "groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenAiCompatibleChatRequest(model, input)),
    });
    if (!response.ok) {
      return {
        error: {
          code: "AI_REQUEST_FAILED",
          message: await readProviderError(response, provider),
        },
      };
    }
    return extractChatCompletionText((await response.json()) as Record<string, unknown>) || "";
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGeminiRequest(input)),
    }
  );
  if (!response.ok) {
    return {
      error: {
        code: "AI_REQUEST_FAILED",
        message: await readProviderError(response, provider),
      },
    };
  }
  return extractGeminiText((await response.json()) as Record<string, unknown>) || "";
}

async function readProviderError(response: Response, provider: AiProvider): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    return payload.error?.message || `${getProviderLabel(provider)} trả về lỗi HTTP ${response.status}.`;
  } catch {
    return `${getProviderLabel(provider)} trả về lỗi HTTP ${response.status}.`;
  }
}

function extractOpenAiOutputText(payload: Record<string, unknown>): string | null {
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

function extractAnthropicToolInput(payload: Record<string, unknown>): unknown {
  const content = payload.content;
  if (!Array.isArray(content)) return null;

  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const typed = part as { type?: unknown; input?: unknown };
    if (typed.type === "tool_use" && typed.input && typeof typed.input === "object") {
      return typed.input;
    }
  }

  return null;
}

function extractChatCompletionText(payload: Record<string, unknown>): string | null {
  const choices = payload.choices;
  if (!Array.isArray(choices)) return null;

  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as { message?: unknown }).message;
    if (!message || typeof message !== "object") continue;
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") return content;
  }

  return null;
}

function extractGeminiText(payload: Record<string, unknown>): string | null {
  const candidates = payload.candidates;
  if (!Array.isArray(candidates)) return null;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }

  return null;
}
