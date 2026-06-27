import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { eq, and, like, or, inArray } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  users,
  sectionEnrollments,
  submissions,
  submissionResults,
  anticheatEvents,
} from "../db/schema.js";

const BCRYPT_SALT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ManageableRole = "student" | "instructor" | "admin";

export interface CreateUserInput {
  username: string;
  email: string;
  password?: string;
  role: ManageableRole;
  fullName?: string;
}

export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  username?: string;
}

export interface UserError {
  error: { code: string; message: string };
}

export function isUserError(value: unknown): value is UserError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as UserError).error?.code === "string"
  );
}

// Public-facing user shape (no password hash)
function toPublicUser(u: any) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    fullName: u.fullName ?? null,
    mustChangePassword: Boolean(u.mustChangePassword),
    lockedUntil: u.lockedUntil ?? null,
    createdAt: u.createdAt,
  };
}

// ─── List & Search ─────────────────────────────────────────────────────────

/**
 * List users, optionally filtered by role and a search term (username/email/fullName).
 */
export async function listUsers(
  filters: { role?: ManageableRole; search?: string } = {},
  database = defaultDb
) {
  const conditions = [];
  if (filters.role) {
    conditions.push(eq(users.role, filters.role));
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        like(users.username, term),
        like(users.email, term),
        like(users.fullName, term)
      )
    );
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const rows = await database.select().from(users).where(where);
  return rows.map(toPublicUser);
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function createUser(input: CreateUserInput, database = defaultDb) {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();

  if (!username) {
    return { error: { code: "VALIDATION_ERROR", message: "Tên đăng nhập là bắt buộc." } };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { error: { code: "VALIDATION_ERROR", message: "Email không hợp lệ." } };
  }
  if (!["student", "instructor", "admin"].includes(input.role)) {
    return { error: { code: "VALIDATION_ERROR", message: "Vai trò không hợp lệ." } };
  }

  // Check uniqueness
  const existing = await database
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, email)));
  if (existing.length > 0) {
    return { error: { code: "DUPLICATE", message: "Tên đăng nhập hoặc email đã tồn tại." } };
  }

  // Default password = username if not provided; require change on first login
  const password = input.password && input.password.length > 0 ? input.password : username;
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const [created] = await database
    .insert(users)
    .values({
      id,
      username,
      email,
      passwordHash,
      role: input.role,
      fullName: input.fullName?.trim() || null,
      mustChangePassword: 1,
      failedLoginAttempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return toPublicUser(created);
}

// ─── Update ───────────────────────────────────────────────────────────────

export async function updateUser(id: string, input: UpdateUserInput, database = defaultDb) {
  const existing = await database.query.users.findFirst({ where: eq(users.id, id) });
  if (!existing) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy người dùng." } };
  }

  const updateData: Record<string, unknown> = {};
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return { error: { code: "VALIDATION_ERROR", message: "Email không hợp lệ." } };
    }
    updateData.email = email;
  }
  if (input.fullName !== undefined) updateData.fullName = input.fullName.trim() || null;
  if (input.username !== undefined && input.username.trim()) updateData.username = input.username.trim();

  if (Object.keys(updateData).length === 0) {
    return toPublicUser(existing);
  }

  updateData.updatedAt = new Date().toISOString();

  const [updated] = await database
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();

  return toPublicUser(updated);
}

// ─── Reset password ──────────────────────────────────────────────────────

/**
 * Reset a user's password. If newPassword is omitted, resets to their username
 * and forces a password change on next login.
 */
export async function resetPassword(
  id: string,
  newPassword: string | undefined,
  database = defaultDb
) {
  const existing = await database.query.users.findFirst({ where: eq(users.id, id) });
  if (!existing) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy người dùng." } };
  }

  const password = newPassword && newPassword.length > 0 ? newPassword : existing.username;
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  await database
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: 1,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, id));

  return { success: true, resetTo: password === existing.username ? "username" : "custom" };
}

// ─── Delete ───────────────────────────────────────────────────────────────

/**
 * Delete a user and their dependent records (enrollments, submissions, etc.).
 */
export async function deleteUser(id: string, database = defaultDb) {
  const existing = await database.query.users.findFirst({ where: eq(users.id, id) });
  if (!existing) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy người dùng." } };
  }

  // Prevent deleting the last admin
  if (existing.role === "admin") {
    const admins = await database.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    if (admins.length <= 1) {
      return { error: { code: "FORBIDDEN", message: "Không thể xóa tài khoản quản trị cuối cùng." } };
    }
  }

  // Delete dependent submission data
  const userSubs = await database
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.studentId, id));
  const subIds = userSubs.map((s: { id: string }) => s.id);

  if (subIds.length > 0) {
    await database.delete(submissionResults).where(inArray(submissionResults.submissionId, subIds));
    await database.delete(submissions).where(eq(submissions.studentId, id));
  }
  await database.delete(anticheatEvents).where(eq(anticheatEvents.studentId, id));
  await database.delete(sectionEnrollments).where(eq(sectionEnrollments.studentId, id));

  await database.delete(users).where(eq(users.id, id));

  return { success: true };
}
