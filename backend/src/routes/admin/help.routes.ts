import { Router, Request, Response } from 'express';
import { db } from '../../db/index.js';
import { helpSections, helpItems } from '../../db/schema.js';
import crypto from 'node:crypto';

const router = Router();

// PUT /api/admin/help-guide - Save full guide content
router.put('/', async (req: Request, res: Response) => {
  const sectionsData = req.body; // Array of { id, title, description, orderIndex, items: [...] }
  if (!Array.isArray(sectionsData)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Body must be an array of sections.' } });
  }

  try {
    await db.transaction(async (tx) => {
      // Clear existing content
      await tx.delete(helpItems);
      await tx.delete(helpSections);

      // Insert new content
      for (const sec of sectionsData) {
        await tx.insert(helpSections).values({
          id: sec.id,
          title: sec.title,
          description: sec.description || null,
          orderIndex: sec.orderIndex || 0,
        });

        if (Array.isArray(sec.items)) {
          for (const item of sec.items) {
            await tx.insert(helpItems).values({
              id: item.id || crypto.randomUUID(),
              sectionId: sec.id,
              type: item.type as "step" | "info" | "faq" | "checklist",
              title: item.title || null,
              content: item.content,
              orderIndex: item.orderIndex || 0,
            });
          }
        }
      }
    });

    res.status(200).json({ success: true, message: 'Help guide updated successfully.' });
  } catch (error) {
    console.error('Error updating help guide:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update help guide.' } });
  }
});

export default router;
