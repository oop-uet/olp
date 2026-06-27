import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import sectionRoutes from './routes/admin/section.routes.js';
import configRoutes from './routes/admin/config.routes.js';
import importRoutes from './routes/admin/import.routes.js';
import rosterRoutes from './routes/admin/roster.routes.js';
import userRoutes from './routes/admin/user.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { exerciseTestCaseRouter, testCaseRouter } from './routes/instructor/testcase.routes.js';
import exerciseRoutes from './routes/instructor/exercise.routes.js';
import submissionRoutes from './routes/instructor/submission.routes.js';
import instructorSectionRoutes from './routes/instructor/section.routes.js';
import studentSubmissionRoutes from './routes/student/submission.routes.js';
import studentProgressRoutes from './routes/student/progress.routes.js';
import studentAnticheatRoutes from './routes/student/anticheat.routes.js';
import instructorAnticheatRoutes from './routes/instructor/anticheat.routes.js';
import leaderboardRoutes from './routes/instructor/leaderboard.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { requireRole } from './middleware/role.guard.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/sections', authMiddleware(), requireRole('admin'), sectionRoutes);
app.use('/api/admin/sections', authMiddleware(), requireRole('admin'), importRoutes);
app.use('/api/admin', authMiddleware(), requireRole('admin'), rosterRoutes);
app.use('/api/admin/config', authMiddleware(), requireRole('admin'), configRoutes);
app.use('/api/admin', adminRoutes);

// Instructor - Test Cases
app.use('/api/exercises/:exerciseId/testcases', authMiddleware(), requireRole('instructor'), exerciseTestCaseRouter);
app.use('/api/testcases', authMiddleware(), requireRole('instructor'), testCaseRouter);

// Instructor - Exercises
app.use('/api/exercises', authMiddleware(), requireRole('instructor'), exerciseRoutes);

// Submissions - all methods accessible by authenticated students and instructors
// POST is student-only (enforced inside the student submission router via role check)
// GET is accessible by both instructors and students
app.use('/api/submissions', authMiddleware(), requireRole('instructor', 'student'), studentSubmissionRoutes);
app.use('/api/submissions', authMiddleware(), requireRole('instructor', 'student'), submissionRoutes);
app.use('/api/submissions', authMiddleware(), requireRole('instructor'), instructorAnticheatRoutes);

// Student - Progress
app.use('/api/students/progress', authMiddleware(), requireRole('student'), studentProgressRoutes);

// Student - Anti-cheat event logging
app.use('/api/anticheat', authMiddleware(), requireRole('student'), studentAnticheatRoutes);

// Leaderboard (instructors and students can access)
app.use('/api/sections/:id/leaderboard', authMiddleware(), requireRole('instructor', 'student'), leaderboardRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`[server] Backend running on port ${PORT}`);
});

export default app;
