import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from './index.js';

describe('deployment readiness endpoint', () => {
  it('exposes an unauthenticated health endpoint for the platform health check', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.timestamp).toBe('string');
  });
});
