import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import { users, type User } from "../db/schema.js";

// ─── Constants ───────────────────────────────────────────────────────────────

export const BCRYPT_SALT_ROUNDS = 12;
export const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_EXPIRY = "7d";
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ─── Error Codes ─────────────────────────────────────────────────────────────

export const AuthErrorCode = {
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthError {
  error: {
    code: AuthErrorCode;
    message: string;
  };
}

export interface AccessTokenPayload {
  sub: string;
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    fullName: string | null;
    mustChangePassword: boolean;
  };
}

export interface RefreshResult {
  accessToken: string;
}

// ─── Database type ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = {
  query: {
    users: {
      findFirst: (opts: any) => Promise<User | undefined>;
    };
  };
  update: (table: any) => any;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return secret;
}

function getJwtRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET environment variable is not set");
  return secret;
}

function createAuthError(code: AuthErrorCode, message: string): AuthError {
  return { error: { code, message } };
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Hash a plaintext password using bcrypt with 12 salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Sign a JWT access token with the given payload.
 */
export function signAccessToken(userId: string, role: string): string {
  const payload: AccessTokenPayload = { sub: userId, role };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Sign a JWT refresh token with the given payload.
 */
export function signRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, type: "refresh" };
  return jwt.sign(payload, getJwtRefreshSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
}

/**
 * Verify and decode an access token.
 */
export function verifyAccessToken(
  token: string
): AccessTokenPayload | AuthError {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AccessTokenPayload;
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return createAuthError(
        AuthErrorCode.TOKEN_EXPIRED,
        "Access token has expired"
      );
    }
    return createAuthError(
      AuthErrorCode.TOKEN_INVALID,
      "Access token is invalid"
    );
  }
}

/**
 * Verify and decode a refresh token.
 */
export function verifyRefreshToken(
  token: string
): RefreshTokenPayload | AuthError {
  try {
    const decoded = jwt.verify(
      token,
      getJwtRefreshSecret()
    ) as RefreshTokenPayload;
    if (decoded.type !== "refresh") {
      return createAuthError(
        AuthErrorCode.TOKEN_INVALID,
        "Invalid refresh token"
      );
    }
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return createAuthError(
        AuthErrorCode.TOKEN_EXPIRED,
        "Refresh token has expired"
      );
    }
    return createAuthError(
      AuthErrorCode.TOKEN_INVALID,
      "Refresh token is invalid"
    );
  }
}

/**
 * Check whether a response is an AuthError.
 */
export function isAuthError(value: unknown): value is AuthError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as AuthError).error?.code === "string"
  );
}

/**
 * Authenticate a user with username and password.
 * Implements:
 * - Account lockout check (locked for 15 minutes after 5 consecutive failures)
 * - Password verification with bcrypt
 * - Failed attempt tracking and lockout enforcement
 * - JWT access and refresh token generation on success
 *
 * @param username - The user's username
 * @param password - The user's plaintext password
 * @param database - Optional database instance for dependency injection (used in testing)
 */
export async function login(
  username: string,
  password: string,
  database: Database = defaultDb
): Promise<LoginResult | AuthError> {
  // Find the user by username
  const user = await database.query.users.findFirst({
    where: eq(users.username, username),
  });

  if (!user) {
    return createAuthError(
      AuthErrorCode.INVALID_CREDENTIALS,
      "Invalid username or password"
    );
  }

  // Check if account is locked
  if (user.lockedUntil) {
    const lockedUntilDate = new Date(user.lockedUntil);
    if (lockedUntilDate > new Date()) {
      return createAuthError(
        AuthErrorCode.ACCOUNT_LOCKED,
        "Account is temporarily locked. Please try again later."
      );
    }

    // Lock period has expired — reset lock state
    await database
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.passwordHash);

  if (!isPasswordValid) {
    // Increment failed login attempts
    const newAttempts = user.failedLoginAttempts + 1;
    const updateData: {
      failedLoginAttempts: number;
      lockedUntil: string | null;
      updatedAt: string;
    } = {
      failedLoginAttempts: newAttempts,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    };

    // Lock account if threshold reached
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      updateData.lockedUntil = lockUntil.toISOString();
    }

    await database.update(users).set(updateData).where(eq(users.id, user.id));

    // If account was just locked, return locked error
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      return createAuthError(
        AuthErrorCode.ACCOUNT_LOCKED,
        "Account is temporarily locked. Please try again later."
      );
    }

    return createAuthError(
      AuthErrorCode.INVALID_CREDENTIALS,
      "Invalid username or password"
    );
  }

  // Successful login — reset failed attempts
  await database
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  // Generate tokens
  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      fullName: (user as any).fullName || null,
      mustChangePassword: Boolean((user as any).mustChangePassword),
    },
  };
}

/**
 * Refresh an access token using a valid refresh token.
 * Returns a new access token if the refresh token is valid and the user exists.
 *
 * @param token - The refresh token to verify
 * @param database - Optional database instance for dependency injection (used in testing)
 */
export async function refreshToken(
  token: string,
  database: Database = defaultDb
): Promise<RefreshResult | AuthError> {
  const decoded = verifyRefreshToken(token);

  if (isAuthError(decoded)) {
    return decoded;
  }

  // Verify user still exists
  const user = await database.query.users.findFirst({
    where: eq(users.id, decoded.sub),
  });

  if (!user) {
    return createAuthError(
      AuthErrorCode.TOKEN_INVALID,
      "User associated with token no longer exists"
    );
  }

  // Generate new access token
  const accessToken = signAccessToken(user.id, user.role);

  return { accessToken };
}

/**
 * Logout - invalidate session.
 * Since we use stateless JWTs, logout is handled client-side by discarding tokens.
 * This method exists for API completeness and future server-side token blacklisting.
 */
export async function logout(_userId: string): Promise<{ success: boolean }> {
  // With stateless JWTs, server-side logout is a no-op.
  // In a production system, you'd add the token to a blacklist/revocation store.
  return { success: true };
}
