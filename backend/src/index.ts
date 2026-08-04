import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import sectionRoutes from './routes/admin/section.routes.js';
import configRoutes from './routes/admin/config.routes.js';
import aiConfigRoutes from './routes/admin/ai-config.routes.js';
import importRoutes from './routes/admin/import.routes.js';
import rosterRoutes from './routes/admin/roster.routes.js';
import userRoutes from './routes/admin/user.routes.js';
import adminExerciseRoutes from './routes/admin/exercise.routes.js';
import adminRoutes from './routes/admin.routes.js';
import helpRoutes from './routes/help.routes.js';
import adminHelpRoutes from './routes/admin/help.routes.js';
import { exerciseTestCaseRouter, testCaseRouter } from './routes/instructor/testcase.routes.js';
import exerciseRoutes from './routes/instructor/exercise.routes.js';
import submissionRoutes from './routes/instructor/submission.routes.js';
import instructorSectionRoutes, { sharedProfileRouter } from './routes/instructor/section.routes.js';
import instructorProjectRoutes from './routes/instructor/project.routes.js';
import studentSubmissionRoutes from './routes/student/submission.routes.js';
import studentProgressRoutes from './routes/student/progress.routes.js';
import studentAnticheatRoutes from './routes/student/anticheat.routes.js';
import studentExerciseRoutes from './routes/student/exercise.routes.js';
import studentSectionRoutes from './routes/student/section.routes.js';
import studentProjectRoutes from './routes/student/project.routes.js';
import studentAssessmentRoutes from './routes/student/assessment.routes.js';
import instructorAnticheatRoutes from './routes/instructor/anticheat.routes.js';
import instructorAssessmentRoutes from './routes/instructor/assessment.routes.js';
import leaderboardRoutes from './routes/instructor/leaderboard.routes.js';
import sourceCheckRoutes from './routes/source-check.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { requireRole } from './middleware/role.guard.js';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from './db/index.js';
import { ensureDatabaseCompatibility } from './db/compat.js';
import { createCorsOrigin } from './config/cors.js';
import { startAssessmentAiWorker } from './services/assessment.service.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: createCorsOrigin(),
  credentials: true,
}));
app.use(express.json({ limit: '6mb' }));

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/help-guide', helpRoutes);
app.use('/api/admin/help-guide', authMiddleware(), requireRole('admin'), adminHelpRoutes);
app.use('/api/admin/sections', authMiddleware(), requireRole('admin'), sectionRoutes);
app.use('/api/admin/sections', authMiddleware(), requireRole('admin'), importRoutes);
app.use('/api/admin', authMiddleware(), requireRole('admin'), rosterRoutes);
app.use('/api/admin/users', authMiddleware(), requireRole('admin'), userRoutes);
app.use('/api/admin/exercises', authMiddleware(), requireRole('admin'), adminExerciseRoutes);
app.use('/api/admin/config', authMiddleware(), requireRole('admin'), configRoutes);
app.use('/api/admin/ai-config', authMiddleware(), requireRole('admin'), aiConfigRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/source-check', sourceCheckRoutes);

// Instructor - Sections (assigned classes + detail)
app.use('/api/instructor/sections', authMiddleware(), requireRole('instructor'), instructorSectionRoutes);
app.use('/api/instructor/sections', authMiddleware(), requireRole('instructor'), instructorProjectRoutes);

// Instructor - Test Cases
app.use('/api/exercises/:exerciseId/testcases', authMiddleware(), requireRole('instructor'), exerciseTestCaseRouter);
app.use('/api/testcases', authMiddleware(), requireRole('instructor'), testCaseRouter);

// Instructor - Exercises
app.use('/api/exercises', authMiddleware(), requireRole('instructor'), exerciseRoutes);
app.use('/api/instructor/assessments', authMiddleware(), requireRole('instructor'), instructorAssessmentRoutes);

// Submissions - all methods accessible by authenticated students and instructors
// POST is student-only (enforced inside the student submission router via role check)
// GET is accessible by both instructors and students
app.use('/api/submissions', authMiddleware(), requireRole('instructor', 'student'), studentSubmissionRoutes);
app.use('/api/submissions', authMiddleware(), requireRole('instructor', 'student'), submissionRoutes);
app.use('/api/submissions', authMiddleware(), requireRole('instructor'), instructorAnticheatRoutes);

// Student - Progress
app.use('/api/students/progress', authMiddleware(), requireRole('student'), studentProgressRoutes);

// Student - Assigned exercises & enrolled sections
app.use('/api/students/exercises', authMiddleware(), requireRole('student'), studentExerciseRoutes);
app.use('/api/students/sections', authMiddleware(), requireRole('student'), studentSectionRoutes);
app.use('/api/students/sections', authMiddleware(), requireRole('student'), studentProjectRoutes);
app.use('/api/students/assessments', authMiddleware(), requireRole('student'), studentAssessmentRoutes);

// Student - Anti-cheat event logging
app.use('/api/anticheat', authMiddleware(), requireRole('student'), studentAnticheatRoutes);

// Leaderboard (instructors and students can access)
app.use('/api/sections/:id/leaderboard', authMiddleware(), requireRole('instructor', 'student'), leaderboardRoutes);

// Shared Student Profile (instructors and students can access)
app.use('/api/sections', authMiddleware(), requireRole('instructor', 'student'), sharedProfileRouter);

async function seedMigrationHistoryIfNeeded() {
  try {
    const { libsqlClient } = await import('./db/client.js');

    // Check if DB is a legacy install: has 'users' but no migration journal
    const [usersResult, migrationsResult] = await Promise.all([
      libsqlClient.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'"),
      libsqlClient.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"),
    ]);

    const hasUsers = usersResult.rows.length > 0;
    const hasMigrationsTable = migrationsResult.rows.length > 0;

    if (!hasUsers || hasMigrationsTable) return; // Fresh DB or already seeded

    console.log('[server] Legacy database detected — seeding Drizzle migration history...');

    // Drizzle skips a migration if: lastRecord.created_at >= migration.folderMillis
    // So we insert 1 record whose created_at equals the latest migration's 'when',
    // with the correct SHA256 hash of its SQL content.
    const { readFileSync } = await import('fs');
    const { createHash } = await import('crypto');

    let journal: { entries: Array<{ tag: string; when: number }> };
    try {
      journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf-8'));
    } catch {
      console.warn('[server] Could not read migration journal; skipping history seed.');
      return;
    }

    const lastEntry = journal.entries.at(-1);
    if (!lastEntry) return;

    const lastSql = readFileSync(`./drizzle/${lastEntry.tag}.sql`, 'utf-8');
    const hash = createHash('sha256').update(lastSql).digest('hex');

    await libsqlClient.execute(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )`);

    await libsqlClient.execute({
      sql: 'INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
      args: [hash, lastEntry.when],
    });

    console.log(`[server] Seeded __drizzle_migrations with last migration: ${lastEntry.tag}`);
  } catch (err) {
    // Non-fatal — migrate() try/catch below handles fallback
    console.warn('[server] seedMigrationHistoryIfNeeded failed (non-fatal):', err);
  }
}

async function startServer() {
  try {
    // Best-effort: seed __drizzle_migrations for legacy DBs so migrate() won't
    // try to re-run already-applied CREATE TABLE statements.
    await seedMigrationHistoryIfNeeded();

    try {
      await migrate(db, { migrationsFolder: './drizzle' });
    } catch (migrateError) {
      // Legacy databases predate Drizzle's journal — seeding may have failed due
      // to client API differences. The compat bootstrap below covers those DBs.
      console.warn('[server] Drizzle migrations could not be applied; using compatibility bootstrap.', migrateError);
    }

    await ensureDatabaseCompatibility(db);
    console.log('[server] Database migrations and compatibility checks applied successfully');
    startAssessmentAiWorker();

    app.listen(PORT, () => {
      console.log(`[server] Backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[server] Database initialization failed; server was not started.', error);
    process.exitCode = 1;
  }
}

// Start accepting requests only after all required tables are ready.
if (process.env.NODE_ENV !== 'test') {
  void startServer();
}

export default app;
