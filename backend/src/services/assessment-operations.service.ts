import { asc, count, min } from "drizzle-orm";
import { getAssessmentAiQueueDeliveryConfig } from "../config/hybrid-cloudflare.js";
import { db as defaultDb } from "../db/index.js";
import { assessmentAiGradingRuns } from "../db/schema.js";
import { getAiConfigStatus } from "./ai-exercise.service.js";
import { getAssessmentAiProviderRpmLimits } from "./assessment.service.js";

type Database = typeof defaultDb;

export interface AssessmentOperationalStatus {
  generatedAt: string;
  durableQueue: {
    queued: number;
    running: number;
    failed: number;
    oldestQueuedAt: string | null;
  };
  cloudflareDelivery: {
    mode: "durable_db" | "cloudflare_queue";
    enabled: boolean;
    producerHost: string | null;
    reason: string | null;
  };
  providers: Array<{
    provider: string;
    enabled: boolean;
    model: string;
    rpm: number;
  }>;
}

/**
 * Minimal, queryable readiness signal. Cloudflare usage is intentionally not
 * guessed from a browser or a public API: it must be supplied by the provider
 * dashboard before a real-exam go/no-go decision.
 */
export async function getAssessmentOperationalStatus(
  database: Database = defaultDb,
  environment: NodeJS.ProcessEnv = process.env
): Promise<AssessmentOperationalStatus> {
  const rows = await database
    .select({
      status: assessmentAiGradingRuns.status,
      total: count(),
      oldestCreatedAt: min(assessmentAiGradingRuns.createdAt),
    })
    .from(assessmentAiGradingRuns)
    .groupBy(assessmentAiGradingRuns.status)
    .orderBy(asc(assessmentAiGradingRuns.status));
  const byStatus = new Map(rows.map((row) => [row.status, Number(row.total)]));
  const queuedRow = rows.find((row) => row.status === "queued");
  const [config, aiStatus] = [
    getAssessmentAiQueueDeliveryConfig(environment),
    await getAiConfigStatus(database),
  ];
  const rpmByProvider = new Map<string, number>(
    getAssessmentAiProviderRpmLimits(environment).map((limit) => [limit.provider, limit.rpm])
  );
  const providerRows = new Map<string, { provider: string; enabled: boolean; model: string }>();
  providerRows.set(aiStatus.provider, {
    provider: aiStatus.provider,
    enabled: aiStatus.enabled,
    model: aiStatus.model,
  });
  for (const provider of aiStatus.fallbackProviders) {
    if (!providerRows.has(provider.provider)) {
      providerRows.set(provider.provider, {
        provider: provider.provider,
        enabled: provider.enabled,
        model: provider.model,
      });
    }
  }
  const providers = Array.from(providerRows.values()).map((provider) => ({
    ...provider,
    rpm: rpmByProvider.get(provider.provider) ?? 12,
  }));
  let producerHost: string | null = null;
  if (config.producerUrl) {
    try {
      producerHost = new URL(config.producerUrl).host;
    } catch {
      producerHost = null;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    durableQueue: {
      queued: byStatus.get("queued") ?? 0,
      running: byStatus.get("running") ?? 0,
      failed: byStatus.get("failed") ?? 0,
      oldestQueuedAt: queuedRow?.oldestCreatedAt ?? null,
    },
    cloudflareDelivery: {
      mode: config.mode,
      enabled: config.enabled,
      producerHost,
      reason: config.reason,
    },
    providers,
  };
}
