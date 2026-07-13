import { Router, Request, Response } from "express";
import {
  getStudentProjectWorkspace,
  isProjectError,
  saveStudentProjectGroup,
} from "../../services/project.service.js";
import { db } from "../../db/index.js";

const router = Router({ mergeParams: true });

router.get("/:sectionId/projects/:exerciseId", async (req: Request, res: Response) => {
  try {
    const result = await getStudentProjectWorkspace(
      req.user!.userId,
      req.params.sectionId,
      req.params.exerciseId,
      db
    );

    if (isProjectError(result)) {
      const status = result.error.code === "NOT_FOUND" ? 404 : 403;
      res.status(status).json({ error: result.error });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể tải bài tập lớn." } });
  }
});

router.put("/:sectionId/projects/:exerciseId/my-group", async (req: Request, res: Response) => {
  try {
    const result = await saveStudentProjectGroup(
      req.user!.userId,
      req.params.sectionId,
      req.params.exerciseId,
      req.body,
      db
    );

    if (isProjectError(result)) {
      const status = result.error.code === "NOT_FOUND" ? 404 : 400;
      res.status(status).json({ error: result.error });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Không thể lưu nhóm bài tập lớn." } });
  }
});

export default router;
