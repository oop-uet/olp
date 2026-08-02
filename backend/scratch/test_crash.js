import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), "oop-checkstyle-crash-"));
  const reportPath = path.join(workingDir, "checkstyle-report.xml");
  const filePath = path.join(workingDir, "Main.java");
  await fs.writeFile(filePath, "public class Main {}", "utf8");

  const jarPath = path.join(os.homedir(), ".cache", "oop-uet", "checkstyle-10.26.1-all.jar");
  const args = [
    "-jar",
    jarPath,
    "-c",
    "/nonexistent_checks.xml", // Invalid config
    "-f",
    "xml",
    "-o",
    reportPath,
    filePath
  ];

  console.log("Running checkstyle with invalid config...");
  try {
    await execFileAsync("java", args);
    console.log("Exit code 0");
  } catch (err) {
    console.log("Exit code non-zero, error message:", err.message);
  }

  const exists = await fs.access(reportPath).then(() => true).catch(() => false);
  console.log("Does reportPath exist?", exists);
  if (exists) {
    const content = await fs.readFile(reportPath, "utf8");
    console.log("Report file content size:", content.length);
    console.log("Report file content:\n", content);
  }

  await fs.rm(workingDir, { recursive: true, force: true });
}

main();
