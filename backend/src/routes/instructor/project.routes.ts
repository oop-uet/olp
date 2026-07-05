import { Router, Request, Response } from "express";
import {
  createProjectGroup,
  deleteProjectGroup,
  getProjectWorkspace,
  gradeProjectGroup,
  isProjectError,
  updateProjectGroup,
} from "../../services/project.service.js";
import { userCanAccessSection } from "../../services/section.service.js";
import { db } from "../../db/index.js";

const router = Router({ mergeParams: true });

router.get("/:sectionId/projects/:exerciseId", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    if (!(await userCanAccessSection(req.params.sectionId, userId, role, db))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }

    const result = await getProjectWorkspace(req.params.sectionId, req.params.exerciseId, db);
    if (isProjectError(result)) {
      res.status(result.error.code === "NOT_FOUND" ? 404 : 400).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tải bài tập lớn." } });
  }
});

router.post("/:sectionId/projects/:exerciseId/groups", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    if (!(await userCanAccessSection(req.params.sectionId, userId, role, db))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }

    const result = await createProjectGroup(req.params.sectionId, req.params.exerciseId, req.body, db);
    if (isProjectError(result)) {
      res.status(result.error.code === "NOT_FOUND" ? 404 : 400).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tạo nhóm BTL." } });
  }
});

router.put("/:sectionId/projects/:exerciseId/groups/:groupId", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    if (!(await userCanAccessSection(req.params.sectionId, userId, role, db))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }

    const result = await updateProjectGroup(req.params.groupId, req.params.sectionId, req.body, db);
    if (isProjectError(result)) {
      res.status(result.error.code === "NOT_FOUND" ? 404 : 400).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể cập nhật nhóm BTL." } });
  }
});

router.patch("/:sectionId/projects/:exerciseId/groups/:groupId/grade", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    if (!(await userCanAccessSection(req.params.sectionId, userId, role, db))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }

    const result = await gradeProjectGroup(req.params.groupId, req.params.sectionId, userId, req.body, db);
    if (isProjectError(result)) {
      res.status(result.error.code === "NOT_FOUND" ? 404 : 400).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể chấm điểm nhóm BTL." } });
  }
});

router.delete("/:sectionId/projects/:exerciseId/groups/:groupId", async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.user!;
    if (!(await userCanAccessSection(req.params.sectionId, userId, role, db))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Bạn không phụ trách lớp này." } });
      return;
    }

    const result = await deleteProjectGroup(req.params.groupId, req.params.sectionId, db);
    if (isProjectError(result)) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể xóa nhóm BTL." } });
  }
});

export default router;
