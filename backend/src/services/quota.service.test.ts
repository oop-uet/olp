import { describe, it, expect, vi } from 'vitest';
import {
  calculatePercentage,
  determineStatus,
  buildServiceEntry,
  getQuotaStatus,
  QUOTA_LIMITS,
} from './quota.service.js';

describe('QuotaService', () => {
  describe('calculatePercentage', () => {
    it('calculates correct percentage for normal values', () => {
      expect(calculatePercentage(150_000_000, 500_000_000)).toBe(30);
    });

    it('returns 0 when current is 0', () => {
      expect(calculatePercentage(0, 500_000_000)).toBe(0);
    });

    it('returns 100 when at the limit', () => {
      expect(calculatePercentage(500_000_000, 500_000_000)).toBe(100);
    });

    it('caps at 100 when over the limit', () => {
      expect(calculatePercentage(600_000_000, 500_000_000)).toBe(100);
    });

    it('returns 0 when limit is 0', () => {
      expect(calculatePercentage(100, 0)).toBe(0);
    });

    it('returns 0 for negative current values', () => {
      expect(calculatePercentage(-100, 500_000_000)).toBe(0);
    });

    it('rounds to nearest integer', () => {
      // 1/3 * 100 = 33.33... -> 33
      expect(calculatePercentage(1, 3)).toBe(33);
    });
  });

  describe('determineStatus', () => {
    it('returns "ok" when below 80%', () => {
      expect(determineStatus(79)).toBe('ok');
      expect(determineStatus(0)).toBe('ok');
      expect(determineStatus(50)).toBe('ok');
    });

    it('returns "warning" when at exactly 80%', () => {
      expect(determineStatus(80)).toBe('warning');
    });

    it('returns "warning" when above 80%', () => {
      expect(determineStatus(81)).toBe('warning');
      expect(determineStatus(100)).toBe('warning');
    });
  });

  describe('buildServiceEntry', () => {
    it('builds entry for turso_reads with correct limit', () => {
      const entry = buildServiceEntry('turso_reads', 150_000_000);
      expect(entry).toEqual({
        name: 'turso_reads',
        current: 150_000_000,
        limit: 500_000_000,
        percentage: 30,
        status: 'ok',
      });
    });

    it('builds entry with warning status when above 80%', () => {
      const entry = buildServiceEntry('turso_reads', 450_000_000);
      expect(entry).toEqual({
        name: 'turso_reads',
        current: 450_000_000,
        limit: 500_000_000,
        percentage: 90,
        status: 'warning',
      });
    });

    it('builds entry for render_compute', () => {
      const entry = buildServiceEntry('render_compute', 400);
      expect(entry).toEqual({
        name: 'render_compute',
        current: 400,
        limit: 750,
        percentage: 53,
        status: 'ok',
      });
    });
  });

  describe('getQuotaStatus', () => {
    it('returns all four services with mock fetchers', async () => {
      const result = await getQuotaStatus({
        fetchTursoReads: async () => 150_000_000,
        fetchTursoWrites: async () => 2_000_000,
        fetchR2Storage: async () => 5_000_000_000,
        fetchRenderCompute: async () => 400,
      });

      expect(result.services).toHaveLength(4);
      expect(result.services.map(s => s.name)).toEqual([
        'turso_reads',
        'turso_writes',
        'r2_storage',
        'render_compute',
      ]);
      expect(result.warnings).toEqual([]);
    });

    it('includes warnings when services exceed 80%', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await getQuotaStatus({
        fetchTursoReads: async () => 450_000_000, // 90%
        fetchTursoWrites: async () => 9_000_000,  // 90%
        fetchR2Storage: async () => 5_000_000_000, // 50%
        fetchRenderCompute: async () => 400,        // 53%
      });

      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0]).toContain('turso_reads');
      expect(result.warnings[1]).toContain('turso_writes');

      // Verify console.warn was called
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy.mock.calls[0][0]).toContain('turso_reads');
      expect(warnSpy.mock.calls[1][0]).toContain('turso_writes');

      warnSpy.mockRestore();
    });

    it('marks services at exactly 80% as warning', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await getQuotaStatus({
        fetchTursoReads: async () => 400_000_000, // exactly 80%
        fetchTursoWrites: async () => 8_000_000,  // exactly 80%
        fetchR2Storage: async () => 8_000_000_000, // exactly 80%
        fetchRenderCompute: async () => 600,        // exactly 80%
      });

      expect(result.services.every(s => s.status === 'warning')).toBe(true);
      expect(result.warnings).toHaveLength(4);

      warnSpy.mockRestore();
    });

    it('uses default fetchers when none provided', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await getQuotaStatus();

      expect(result.services).toHaveLength(4);
      // Default mock values are all below 80%
      expect(result.warnings).toEqual([]);

      warnSpy.mockRestore();
    });
  });

  describe('QUOTA_LIMITS', () => {
    it('has correct limits for all services', () => {
      expect(QUOTA_LIMITS.turso_reads.limit).toBe(500_000_000);
      expect(QUOTA_LIMITS.turso_reads.warnAt).toBe(400_000_000);
      expect(QUOTA_LIMITS.turso_writes.limit).toBe(10_000_000);
      expect(QUOTA_LIMITS.turso_writes.warnAt).toBe(8_000_000);
      expect(QUOTA_LIMITS.r2_storage.limit).toBe(10_000_000_000);
      expect(QUOTA_LIMITS.r2_storage.warnAt).toBe(8_000_000_000);
      expect(QUOTA_LIMITS.render_compute.limit).toBe(750);
      expect(QUOTA_LIMITS.render_compute.warnAt).toBe(600);
    });
  });
});
