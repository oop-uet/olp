import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

/** JWT secret used exclusively in tests */
export const TEST_JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';

/** Token expiration for test tokens (1 hour) */
const TEST_TOKEN_EXPIRY = '1h';

export type TestRole = 'student' | 'instructor' | 'admin';

export interface TestUser {
  id: string;
  username: string;
  email: string;
  role: TestRole;
  passwordHash: string;
}

/**
 * Generates a signed JWT token for testing authenticated API requests.
 */
export function generateTestToken(
  userId: string,
  role: TestRole,
  options?: { expiresIn?: string; secret?: string }
): string {
  const secret = options?.secret ?? TEST_JWT_SECRET;
  const expiresIn = options?.expiresIn ?? TEST_TOKEN_EXPIRY;

  return jwt.sign(
    { sub: userId, role },
    secret,
    { expiresIn }
  );
}

/**
 * Generates an expired JWT token for testing session expiry scenarios.
 */
export function generateExpiredToken(userId: string, role: TestRole): string {
  return jwt.sign(
    { sub: userId, role },
    TEST_JWT_SECRET,
    { expiresIn: '0s' }
  );
}

/**
 * Creates a test user object with default values.
 * Does NOT insert into the database — use with getTestDb() for persistence.
 */
export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  const id = overrides?.id ?? randomUUID();
  const role = overrides?.role ?? 'student';

  return {
    id,
    username: overrides?.username ?? `testuser_${id.slice(0, 8)}`,
    email: overrides?.email ?? `testuser_${id.slice(0, 8)}@uet.vnu.edu.vn`,
    role,
    // bcrypt hash for "password123" - pre-computed to avoid slow bcrypt calls in tests
    passwordHash: overrides?.passwordHash ?? '$2b$10$K4GKmWf5gYzHkN3kXdUfZOQcF0u0g.qJkjBxJNlKsF6aEjGc0.fTi',
  };
}

/**
 * Creates a test student user with role='student'.
 */
export function createTestStudent(overrides?: Partial<TestUser>): TestUser {
  return createTestUser({ ...overrides, role: 'student' });
}

/**
 * Creates a test instructor user with role='instructor'.
 */
export function createTestInstructor(overrides?: Partial<TestUser>): TestUser {
  return createTestUser({ ...overrides, role: 'instructor' });
}

/**
 * Creates a test admin user with role='admin'.
 */
export function createTestAdmin(overrides?: Partial<TestUser>): TestUser {
  return createTestUser({ ...overrides, role: 'admin' });
}

/**
 * Returns a Bearer authorization header value for use in supertest requests.
 */
export function authHeader(userId: string, role: TestRole): string {
  return `Bearer ${generateTestToken(userId, role)}`;
}

/**
 * Creates a class section test fixture.
 */
export function createTestSection(overrides?: {
  id?: string;
  name?: string;
  semester?: string;
  instructorId?: string;
}) {
  return {
    id: overrides?.id ?? randomUUID(),
    name: overrides?.name ?? 'OOP 2024 - Section A',
    semester: overrides?.semester ?? '2024-1',
    instructorId: overrides?.instructorId ?? randomUUID(),
  };
}

/**
 * Creates an exercise test fixture.
 */
export function createTestExercise(overrides?: {
  id?: string;
  title?: string;
  description?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  starterCode?: string;
  isLibrary?: boolean;
  oopTags?: string[];
  createdBy?: string;
}) {
  return {
    id: overrides?.id ?? randomUUID(),
    title: overrides?.title ?? 'Implement a Stack class',
    description: overrides?.description ?? 'Create a generic Stack class using OOP principles.',
    difficulty: overrides?.difficulty ?? 'medium',
    starterCode: overrides?.starterCode ?? 'public class Stack<T> {\n  // TODO\n}',
    isLibrary: overrides?.isLibrary ?? false,
    oopTags: overrides?.oopTags ?? ['classes', 'encapsulation'],
    createdBy: overrides?.createdBy ?? randomUUID(),
  };
}

/**
 * Creates a test case fixture for an exercise.
 */
export function createTestCase(overrides?: {
  id?: string;
  exerciseId?: string;
  inputData?: string;
  expectedOutput?: string;
  isVisible?: boolean;
  pointValue?: number;
  timeLimitSeconds?: number;
}) {
  return {
    id: overrides?.id ?? randomUUID(),
    exerciseId: overrides?.exerciseId ?? randomUUID(),
    inputData: overrides?.inputData ?? 'push 1\npush 2\npop\n',
    expectedOutput: overrides?.expectedOutput ?? '2\n',
    isVisible: overrides?.isVisible ?? true,
    pointValue: overrides?.pointValue ?? 10,
    timeLimitSeconds: overrides?.timeLimitSeconds ?? 5,
  };
}
