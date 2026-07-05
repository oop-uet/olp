import { describe, it, expect, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { getTestSqlite } from '../test/setup.js';
import { getConfig, updateConfig, isConfigError } from './config.service.js';

// ─── Helper: create a test database instance for DI ─────────────────────────

function getDb() {
  return drizzle(getTestSqlite(), { schema });
}

// Test admin user ID (FK checks disabled, so no need to insert a real user)
const ADMIN_ID = 'test-admin-user-id';

// ─── Helper: seed system_config and admin user for tests ────────────────────

function seedConfig() {
  const sqlite = getTestSqlite();
  // Disable FK constraints to allow updating system_config with user references
  sqlite.exec(`PRAGMA foreign_keys = OFF;`);
  // Clear and re-seed to ensure fresh state
  sqlite.exec(`DELETE FROM system_config;`);
  sqlite.exec(`
    INSERT INTO system_config (key, value, valid_range, updated_at)
    VALUES
      ('warning_threshold', '3', '1-10', '${new Date().toISOString()}'),
      ('time_limit', '60', '1-180', '${new Date().toISOString()}'),
      ('max_submissions', '10', '1-100', '${new Date().toISOString()}');
  `);
}

describe('Config Service', () => {
  beforeEach(() => {
    seedConfig();
  });

  describe('getConfig', () => {
    it('should return all configuration entries', async () => {
      const db = getDb();
      const configs = await getConfig(db);

      expect(configs).toHaveLength(8);
      expect(configs.map((c) => c.key).sort()).toEqual([
        'max_submissions',
        'source_check_enabled',
        'source_check_max_runtime_minutes',
        'source_check_provider',
        'source_check_similarity_threshold',
        'source_check_weekly_enabled',
        'time_limit',
        'warning_threshold',
      ]);
    });

    it('should include value and validRange for each entry', async () => {
      const db = getDb();
      const configs = await getConfig(db);

      const warningThreshold = configs.find((c) => c.key === 'warning_threshold');
      expect(warningThreshold).toBeDefined();
      expect(warningThreshold!.value).toBe('3');
      expect(warningThreshold!.validRange).toBe('1-10');
    });
  });

  describe('updateConfig', () => {
    it('should update a valid config value within range', async () => {
      const db = getDb();

      const result = await updateConfig('warning_threshold', '5', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(false);
      expect(result).toHaveProperty('key', 'warning_threshold');
      expect(result).toHaveProperty('value', '5');
      expect(result).toHaveProperty('updatedAt');
    });

    it('should persist the updated value in the database', async () => {
      const db = getDb();

      await updateConfig('warning_threshold', '7', ADMIN_ID, db);

      const configs = await getConfig(db);
      const entry = configs.find((c) => c.key === 'warning_threshold');
      expect(entry!.value).toBe('7');
    });

    it('should reject value below minimum range', async () => {
      const db = getDb();

      const result = await updateConfig('warning_threshold', '0', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(true);
      if (isConfigError(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('0');
        expect(result.error.message).toContain('1-10');
        expect(result.error.message).toContain('warning_threshold');
      }
    });

    it('should reject value above maximum range', async () => {
      const db = getDb();

      const result = await updateConfig('warning_threshold', '11', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(true);
      if (isConfigError(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('11');
        expect(result.error.message).toContain('1-10');
      }
    });

    it('should accept minimum boundary value', async () => {
      const db = getDb();

      const result = await updateConfig('warning_threshold', '1', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(false);
      expect(result).toHaveProperty('value', '1');
    });

    it('should accept maximum boundary value', async () => {
      const db = getDb();

      const result = await updateConfig('warning_threshold', '10', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(false);
      expect(result).toHaveProperty('value', '10');
    });

    it('should reject value for time_limit outside 1-180 range', async () => {
      const db = getDb();

      const result = await updateConfig('time_limit', '181', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(true);
      if (isConfigError(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('181');
        expect(result.error.message).toContain('1-180');
      }
    });

    it('should reject value for max_submissions outside 1-100 range', async () => {
      const db = getDb();

      const result = await updateConfig('max_submissions', '101', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(true);
      if (isConfigError(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('101');
        expect(result.error.message).toContain('1-100');
      }
    });

    it('should accept valid time_limit value', async () => {
      const db = getDb();

      const result = await updateConfig('time_limit', '120', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(false);
      expect(result).toHaveProperty('value', '120');
    });

    it('should accept source check provider enum values', async () => {
      const db = getDb();

      const result = await updateConfig('source_check_provider', 'dolos', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(false);
      expect(result).toHaveProperty('value', 'dolos');
    });

    it('should reject unsupported source check providers', async () => {
      const db = getDb();

      const result = await updateConfig('source_check_provider', 'unknown', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(true);
      if (isConfigError(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('source_check_provider');
      }
    });

    it('should accept source check toggles as 0 or 1', async () => {
      const db = getDb();

      const result = await updateConfig('source_check_enabled', '1', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(false);
      expect(result).toHaveProperty('value', '1');
    });

    it('should return NOT_FOUND error for non-existent key', async () => {
      const db = getDb();

      const result = await updateConfig('nonexistent_key', '5', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(true);
      if (isConfigError(result)) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('nonexistent_key');
      }
    });

    it('should reject non-integer values', async () => {
      const db = getDb();

      const result = await updateConfig('warning_threshold', '3.5', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(true);
      if (isConfigError(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should reject non-numeric values', async () => {
      const db = getDb();

      const result = await updateConfig('warning_threshold', 'abc', ADMIN_ID, db);

      expect(isConfigError(result)).toBe(true);
      if (isConfigError(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should set updatedBy to the admin user id', async () => {
      const db = getDb();

      await updateConfig('warning_threshold', '5', ADMIN_ID, db);

      const configs = await getConfig(db);
      const entry = configs.find((c) => c.key === 'warning_threshold');
      expect(entry!.updatedBy).toBe(ADMIN_ID);
    });
  });
});
