import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validate.js";
import {
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  deleteUser,
  isUserError,
  ManageableRole,
} from "../../services/user.service.js";

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  username: z.string().min(1, "Tên đăng nhập là bắt buộc"),
  email: z.string().email("Email không hợp lệ"),
  password: z.string().optional(),
  role: z.enum(["student", "instructor", "admin"]),
  fullName: z.string().optional(),
});

const updateUserSchema = z.object({
  email: z.string().email("Email không hợp lệ").optional(),
  fullName: z.string().optional(),
  username: z.string().optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusFor(code: string): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "DUPLICATE":
      return 409;
    case "FORBIDDEN":
      return 403;
    case "VALIDATION_ERROR":
      return 400;
    default:
      return 400;
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users?role=instructor&search=abc
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const role = req.query.role as ManageableRole | undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const result = await listUsers({
      role: role && ["student", "instructor", "admin"].includes(role) ? role : undefined,
      search,
    });
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * POST /api/admin/users
 */
router.post("/", validate(createUserSchema), async (req: Request, res: Response) => {
  try {
    const result = await createUser(req.body);
    if (isUserError(result)) {
      res.status(statusFor(result.error.code)).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * PUT /api/admin/users/:id
 */
router.put("/:id", validate(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const result = await updateUser(req.params.id, req.body);
    if (isUserError(result)) {
      res.status(statusFor(result.error.code)).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 */
router.post("/:id/reset-password", validate(resetPasswordSchema), async (req: Request, res: Response) => {
  try {
    const result = await resetPassword(req.params.id, req.body.newPassword);
    if (isUserError(result)) {
      res.status(statusFor(result.error.code)).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

/**
 * DELETE /api/admin/users/:id
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const result = await deleteUser(req.params.id);
    if (isUserError(result)) {
      res.status(statusFor(result.error.code)).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
});

export default router;
