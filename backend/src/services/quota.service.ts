/**
 * Quota Monitoring Service
 *
 * Monitors free-tier service usage for Turso, Cloudflare R2, and Render.
 * Logs warnings when any service exceeds 80% of its free-tier limits.
 *
 * Currently uses placeholder values — ready for real API integration.
 *
 * Validates: Requirements 11.5, 11.7
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type QuotaStatus = 'ok' | 'warning';

export interface QuotaServiceEntry {
  name: string;
  current: number;
  limit: number;
  percentage: number;
  status: QuotaStatus;
}

export interface QuotaStatusResponse {
  services: QuotaServiceEntry[];
  warnings: string[];
}

// ─── Free-Tier Limits ────────────────────────────────────────────────────────

export const QUOTA_LIMITS = {
  turso_reads: {
    limit: 500_000_000,    // 500M rows read/month
    warnAt: 400_000_000,   // 80% = 400M
  },
  turso_writes: {
    limit: 10_000_000,     // 10M rows written/month
    warnAt: 8_000_000,     // 80% = 8M
  },
  r2_storage: {
    limit: 10_000_000_000, // 10GB
    warnAt: 8_000_000_000, // 80% = 8GB
  },
  render_compute: {
    limit: 750,            // 750 compute hours/month
    warnAt: 600,           // 80% = 600h
  },
} as const;

export type QuotaServiceName = keyof typeof QUOTA_LIMITS;

// ─── Usage Fetchers (placeholder implementations) ────────────────────────────

/**
 * Fetch current Turso database read usage.
 * Placeholder: returns a mock value. Replace with real Turso API call.
 */
export async function fetchTursoReads(): Promise<number> {
  // TODO: Integrate with Turso usage API
  return 150_000_000;
}

/**
 * Fetch current Turso database write usage.
 * Placeholder: returns a mock value. Replace with real Turso API call.
 */
export async function fetchTursoWrites(): Promise<number> {
  // TODO: Integrate with Turso usage API
  return 2_000_000;
}

/**
 * Fetch current Cloudflare R2 storage usage in bytes.
 * Placeholder: returns a mock value. Replace with real R2 API call.
 */
export async function fetchR2Storage(): Promise<number> {
  // TODO: Integrate with Cloudflare R2 usage API
  return 5_000_000_000;
}

/**
 * Fetch current Render compute hours used this month.
 * Placeholder: returns a mock value. Replace with real Render API call.
 */
export async function fetchRenderCompute(): Promise<number> {
  // TODO: Integrate with Render usage API
  return 400;
}

// ─── Core Logic ──────────────────────────────────────────────────────────────

/**
 * Calculate quota percentage, clamped to [0, 100].
 */
export function calculatePercentage(current: number, limit: number): number {
  if (limit <= 0) return 0;
  const raw = (current / limit) * 100;
  return Math.round(Math.min(Math.max(raw, 0), 100));
}

/**
 * Determine the status for a service based on its usage percentage.
 * Returns 'warning' if percentage >= 80%, otherwise 'ok'.
 */
export function determineStatus(percentage: number): QuotaStatus {
  return percentage >= 80 ? 'warning' : 'ok';
}

/**
 * Build a QuotaServiceEntry from raw usage data.
 */
export function buildServiceEntry(
  name: QuotaServiceName,
  current: number
): QuotaServiceEntry {
  const { limit } = QUOTA_LIMITS[name];
  const percentage = calculatePercentage(current, limit);
  const status = determineStatus(percentage);

  return { name, current, limit, percentage, status };
}

/**
 * Fetches all service quota usage and returns the full quota status report.
 * Logs warnings for any service exceeding 80% of its free-tier limit.
 *
 * Accepts optional overrides for usage fetchers (for testing).
 */
export async function getQuotaStatus(
  fetchers?: {
    fetchTursoReads?: () => Promise<number>;
    fetchTursoWrites?: () => Promise<number>;
    fetchR2Storage?: () => Promise<number>;
    fetchRenderCompute?: () => Promise<number>;
  }
): Promise<QuotaStatusResponse> {
  const getTursoReads = fetchers?.fetchTursoReads ?? fetchTursoReads;
  const getTursoWrites = fetchers?.fetchTursoWrites ?? fetchTursoWrites;
  const getR2Storage = fetchers?.fetchR2Storage ?? fetchR2Storage;
  const getRenderCompute = fetchers?.fetchRenderCompute ?? fetchRenderCompute;

  const [tursoReads, tursoWrites, r2Storage, renderCompute] = await Promise.all([
    getTursoReads(),
    getTursoWrites(),
    getR2Storage(),
    getRenderCompute(),
  ]);

  const services: QuotaServiceEntry[] = [
    buildServiceEntry('turso_reads', tursoReads),
    buildServiceEntry('turso_writes', tursoWrites),
    buildServiceEntry('r2_storage', r2Storage),
    buildServiceEntry('render_compute', renderCompute),
  ];

  const warnings: string[] = [];

  for (const service of services) {
    if (service.status === 'warning') {
      const message = `[quota-warning] ${service.name} is at ${service.percentage}% of free-tier limit (${service.current}/${service.limit})`;
      console.warn(message);
      warnings.push(message);
    }
  }

  return { services, warnings };
}
