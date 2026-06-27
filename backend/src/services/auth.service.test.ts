import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { getTestSqlite } from "../test/setup.js";
import {
  hashPassword,
  comparePassword,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  login,
  refreshToken,
  logout,
  isAuthError,
  AuthErrorCode,
  BCRYPT_SALT_ROUNDS,
} from "./auth.service.js";

// Set test environment variables
const TEST_JWT_SECRET = "test-jwt-secret";
const TEST_JWT_REFRESH_SECRET = "test-refresh-secret";

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_JWT_REFRESH_SECRET;
});

// ─── Helper: create a test database instance for DI ─────────────────────────

function getDb() {
  return drizzle(getTestSqlite(), { schema });
}

// ─── Helper to insert a test user ───────────────────────────────────────────

async function insertTestUser(overrides?: {
  id?: string;
  username?: string;
  email?: string;
  password?: string;
  role?: string;
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
}) {
  const sqlite = getTestSqlite();
  const id = overrides?.id ?? randomUUID();
  const username = overrides?.username ?? `user_${id.slice(0, 8)}`;
  const email = overrides?.email ?? `${username}@uet.vnu.edu.vn`;
  const password = overrides?.password ?? "password123";
  const role = overrides?.role ?? "student";
  const failedLoginAttempts = overrides?.failedLoginAttempts ?? 0;
  const lockedUntil = overrides?.lockedUntil ?? null;

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  sqlite
    .prepare(
      `INSERT INTO users (id, username, email, password_hash, role, failed_login_attempts, locked_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, username, email, passwordHash, role, failedLoginAttempts, lockedUntil, now, now);

  return { id, username, email, password, role };
}

function getUserFromDb(userId: string) {
  const sqlite = getTestSqlite();
  return sqlite
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(userId) as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Auth Service - Password Hashing", () => {
  it("should hash a password with bcrypt", async () => {
    const password = "mySecurePassword123";
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).not.toEqual(password);
    expect(hash).toMatch(/^\$2b\$/);
  });

  it("should use 12 salt rounds", async () => {
    const password = "testPassword";
    const hash = await hashPassword(password);

    // bcrypt hash format: $2b$<rounds>$<salt+hash>
    expect(hash).toMatch(/^\$2b\$12\$/);
  });

  it("should verify a correct password", async () => {
    const password = "correctPassword";
    const hash = await hashPassword(password);
    const result = await comparePassword(password, hash);

    expect(result).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const password = "correctPassword";
    const hash = await hashPassword(password);
    const result = await comparePassword("wrongPassword", hash);

    expect(result).toBe(false);
  });

  it("should export BCRYPT_SALT_ROUNDS as 12", () => {
    expect(BCRYPT_SALT_ROUNDS).toBe(12);
  });
});

describe("Auth Service - JWT Token Management", () => {
  it("should sign an access token with correct payload", () => {
    const userId = "user-123";
    const role = "student";
    const token = signAccessToken(userId, role);

    const decoded = jwt.verify(token, TEST_JWT_SECRET) as any;
    expect(decoded.sub).toBe(userId);
    expect(decoded.role).toBe(role);
  });

  it("should sign access token with 15min expiry", () => {
    const token = signAccessToken("user-1", "student");
    const decoded = jwt.decode(token) as any;

    // exp - iat should be 15 minutes (900 seconds)
    expect(decoded.exp - decoded.iat).toBe(900);
  });

  it("should sign a refresh token with correct payload", () => {
    const userId = "user-456";
    const token = signRefreshToken(userId);

    const decoded = jwt.verify(token, TEST_JWT_REFRESH_SECRET) as any;
    expect(decoded.sub).toBe(userId);
    expect(decoded.type).toBe("refresh");
  });

  it("should sign refresh token with 7d expiry", () => {
    const token = signRefreshToken("user-1");
    const decoded = jwt.decode(token) as any;

    // exp - iat should be 7 days (604800 seconds)
    expect(decoded.exp - decoded.iat).toBe(604800);
  });

  it("should verify a valid access token", () => {
    const userId = "user-789";
    const role = "admin";
    const token = signAccessToken(userId, role);
    const result = verifyAccessToken(token);

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.sub).toBe(userId);
      expect(result.role).toBe(role);
    }
  });

  it("should return TOKEN_EXPIRED for expired access token", () => {
    const token = jwt.sign(
      { sub: "user-1", role: "student" },
      TEST_JWT_SECRET,
      { expiresIn: "0s" }
    );

    const result = verifyAccessToken(token);
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.TOKEN_EXPIRED);
    }
  });

  it("should return TOKEN_INVALID for malformed access token", () => {
    const result = verifyAccessToken("not-a-valid-token");
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.TOKEN_INVALID);
    }
  });

  it("should return TOKEN_INVALID for access token signed with wrong secret", () => {
    const token = jwt.sign(
      { sub: "user-1", role: "student" },
      "wrong-secret",
      { expiresIn: "15m" }
    );
    const result = verifyAccessToken(token);
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.TOKEN_INVALID);
    }
  });

  it("should verify a valid refresh token", () => {
    const userId = "user-abc";
    const token = signRefreshToken(userId);
    const result = verifyRefreshToken(token);

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.sub).toBe(userId);
      expect(result.type).toBe("refresh");
    }
  });

  it("should reject a refresh token signed with wrong secret", () => {
    const token = jwt.sign(
      { sub: "user-1", type: "refresh" },
      "wrong-secret",
      { expiresIn: "7d" }
    );
    const result = verifyRefreshToken(token);
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.TOKEN_INVALID);
    }
  });

  it("should reject a token without refresh type", () => {
    const token = jwt.sign(
      { sub: "user-1", type: "access" },
      TEST_JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );
    const result = verifyRefreshToken(token);
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.TOKEN_INVALID);
    }
  });

  it("should return TOKEN_EXPIRED for expired refresh token", () => {
    const token = jwt.sign(
      { sub: "user-1", type: "refresh" },
      TEST_JWT_REFRESH_SECRET,
      { expiresIn: "0s" }
    );
    const result = verifyRefreshToken(token);
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.TOKEN_EXPIRED);
    }
  });
});

describe("Auth Service - Login", () => {
  it("should return tokens on successful login", async () => {
    const user = await insertTestUser({ username: "testuser", password: "password123" });
    const result = await login("testuser", "password123", getDb());

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe(user.id);
      expect(result.user.username).toBe("testuser");
      expect(result.user.role).toBe("student");
    }
  });

  it("should return INVALID_CREDENTIALS for non-existent user", async () => {
    const result = await login("nonexistent", "password123", getDb());

    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
      expect(result.error.message).toBe("Invalid username or password");
    }
  });

  it("should return INVALID_CREDENTIALS for wrong password", async () => {
    await insertTestUser({ username: "wrongpw", password: "correct" });
    const result = await login("wrongpw", "incorrect", getDb());

    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
    }
  });

  it("should increment failed attempts on wrong password", async () => {
    const user = await insertTestUser({ username: "failuser", password: "secret" });
    await login("failuser", "wrongpassword", getDb());

    const row = getUserFromDb(user.id);
    expect(row.failed_login_attempts).toBe(1);
  });

  it("should lock account after 5 failed attempts", async () => {
    const user = await insertTestUser({
      username: "lockme",
      password: "secret",
      failedLoginAttempts: 4, // One more will trigger lockout
    });

    const result = await login("lockme", "wrongpassword", getDb());

    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.ACCOUNT_LOCKED);
    }

    const row = getUserFromDb(user.id);
    expect(row.failed_login_attempts).toBe(5);
    expect(row.locked_until).not.toBeNull();
  });

  it("should reject login when account is locked even with correct password", async () => {
    const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await insertTestUser({
      username: "lockeduser",
      password: "secret",
      failedLoginAttempts: 5,
      lockedUntil: futureDate,
    });

    const result = await login("lockeduser", "secret", getDb());

    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.ACCOUNT_LOCKED);
      expect(result.error.message).toContain("temporarily locked");
    }
  });

  it("should allow login after lockout period expires", async () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const user = await insertTestUser({
      username: "expired_lock",
      password: "secret",
      failedLoginAttempts: 5,
      lockedUntil: pastDate,
    });

    const result = await login("expired_lock", "secret", getDb());

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.accessToken).toBeDefined();
      expect(result.user.username).toBe("expired_lock");
    }

    // Verify failed attempts reset
    const row = getUserFromDb(user.id);
    expect(row.failed_login_attempts).toBe(0);
    expect(row.locked_until).toBeNull();
  });

  it("should reset failed attempts on successful login", async () => {
    const user = await insertTestUser({
      username: "resetuser",
      password: "secret",
      failedLoginAttempts: 3,
    });

    const result = await login("resetuser", "secret", getDb());
    expect(isAuthError(result)).toBe(false);

    const row = getUserFromDb(user.id);
    expect(row.failed_login_attempts).toBe(0);
  });

  it("should return correct user info in login result", async () => {
    const user = await insertTestUser({
      username: "infouser",
      email: "info@uet.vnu.edu.vn",
      password: "mypass",
      role: "instructor",
    });

    const result = await login("infouser", "mypass", getDb());

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.user.id).toBe(user.id);
      expect(result.user.username).toBe("infouser");
      expect(result.user.email).toBe("info@uet.vnu.edu.vn");
      expect(result.user.role).toBe("instructor");
    }
  });

  it("should generate valid JWT tokens on successful login", async () => {
    await insertTestUser({ username: "jwtuser", password: "pass123", role: "admin" });
    const result = await login("jwtuser", "pass123", getDb());

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      // Verify access token
      const accessDecoded = jwt.verify(result.accessToken, TEST_JWT_SECRET) as any;
      expect(accessDecoded.sub).toBeDefined();
      expect(accessDecoded.role).toBe("admin");

      // Verify refresh token
      const refreshDecoded = jwt.verify(result.refreshToken, TEST_JWT_REFRESH_SECRET) as any;
      expect(refreshDecoded.sub).toBeDefined();
      expect(refreshDecoded.type).toBe("refresh");
    }
  });
});

describe("Auth Service - Refresh Token", () => {
  it("should return a new access token for valid refresh token", async () => {
    const user = await insertTestUser({ username: "refreshuser", role: "instructor" });
    const token = signRefreshToken(user.id);
    const result = await refreshToken(token, getDb());

    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.accessToken).toBeDefined();

      const decoded = jwt.verify(result.accessToken, TEST_JWT_SECRET) as any;
      expect(decoded.sub).toBe(user.id);
      expect(decoded.role).toBe("instructor");
    }
  });

  it("should return error for invalid refresh token", async () => {
    const result = await refreshToken("invalid-token", getDb());

    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.TOKEN_INVALID);
    }
  });

  it("should return error for expired refresh token", async () => {
    const token = jwt.sign(
      { sub: randomUUID(), type: "refresh" },
      TEST_JWT_REFRESH_SECRET,
      { expiresIn: "0s" }
    );

    const result = await refreshToken(token, getDb());

    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.TOKEN_EXPIRED);
    }
  });

  it("should return error if user no longer exists", async () => {
    const nonExistentUserId = randomUUID();
    const token = signRefreshToken(nonExistentUserId);
    const result = await refreshToken(token, getDb());

    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.error.code).toBe(AuthErrorCode.TOKEN_INVALID);
      expect(result.error.message).toContain("no longer exists");
    }
  });
});

describe("Auth Service - Logout", () => {
  it("should return success", async () => {
    const result = await logout("user-123");
    expect(result.success).toBe(true);
  });
});
