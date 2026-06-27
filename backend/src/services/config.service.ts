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

// ─── Database type ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Get all system configuration key-value pairs.
 */
export async function getConfig(database: Database = defaultDb): Promise<ConfigEntry[]> {
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

  // Validate that value is a valid integer
  const numericValue = parseInt(value, 10);
  if (isNaN(numericValue) || numericValue.toString() !== value.trim()) {
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
    value: value.trim(),
    updatedAt: now,
  };
}
