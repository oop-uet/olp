import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "../db/index.js";
import {
  classSections,
  exerciseAssignments,
  exercises,
  projectGroupMembers,
  projectGroups,
  sectionEnrollments,
  users,
} from "../db/schema.js";

type Database = typeof defaultDb;

export interface ProjectMemberInput {
  student_external_id: string;
  is_leader?: boolean;
  contribution_percent?: number;
}

export interface ProjectGroupInput {
  name: string;
  repository_url?: string | null;
  members?: ProjectMemberInput[];
}

export interface ProjectGradeInput {
  score: number;
  feedback?: string | null;
}

export function isProjectError(
  value: unknown
): value is { error: { code: string; message: string } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as any).error?.code === "string"
  );
}

export async function getProjectWorkspace(
  sectionId: string,
  exerciseId: string,
  database: Database = defaultDb
) {
  await ensureProjectTablesReady(database);

  const assignment = await loadAssignedProject(sectionId, exerciseId, database);
  if (isProjectError(assignment)) return assignment;

  const [students, groups] = await Promise.all([
    listSectionStudents(sectionId, database),
    listProjectGroups(sectionId, exerciseId, database),
  ]);

  const studentsInGroups = new Set(
    groups.flatMap((group) => group.members.map((member) => member.studentExternalId))
  );
  const gradedGroups = groups.filter((group) => group.status === "graded");
  const submittedGroups = groups.filter((group) => Boolean(group.repositoryUrl));
  const averageScore =
    gradedGroups.length === 0
      ? 0
      : gradedGroups.reduce((sum, group) => sum + (group.score ?? 0), 0) / gradedGroups.length;

  return {
    section: assignment.section,
    exercise: assignment.exercise,
    groups,
    students,
    stats: {
      totalGroups: groups.length,
      totalStudents: students.length,
      studentsInGroups: studentsInGroups.size,
      submittedGroups: submittedGroups.length,
      gradedGroups: gradedGroups.length,
      averageScore: Number(averageScore.toFixed(1)),
    },
    history: groups
      .map((group) => ({
        id: group.id,
        groupName: group.name,
        action:
          group.status === "graded"
            ? "Đã chấm điểm"
            : group.repositoryUrl
              ? "Đã nộp URL GitHub"
              : "Đã tạo nhóm",
        score: group.score,
        at: group.gradedAt || group.updatedAt || group.createdAt,
      }))
      .sort((a, b) => b.at.localeCompare(a.at)),
  };
}

export async function getStudentProjectWorkspace(
  studentId: string,
  sectionId: string,
  exerciseId: string,
  database: Database = defaultDb
) {
  await ensureProjectTablesReady(database);

  const student = await getStudentInSection(studentId, sectionId, database);
  if (!student) {
    return { error: { code: "FORBIDDEN", message: "Bạn chưa được ghi danh vào lớp này." } };
  }

  const assignment = await loadAssignedProject(sectionId, exerciseId, database);
  if (isProjectError(assignment)) return assignment;
  if (!assignment.exercise.isVisible) {
    return { error: { code: "NOT_FOUND", message: "Bài tập lớn chưa được mở cho lớp này." } };
  }

  const [students, groups] = await Promise.all([
    listSectionStudents(sectionId, database),
    listProjectGroups(sectionId, exerciseId, database),
  ]);
  const myGroup = groups.find((group) =>
    group.members.some((member) => member.studentExternalId === student.studentExternalId)
  ) ?? null;

  const studentsInGroups = new Set(
    groups.flatMap((group) => group.members.map((member) => member.studentExternalId))
  );
  const submittedGroups = groups.filter((group) => Boolean(group.repositoryUrl));
  const gradedGroups = groups.filter((group) => group.status === "graded");

  return {
    section: assignment.section,
    exercise: assignment.exercise,
    students,
    groups,
    myGroup,
    currentStudent: student,
    stats: {
      totalGroups: groups.length,
      totalStudents: students.length,
      studentsInGroups: studentsInGroups.size,
      submittedGroups: submittedGroups.length,
      gradedGroups: gradedGroups.length,
    },
  };
}

export async function saveStudentProjectGroup(
  studentId: string,
  sectionId: string,
  exerciseId: string,
  input: ProjectGroupInput,
  database: Database = defaultDb
) {
  await ensureProjectTablesReady(database);

  const workspace = await getStudentProjectWorkspace(studentId, sectionId, exerciseId, database);
  if (isProjectError(workspace)) return workspace;

  const currentStudent = workspace.currentStudent;
  const existingGroup = workspace.myGroup;
  const normalizedInput = {
    ...input,
    members: ensureCurrentStudentMember(input.members ?? [], currentStudent.studentExternalId),
  };

  if (existingGroup) {
    return updateProjectGroup(existingGroup.id, sectionId, normalizedInput, database);
  }

  return createProjectGroup(sectionId, exerciseId, normalizedInput, database);
}

export async function createProjectGroup(
  sectionId: string,
  exerciseId: string,
  input: ProjectGroupInput,
  database: Database = defaultDb
) {
  await ensureProjectTablesReady(database);
  const assignment = await loadAssignedProject(sectionId, exerciseId, database);
  if (isProjectError(assignment)) return assignment;

  const name = input.name.trim();
  if (!name) {
    return { error: { code: "VALIDATION_ERROR", message: "Tên nhóm là bắt buộc." } };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database.insert(projectGroups).values({
    id,
    sectionId,
    exerciseId,
    name,
    repositoryUrl: input.repository_url?.trim() || null,
    score: null,
    feedback: null,
    status: input.repository_url?.trim() ? "submitted" : "draft",
    createdAt: now,
    updatedAt: now,
    gradedAt: null,
    gradedBy: null,
  });

  await replaceGroupMembers(id, sectionId, input.members ?? [], database);
  return getProjectGroup(id, database);
}

export async function updateProjectGroup(
  groupId: string,
  sectionId: string,
  input: ProjectGroupInput,
  database: Database = defaultDb
) {
  await ensureProjectTablesReady(database);
  const existing = await database.query.projectGroups.findFirst({
    where: and(eq(projectGroups.id, groupId), eq(projectGroups.sectionId, sectionId)),
  });
  if (!existing) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy nhóm BTL." } };
  }

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      return { error: { code: "VALIDATION_ERROR", message: "Tên nhóm là bắt buộc." } };
    }
    update.name = name;
  }
  if (input.repository_url !== undefined) {
    const repositoryUrl = input.repository_url?.trim() || null;
    update.repositoryUrl = repositoryUrl;
    if (existing.status !== "graded") update.status = repositoryUrl ? "submitted" : "draft";
  }

  await database.update(projectGroups).set(update).where(eq(projectGroups.id, groupId));

  if (input.members) {
    await replaceGroupMembers(groupId, sectionId, input.members, database);
  }

  return getProjectGroup(groupId, database);
}

export async function gradeProjectGroup(
  groupId: string,
  sectionId: string,
  graderId: string,
  input: ProjectGradeInput,
  database: Database = defaultDb
) {
  await ensureProjectTablesReady(database);
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
    return { error: { code: "VALIDATION_ERROR", message: "Điểm phải nằm trong khoảng 0-100." } };
  }

  const existing = await database.query.projectGroups.findFirst({
    where: and(eq(projectGroups.id, groupId), eq(projectGroups.sectionId, sectionId)),
  });
  if (!existing) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy nhóm BTL." } };
  }

  const now = new Date().toISOString();
  await database
    .update(projectGroups)
    .set({
      score: input.score,
      feedback: input.feedback?.trim() || null,
      status: "graded",
      gradedAt: now,
      gradedBy: graderId,
      updatedAt: now,
    })
    .where(eq(projectGroups.id, groupId));

  return getProjectGroup(groupId, database);
}

export async function deleteProjectGroup(
  groupId: string,
  sectionId: string,
  database: Database = defaultDb
) {
  await ensureProjectTablesReady(database);
  const existing = await database.query.projectGroups.findFirst({
    where: and(eq(projectGroups.id, groupId), eq(projectGroups.sectionId, sectionId)),
  });
  if (!existing) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy nhóm BTL." } };
  }
  await database.delete(projectGroupMembers).where(eq(projectGroupMembers.groupId, groupId));
  await database.delete(projectGroups).where(eq(projectGroups.id, groupId));
  return { success: true };
}

async function loadAssignedProject(sectionId: string, exerciseId: string, database: Database) {
  const assignment = await database
    .select({
      sectionId: classSections.id,
      sectionName: classSections.name,
      semester: classSections.semester,
      exerciseId: exercises.id,
      title: exercises.title,
      description: exercises.description,
      difficulty: exercises.difficulty,
      deadline: exerciseAssignments.deadline,
      allowSubmission: exerciseAssignments.allowSubmission,
      isVisible: exerciseAssignments.isVisible,
    })
    .from(exerciseAssignments)
    .innerJoin(classSections, eq(exerciseAssignments.sectionId, classSections.id))
    .innerJoin(exercises, eq(exerciseAssignments.exerciseId, exercises.id))
    .where(and(eq(exerciseAssignments.sectionId, sectionId), eq(exerciseAssignments.exerciseId, exerciseId)))
    .limit(1);

  const row = assignment[0];
  if (!row) {
    return { error: { code: "NOT_FOUND", message: "Không tìm thấy bài tập lớn trong lớp này." } };
  }

  return {
    section: {
      id: row.sectionId,
      name: row.sectionName,
      semester: row.semester,
    },
    exercise: {
      id: row.exerciseId,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      deadline: row.deadline,
      allowSubmission: Boolean(row.allowSubmission),
      isVisible: Boolean(row.isVisible),
    },
  };
}

async function listSectionStudents(sectionId: string, database: Database) {
  const rows = await database
    .select({
      userId: users.id,
      username: users.username,
      fullName: users.fullName,
      email: users.email,
      studentExternalId: sectionEnrollments.studentExternalId,
    })
    .from(sectionEnrollments)
    .innerJoin(users, eq(sectionEnrollments.studentId, users.id))
    .where(eq(sectionEnrollments.sectionId, sectionId));

  return rows.map((row) => ({
    userId: row.userId,
    studentExternalId: row.studentExternalId || row.username,
    username: row.username,
    fullName: row.fullName || row.username,
    email: row.email,
  }));
}

async function getStudentInSection(studentId: string, sectionId: string, database: Database) {
  const rows = await database
    .select({
      userId: users.id,
      username: users.username,
      fullName: users.fullName,
      email: users.email,
      studentExternalId: sectionEnrollments.studentExternalId,
    })
    .from(sectionEnrollments)
    .innerJoin(users, eq(sectionEnrollments.studentId, users.id))
    .where(and(eq(sectionEnrollments.sectionId, sectionId), eq(sectionEnrollments.studentId, studentId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.userId,
    studentExternalId: row.studentExternalId || row.username,
    username: row.username,
    fullName: row.fullName || row.username,
    email: row.email,
  };
}

function ensureCurrentStudentMember(members: ProjectMemberInput[], studentExternalId: string) {
  const normalized = members.filter((member) => member.student_external_id?.trim());
  if (normalized.some((member) => member.student_external_id.trim() === studentExternalId)) {
    return normalized;
  }

  return [
    {
      student_external_id: studentExternalId,
      is_leader: normalized.length === 0,
      contribution_percent: normalized.length === 0 ? 100 : 0,
    },
    ...normalized,
  ];
}

async function listProjectGroups(sectionId: string, exerciseId: string, database: Database) {
  const rows = await database
    .select()
    .from(projectGroups)
    .where(and(eq(projectGroups.sectionId, sectionId), eq(projectGroups.exerciseId, exerciseId)))
    .orderBy(desc(projectGroups.updatedAt));

  return Promise.all(rows.map((row) => getProjectGroup(row.id, database)));
}

async function getProjectGroup(groupId: string, database: Database) {
  const group = await database.query.projectGroups.findFirst({
    where: eq(projectGroups.id, groupId),
  });
  if (!group) {
    throw new Error("Project group not found after write");
  }
  const members = await database
    .select({
      id: projectGroupMembers.id,
      studentId: projectGroupMembers.studentId,
      studentExternalId: projectGroupMembers.studentExternalId,
      studentName: projectGroupMembers.studentName,
      isLeader: projectGroupMembers.isLeader,
      contributionPercent: projectGroupMembers.contributionPercent,
    })
    .from(projectGroupMembers)
    .where(eq(projectGroupMembers.groupId, groupId));

  return {
    id: group.id,
    sectionId: group.sectionId,
    exerciseId: group.exerciseId,
    name: group.name,
    repositoryUrl: group.repositoryUrl,
    score: group.score,
    feedback: group.feedback,
    status: group.status,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    gradedAt: group.gradedAt,
    members: members.map((member) => ({
      id: member.id,
      studentId: member.studentId,
      studentExternalId: member.studentExternalId,
      studentName: member.studentName,
      isLeader: Boolean(member.isLeader),
      contributionPercent: member.contributionPercent,
    })),
  };
}

async function replaceGroupMembers(
  groupId: string,
  sectionId: string,
  members: ProjectMemberInput[],
  database: Database
) {
  await database.delete(projectGroupMembers).where(eq(projectGroupMembers.groupId, groupId));
  if (members.length === 0) return;

  const students = await listSectionStudents(sectionId, database);
  const studentsByExternalId = new Map(students.map((student) => [student.studentExternalId, student]));
  const now = new Date().toISOString();

  for (const [index, member] of members.entries()) {
    const externalId = member.student_external_id.trim();
    if (!externalId) continue;
    const student = studentsByExternalId.get(externalId);
    if (!student) continue;

    await database.insert(projectGroupMembers).values({
      id: crypto.randomUUID(),
      groupId,
      studentId: student.userId,
      studentExternalId: student.studentExternalId,
      studentName: student.fullName,
      isLeader: member.is_leader || index === 0 ? 1 : 0,
      contributionPercent: normalizeContribution(member.contribution_percent),
      createdAt: now,
    });
  }
}

function normalizeContribution(value?: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

async function ensureProjectTablesReady(database: Database = defaultDb) {
  const sqlite = (database as any).session?.client;
  if (!sqlite) return;

  const sql = `
    CREATE TABLE IF NOT EXISTS project_groups (
      id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL REFERENCES class_sections(id),
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      name TEXT NOT NULL,
      repository_url TEXT,
      score REAL,
      feedback TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      graded_at TEXT,
      graded_by TEXT REFERENCES users(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS project_groups_section_exercise_name_unique
      ON project_groups(section_id, exercise_id, name);
    CREATE TABLE IF NOT EXISTS project_group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES project_groups(id),
      student_id TEXT REFERENCES users(id),
      student_external_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      is_leader INTEGER NOT NULL DEFAULT 0,
      contribution_percent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS project_group_members_group_student_unique
      ON project_group_members(group_id, student_external_id);
  `;

  if (typeof sqlite.exec === "function") {
    sqlite.exec(sql);
  } else if (typeof sqlite.executeMultiple === "function") {
    await sqlite.executeMultiple(sql);
  } else if (typeof sqlite.execute === "function") {
    for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
      await sqlite.execute(`${statement};`);
    }
  }
}
