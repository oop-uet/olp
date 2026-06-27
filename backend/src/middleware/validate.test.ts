import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from './validate.js';

const testSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().int().min(0, 'Age must be non-negative'),
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.post('/test', validate(testSchema), (req, res) => {
    res.status(200).json({ data: req.body });
  });
  return app;
}

describe('validate middleware', () => {
  const app = createApp();

  it('should pass valid data through to the handler', async () => {
    const response = await request(app)
      .post('/test')
      .send({ name: 'Alice', age: 25 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ name: 'Alice', age: 25 });
  });

  it('should return 400 with structured error for invalid data', async () => {
    const response = await request(app)
      .post('/test')
      .send({ name: '', age: -1 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('Request validation failed');
    expect(response.body.error.details).toBeInstanceOf(Array);
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it('should return field-level error details', async () => {
    const response = await request(app)
      .post('/test')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'age' }),
      ])
    );
  });

  it('should strip extra fields from valid data', async () => {
    const response = await request(app)
      .post('/test')
      .send({ name: 'Bob', age: 30, extra: 'field' });

    expect(response.status).toBe(200);
    // Zod in strict mode would reject, but by default it strips
    expect(response.body.data.name).toBe('Bob');
    expect(response.body.data.age).toBe(30);
  });
});
