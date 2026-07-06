import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { helpSections, helpItems } from '../db/schema.js';
import { asc } from 'drizzle-orm';

const router = Router();

// GET /api/help-guide - Fetch full help guide structure
router.get('/', async (_req: Request, res: Response) => {
  try {
    const sections = await db.select().from(helpSections).orderBy(asc(helpSections.orderIndex));
    const items = await db.select().from(helpItems).orderBy(asc(helpItems.orderIndex));

    const responseData = sections.map(sec => ({
      ...sec,
      items: items.filter(item => item.sectionId === sec.id),
    }));

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching help guide:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve help guide.' } });
  }
});

export default router;
