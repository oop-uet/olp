import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { systemConfig } from '../db/schema.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConfigEntry {
  key: string;
  value: string;
  validRange: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ConfigUpdateResult {
  key: string;
  value: string;
  updatedAt: string;
}

export interface ConfigError {
  error: {
    code: string;
    message: string;
  };
}

const DEFAULT_CONFIGS = [
  { key: 'warning_threshold', value: '3', validRange: '1-10' },
  { key: 'time_limit', value: '60', validRange: '1-180' },
  { key: 'max_submissions', value: '10', validRange: '1-100' },
  { key: 'source_check_enabled', value: '0', validRange: '0-1' },
  { key: 'source_check_weekly_enabled', value: '0', validRange: '0-1' },
  { key: 'source_check_similarity_threshold', value: '70', validRange: '40-95' },
  { key: 'source_check_max_runtime_minutes', value: '20', validRange: '5-120' },
  { key: 'source_check_provider', value: 'jplag', validRange: 'enum:jplag,pmd_cpd,dolos' },
  { key: 'source_check_weekly_day', value: '6', validRange: '0-6' },
  { key: 'source_check_weekly_hour', value: '22', validRange: '0-23' },
  { key: 'source_check_weekly_minute', value: '0', validRange: '0-59' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isConfigError(value: unknown): value is ConfigError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ConfigError).error?.code === 'string'
  );
}

/**
 * Parse a valid range string like "1-10" into [min, max].
 */
function parseRange(validRange: string): { min: number; max: number } | null {
  const match = validRange.match(/^(\d+)-(\d+)$/);
  if (!match) return null;
  return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
}

async function ensureDefaultConfigRows(database: Database = defaultDb): Promise<void> {
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

// ─── Database type ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Get all system configuration key-value pairs.
 */
export async function getConfig(database: Database = defaultDb): Promise<ConfigEntry[]> {
  await ensureDefaultConfigRows(database);
  const configs = await database.select().from(systemConfig);
  return configs;
}

/**
 * Update a system configuration value.
 * Validates that:
 * 1. The key exists in the system_config table
 * 2. The value is within the valid range for the key
 *
 * @param key - The config parameter key
 * @param value - The new value (as a string representing an integer)
 * @param updatedBy - The user ID performing the update
 * @param database - Optional database instance for dependency injection
 */
export async function updateConfig(
  key: string,
  value: string,
  updatedBy: string,
  database: Database = defaultDb
): Promise<ConfigUpdateResult | ConfigError> {
  await ensureDefaultConfigRows(database);

  // Find the existing config entry
  const existing = await database.select().from(systemConfig).where(eq(systemConfig.key, key));

  if (!existing || existing.length === 0) {
    return {
      error: {
        code: 'NOT_FOUND',
        message: `Configuration parameter '${key}' does not exist`,
      },
    };
  }

  const configEntry = existing[0];

  const trimmedValue = value.trim();

  if (configEntry.validRange?.startsWith('enum:')) {
    const allowedValues = configEntry.validRange.replace('enum:', '').split(',');
    if (!allowedValues.includes(trimmedValue)) {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: `Value '${trimmedValue}' is not allowed for parameter '${key}'`,
        },
      };
    }
  } else {
    // Validate that value is a valid integer
    const numericValue = parseInt(trimmedValue, 10);
    if (isNaN(numericValue) || numericValue.toString() !== trimmedValue) {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: `Value '${value}' is not a valid integer for parameter '${key}'`,
        },
      };
    }

    // Validate value is within valid range
    if (configEntry.validRange) {
      const range = parseRange(configEntry.validRange);
      if (range && (numericValue < range.min || numericValue > range.max)) {
        return {
          error: {
            code: 'VALIDATION_ERROR',
            message: `Value ${numericValue} is out of valid range ${configEntry.validRange} for parameter ${key}`,
          },
        };
      }
    }
  }

  // Update the config
  const now = new Date().toISOString();
  await database
    .update(systemConfig)
    .set({
      value: value.trim(),
      updatedAt: now,
      updatedBy,
    })
    .where(eq(systemConfig.key, key));

  return {
    key,
    value: trimmedValue,
    updatedAt: now,
  };
}
