import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db as defaultDb } from "../db/index.js";
import { classSections, exercises, sourceCheckReports } from "../db/schema.js";
import {
  checkExercisePlagiarism,
  isPlagiarismError,
  type PlagiarismReport,
} from "./plagiarism.service.js";

type Database = any;

export interface SourceCheckReportFilters {
  exerciseId?: string;
  sectionId?: string;
  semester?: string;
  limit?: number;
}

export interface SaveSourceCheckReportInput {
  exerciseId: string;
  sectionId?: string | null;
  semester?: string | null;
  provider: string;
  threshold: number;
  status: "completed" | "failed";
  report: PlagiarismReport | Record<string, unknown>;
  artifactUrl?: string | null;
  workflowRunId?: string | null;
  triggeredBy?: string | null;
  startedAt?: string | null;
  finishedAt?: string;
}

export interface RunSourceCheckInput {
  exerciseId: string;
  sectionId?: string;
  semester?: string;
  provider?: string;
  threshold?: number;
  artifactUrl?: string;
  workflowRunId?: string;
  triggeredBy?: string;
  startedAt?: string;
}

export interface SourceCheckReportError {
  error: { code: string; message: string };
}

export function isSourceCheckReportError(value: unknown): value is SourceCheckReportError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as SourceCheckReportError).error?.code === "string"
  );
}

export async function saveSourceCheckReport(
  input: SaveSourceCheckReportInput,
  database: Database = defaultDb
) {
  const now = new Date().toISOString();
  const report = input.report as Partial<PlagiarismReport>;
  const row = {
    id: randomUUID(),
    exerciseId: input.exerciseId,
    sectionId: input.sectionId ?? null,
    semester: input.semester ?? null,
    provider: input.provider,
    threshold: input.threshold,
    status: input.status,
    totalSubmissions: report.totalSubmissions ?? 0,
    comparedPairs: report.comparedPairs ?? 0,
    pairCount: report.pairs?.length ?? 0,
    reportJson: JSON.stringify(input.report),
    artifactUrl: input.artifactUrl ?? null,
    workflowRunId: input.workflowRunId ?? null,
    triggeredBy: input.triggeredBy ?? null,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? now,
    createdAt: now,
  };

  await database.insert(sourceCheckReports).values(row);
  return getSourceCheckReport(row.id, database);
}

export async function runAndSaveSourceCheckReport(
  input: RunSourceCheckInput,
  database: Database = defaultDb
): Promise<SourceCheckReportError | Awaited<ReturnType<typeof saveSourceCheckReport>>> {
  const result = await checkExercisePlagiarism(
    input.exerciseId,
    {
      sectionId: input.sectionId,
      semester: input.semester,
      threshold: input.threshold,
    },
    database
  );

  if (isPlagiarismError(result)) {
    return result;
  }

  return saveSourceCheckReport(
    {
      exerciseId: input.exerciseId,
      sectionId: input.sectionId ?? null,
      semester: input.semester ?? null,
      provider: input.provider ?? "jplag",
      threshold: result.threshold,
      status: "completed",
      report: result,
      artifactUrl: input.artifactUrl ?? null,
      workflowRunId: input.workflowRunId ?? null,
      triggeredBy: input.triggeredBy ?? null,
      startedAt: input.startedAt ?? null,
      finishedAt: new Date().toISOString(),
    },
    database
  );
}

export async function listSourceCheckReports(
  filters: SourceCheckReportFilters = {},
  database: Database = defaultDb
) {
  const whereParts = [];
  if (filters.exerciseId) whereParts.push(eq(sourceCheckReports.exerciseId, filters.exerciseId));
  if (filters.sectionId) whereParts.push(eq(sourceCheckReports.sectionId, filters.sectionId));
  if (filters.semester) whereParts.push(eq(sourceCheckReports.semester, filters.semester));

  const rows = await database
    .select({
      id: sourceCheckReports.id,
      exerciseId: sourceCheckReports.exerciseId,
      exerciseTitle: exercises.title,
      sectionId: sourceCheckReports.sectionId,
      sectionName: classSections.name,
      sectionSemester: classSections.semester,
      semester: sourceCheckReports.semester,
      provider: sourceCheckReports.provider,
      threshold: sourceCheckReports.threshold,
      status: sourceCheckReports.status,
      totalSubmissions: sourceCheckReports.totalSubmissions,
      comparedPairs: sourceCheckReports.comparedPairs,
      pairCount: sourceCheckReports.pairCount,
      artifactUrl: sourceCheckReports.artifactUrl,
      workflowRunId: sourceCheckReports.workflowRunId,
      triggeredBy: sourceCheckReports.triggeredBy,
      startedAt: sourceCheckReports.startedAt,
      finishedAt: sourceCheckReports.finishedAt,
      createdAt: sourceCheckReports.createdAt,
    })
    .from(sourceCheckReports)
    .leftJoin(exercises, eq(sourceCheckReports.exerciseId, exercises.id))
    .leftJoin(classSections, eq(sourceCheckReports.sectionId, classSections.id))
    .where(whereParts.length > 0 ? and(...whereParts) : undefined)
    .orderBy(desc(sourceCheckReports.finishedAt))
    .limit(filters.limit ?? 20);

  return rows;
}

export async function getSourceCheckReport(id: string, database: Database = defaultDb) {
  const rows = await database
    .select({
      id: sourceCheckReports.id,
      exerciseId: sourceCheckReports.exerciseId,
      exerciseTitle: exercises.title,
      sectionId: sourceCheckReports.sectionId,
      sectionName: classSections.name,
      sectionSemester: classSections.semester,
      semester: sourceCheckReports.semester,
      provider: sourceCheckReports.provider,
      threshold: sourceCheckReports.threshold,
      status: sourceCheckReports.status,
      totalSubmissions: sourceCheckReports.totalSubmissions,
      comparedPairs: sourceCheckReports.comparedPairs,
      pairCount: sourceCheckReports.pairCount,
      reportJson: sourceCheckReports.reportJson,
      artifactUrl: sourceCheckReports.artifactUrl,
      workflowRunId: sourceCheckReports.workflowRunId,
      triggeredBy: sourceCheckReports.triggeredBy,
      startedAt: sourceCheckReports.startedAt,
      finishedAt: sourceCheckReports.finishedAt,
      createdAt: sourceCheckReports.createdAt,
    })
    .from(sourceCheckReports)
    .leftJoin(exercises, eq(sourceCheckReports.exerciseId, exercises.id))
    .leftJoin(classSections, eq(sourceCheckReports.sectionId, classSections.id))
    .where(eq(sourceCheckReports.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return {
      error: { code: "NOT_FOUND", message: "Không tìm thấy report kiểm tra mã nguồn." },
    };
  }

  return {
    ...row,
    report: JSON.parse(row.reportJson),
  };
}
