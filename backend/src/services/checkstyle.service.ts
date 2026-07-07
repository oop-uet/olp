import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHECKSTYLE_VERSION = process.env.CHECKSTYLE_VERSION ?? "10.26.1";
const CHECKSTYLE_URL =
  process.env.CHECKSTYLE_DOWNLOAD_URL ??
  `https://github.com/checkstyle/checkstyle/releases/download/checkstyle-${CHECKSTYLE_VERSION}/checkstyle-${CHECKSTYLE_VERSION}-all.jar`;
const DEFAULT_CACHE_DIR = path.resolve(__dirname, "..", "..", ".cache");
const DEFAULT_JAR_PATH = path.join(DEFAULT_CACHE_DIR, `checkstyle-${CHECKSTYLE_VERSION}-all.jar`);
const CHECKSTYLE_TIMEOUT_MS = Number(process.env.CHECKSTYLE_TIMEOUT_MS ?? 15_000);
const JRE_DOWNLOAD_TIMEOUT_MS = Number(process.env.CHECKSTYLE_JRE_DOWNLOAD_TIMEOUT_MS ?? 180_000);
const COMMON_JAVA_COMMANDS = [
  "java",
  "/usr/bin/java",
  "/usr/local/bin/java",
  "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
  "/usr/lib/jvm/java-21-openjdk-amd64/bin/java",
  "/opt/render/project/.jdk/bin/java",
];
let bundledJavaInstallPromise: Promise<string | null> | null = null;

export interface JavaSourceFile {
  name: string;
  content: string;
}

export interface CheckstyleViolation {
  file: string;
  line: number | null;
  column: number | null;
  severity: string;
  message: string;
  source: string;
}

export interface CheckstyleEvaluation {
  status: "passed" | "failed" | "unavailable" | "skipped";
  score: number | null;
  violationCount: number;
  violations: CheckstyleViolation[];
  feedback: string | null;
  toolVersion: string;
}

interface CheckstyleOptions {
  penaltyPerViolation?: number;
  maxViolations?: number;
}

export function isValidCheckstyleReport(xml: string): boolean {
  if (!xml || xml.trim().length === 0) return false;
  if (!xml.includes("<checkstyle") || !xml.includes("</checkstyle>")) return false;
  if (xml.includes("<exception>")) return false;
  return true;
}

export async function evaluateCheckstyle(
  code: string,
  options: CheckstyleOptions = {}
): Promise<CheckstyleEvaluation> {
  const files = extractJavaFiles(code);
  if (files.length === 0) {
    return unavailable("Không tìm thấy file Java để kiểm tra quy tắc lập trình.");
  }

  const javaCommand = await resolveJavaCommand() ?? await ensureBundledJavaRuntime();
  if (!javaCommand) {
    return unavailable(
      "Không tìm thấy Java runtime trong môi trường backend và không thể tự chuẩn bị JRE cho Checkstyle."
    );
  }

  const jarPath = await resolveCheckstyleJar();
  if (!jarPath) {
    return unavailable("Không thể chuẩn bị Checkstyle JAR.");
  }

  const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), "oop-checkstyle-"));
  try {
    const filePaths = await writeJavaFiles(workingDir, files);
    const reportPath = path.join(workingDir, "checkstyle-report.xml");

    await runCheckstyle(javaCommand, jarPath, reportPath, filePaths);
    const report = await fs.readFile(reportPath, "utf8").catch(() => "");
    
    console.log(`[checkstyle] Report content size: ${report.length} bytes`);
    if (report.length > 0) {
      console.log(`[checkstyle] Report preview: ${report.substring(0, 300)}`);
    }

    if (!isValidCheckstyleReport(report)) {
      throw new Error(
        report.includes("<exception>")
          ? "Checkstyle gặp lỗi exception nội bộ."
          : "Báo cáo Checkstyle rỗng hoặc không hợp lệ."
      );
    }

    const violations = parseCheckstyleXml(report, workingDir);
    const penalty = clampNumber(options.penaltyPerViolation ?? 5, 1, 100);
    const maxViolations = Math.max(1, options.maxViolations ?? 20);
    const countedViolations = Math.min(violations.length, maxViolations);
    const score = Math.max(0, Math.round((100 - countedViolations * penalty) * 100) / 100);

    return {
      status: violations.length === 0 ? "passed" : "failed",
      score,
      violationCount: violations.length,
      violations,
      feedback:
        violations.length === 0
          ? "Không phát hiện lỗi Checkstyle theo Google Java Style."
          : `Phát hiện ${violations.length} lỗi Checkstyle. Điểm quy tắc lập trình: ${score}/100.`,
      toolVersion: `checkstyle-${CHECKSTYLE_VERSION}`,
    };
  } catch (error) {
    console.error("[checkstyle] Evaluation failed:", error);
    return unavailable(
      error instanceof Error ? `Không chạy được Checkstyle: ${error.message}` : "Không chạy được Checkstyle."
    );
  } finally {
    await fs.rm(workingDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function extractJavaFiles(code: string): JavaSourceFile[] {
  try {
    const parsed = JSON.parse(code) as {
      format?: string;
      files?: Array<{ name?: string; content?: string }>;
    };

    if (parsed.format === "oop-java-files" && Array.isArray(parsed.files)) {
      return parsed.files
        .filter((file) => file.name?.endsWith(".java") && typeof file.content === "string")
        .map((file) => ({
          name: sanitizeJavaFileName(file.name as string),
          content: file.content as string,
        }));
    }
  } catch {
    // Legacy single-file submissions are raw source.
  }

  if (!looksLikeJava(code)) return [];
  return [{ name: inferJavaFileName(code), content: code }];
}

async function resolveCheckstyleJar(): Promise<string | null> {
  const configuredPath = process.env.CHECKSTYLE_JAR_PATH;
  if (configuredPath && await fileExists(configuredPath)) return configuredPath;
  if (await fileExists(DEFAULT_JAR_PATH)) return DEFAULT_JAR_PATH;
  if ((process.env.CHECKSTYLE_AUTO_DOWNLOAD ?? "1") !== "1") return null;

  await fs.mkdir(path.dirname(DEFAULT_JAR_PATH), { recursive: true });
  await downloadFile(CHECKSTYLE_URL, DEFAULT_JAR_PATH);
  return await fileExists(DEFAULT_JAR_PATH) ? DEFAULT_JAR_PATH : null;
}

async function resolveJavaCommand(): Promise<string | null> {
  const configuredJava = process.env.CHECKSTYLE_JAVA_BIN;
  if (configuredJava && await hasCommand(configuredJava, ["-version"])) return configuredJava;

  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const javaHomeCommand = path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
    if (await hasCommand(javaHomeCommand, ["-version"])) return javaHomeCommand;
  }

  const candidates = process.platform === "win32"
    ? ["java", ...localJavaCandidates()]
    : [...localJavaCandidates(), ...COMMON_JAVA_COMMANDS];
  for (const candidate of candidates) {
    if (await hasCommand(candidate, ["-version"])) return candidate;
  }

  return null;
}

function localJavaCandidates(): string[] {
  const executable = process.platform === "win32" ? "java.exe" : "java";
  return [
    path.resolve(process.cwd(), ".java", "bin", executable),
    path.resolve(process.cwd(), "backend", ".java", "bin", executable),
  ];
}

async function ensureBundledJavaRuntime(): Promise<string | null> {
  if ((process.env.CHECKSTYLE_AUTO_DOWNLOAD_JRE ?? "1") !== "1") return null;
  if (process.platform !== "linux") return null;

  if (!bundledJavaInstallPromise) {
    bundledJavaInstallPromise = installBundledJavaRuntime().catch((error) => {
      console.warn("[checkstyle] Cannot prepare bundled Java runtime:", error);
      bundledJavaInstallPromise = null;
      return null;
    });
  }

  return bundledJavaInstallPromise;
}

async function installBundledJavaRuntime(): Promise<string | null> {
  for (const candidate of localJavaCandidates()) {
    if (await hasCommand(candidate, ["-version"])) return candidate;
  }

  const arch = os.arch() === "arm64" ? "aarch64" : os.arch() === "x64" ? "x64" : null;
  if (!arch) return null;

  const executable = path.resolve(process.cwd(), ".java", "bin", "java");
  const targetDir = path.dirname(path.dirname(executable));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "oop-checkstyle-jre-"));
  const archivePath = path.join(tempDir, "jre.tar.gz");
  const downloadUrl =
    `https://api.adoptium.net/v3/binary/latest/17/ga/linux/${arch}/jre/hotspot/normal/eclipse?project=jdk`;

  try {
    await downloadFile(downloadUrl, archivePath, JRE_DOWNLOAD_TIMEOUT_MS);
    await execFileAsync("tar", ["-xzf", archivePath, "-C", tempDir], {
      timeout: JRE_DOWNLOAD_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });

    const extractedJavaHome = await findJavaHome(tempDir);
    if (!extractedJavaHome) return null;

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.cp(extractedJavaHome, targetDir, { recursive: true });
    await fs.chmod(executable, 0o755).catch(() => undefined);

    return await hasCommand(executable, ["-version"]) ? executable : null;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function findJavaHome(rootDir: string): Promise<string | null> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(rootDir, entry.name, "bin", "java");
    if (await fileExists(candidate)) return path.join(rootDir, entry.name);
  }
  return null;
}

async function runCheckstyle(javaCommand: string, jarPath: string, reportPath: string, filePaths: string[]) {
  const args = [
    "-jar",
    jarPath,
    "-c",
    "/google_checks.xml",
    "-f",
    "xml",
    "-o",
    reportPath,
    ...filePaths,
  ];

  console.log(`[checkstyle] Running: ${javaCommand} ${args.join(" ")}`);

  try {
    const { stderr } = await execFileAsync(javaCommand, args, {
      timeout: CHECKSTYLE_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    console.log(`[checkstyle] Executed successfully (exit code 0). stderr length: ${stderr.length}`);
  } catch (error: any) {
    console.warn(`[checkstyle] Execution caught non-zero or error. Msg: ${error.message}, stderr: ${error.stderr || ""}`);
    // Checkstyle exits non-zero when it finds violations. That is still a valid report.
    if (await fileExists(reportPath)) {
      const content = await fs.readFile(reportPath, "utf8").catch(() => "");
      if (isValidCheckstyleReport(content)) {
        return;
      }
    }
    throw new Error(error?.stderr || error?.message || "Checkstyle exited without a valid report.");
  }
}

async function writeJavaFiles(rootDir: string, files: JavaSourceFile[]): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const filePath = path.join(rootDir, sanitizeJavaFileName(file.name));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content, "utf8");
    written.push(filePath);
  }
  return written;
}

function parseCheckstyleXml(xml: string, rootDir: string): CheckstyleViolation[] {
  const violations: CheckstyleViolation[] = [];
  const fileRegex = /<file\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/file>/g;
  const errorRegex = /<error\s+([^>]*)\/>/g;

  let fileMatch: RegExpExecArray | null;
  while ((fileMatch = fileRegex.exec(xml)) !== null) {
    const fileName = normalizeReportPath(unescapeXml(fileMatch[1]), rootDir);
    const fileBody = fileMatch[2];
    let errorMatch: RegExpExecArray | null;

    while ((errorMatch = errorRegex.exec(fileBody)) !== null) {
      const attrs = parseXmlAttributes(errorMatch[1]);
      violations.push({
        file: fileName,
        line: parseNullableInt(attrs.line),
        column: parseNullableInt(attrs.column),
        severity: attrs.severity ?? "error",
        message: unescapeXml(attrs.message ?? "Lỗi Checkstyle"),
        source: attrs.source ?? "",
      });
    }
  }

  return violations;
}

function parseXmlAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(source)) !== null) {
    attrs[match[1]] = unescapeXml(match[2]);
  }
  return attrs;
}

function inferJavaFileName(code: string): string {
  const publicClass = code.match(/\bpublic\s+(?:final\s+|abstract\s+)?(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/);
  const anyType = code.match(/\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/);
  return `${publicClass?.[1] ?? anyType?.[1] ?? "Main"}.java`;
}

function looksLikeJava(code: string): boolean {
  return /\b(class|interface|enum|record)\s+[A-Za-z_$][\w$]*/.test(code);
}

function sanitizeJavaFileName(fileName: string): string {
  const clean = fileName.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = clean.split("/").filter((part) => part && part !== "." && part !== "..");
  const safe = parts.join("/");
  return safe.endsWith(".java") ? safe : "Main.java";
}

function normalizeReportPath(filePath: string, rootDir: string): string {
  const relative = path.relative(rootDir, filePath);
  return relative && !relative.startsWith("..") ? relative : path.basename(filePath);
}

async function hasCommand(command: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(command, args, { timeout: 3_000 });
    return true;
  } catch (error: any) {
    return typeof error?.stderr === "string" && error.stderr.length > 0;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url: string, targetPath: string, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(targetPath);
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.rm(targetPath, { force: true })
          .then(() => downloadFile(response.headers.location as string, targetPath, timeoutMs))
          .then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.rm(targetPath, { force: true }).finally(() =>
          reject(new Error(`HTTP ${response.statusCode} khi tải Checkstyle.`))
        );
        return;
      }

      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });

    request.on("error", (error) => {
      file.close();
      fs.rm(targetPath, { force: true }).finally(() => reject(error));
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Hết thời gian tải tài nguyên Checkstyle."));
    });
  });
}

function parseNullableInt(value?: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function unavailable(feedback: string): CheckstyleEvaluation {
  return {
    status: "unavailable",
    score: null,
    violationCount: 0,
    violations: [],
    feedback,
    toolVersion: `checkstyle-${CHECKSTYLE_VERSION}`,
  };
}

export function buildStyleReport(evaluation: CheckstyleEvaluation): string {
  return JSON.stringify({
    provider: "checkstyle",
    status: evaluation.status,
    score: evaluation.score,
    violationCount: evaluation.violationCount,
    toolVersion: evaluation.toolVersion,
    violations: evaluation.violations,
  });
}

export function hashStyleReport(report: string): string {
  return crypto.createHash("sha256").update(report).digest("hex");
}
