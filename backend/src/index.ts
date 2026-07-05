import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import sectionRoutes from './routes/admin/section.routes.js';
import configRoutes from './routes/admin/config.routes.js';
import importRoutes from './routes/admin/import.routes.js';
import rosterRoutes from './routes/admin/roster.routes.js';
import userRoutes from './routes/admin/user.routes.js';
import adminExerciseRoutes from './routes/admin/exercise.routes.js';
import adminRoutes from './routes/admin.routes.js';
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
app.use('/api/admin/users', authMiddleware(), requireRole('admin'), userRoutes);
app.use('/api/admin/exercises', authMiddleware(), requireRole('admin'), adminExerciseRoutes);
app.use('/api/admin/config', authMiddleware(), requireRole('admin'), configRoutes);
app.use('/api/admin', adminRoutes);

// Instructor - Sections (assigned classes + detail)
app.use('/api/instructor/sections', authMiddleware(), requireRole('instructor'), instructorSectionRoutes);
app.use('/api/instructor/sections', authMiddleware(), requireRole('instructor'), instructorProjectRoutes);

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

// Student - Assigned exercises & enrolled sections
app.use('/api/students/exercises', authMiddleware(), requireRole('student'), studentExerciseRoutes);
app.use('/api/students/sections', authMiddleware(), requireRole('student'), studentSectionRoutes);

// Student - Anti-cheat event logging
app.use('/api/anticheat', authMiddleware(), requireRole('student'), studentAnticheatRoutes);

// Leaderboard (instructors and students can access)
app.use('/api/sections/:id/leaderboard', authMiddleware(), requireRole('instructor', 'student'), leaderboardRoutes);

// Shared Student Profile (instructors and students can access)
app.use('/api/sections', authMiddleware(), requireRole('instructor', 'student'), sharedProfileRouter);

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[server] Backend running on port ${PORT}`);
  });
}

export default app;
