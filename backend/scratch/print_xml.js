import { db } from "../src/db/index.ts";
import { submissions } from "../src/db/schema.ts";
import { evaluateCheckstyle } from "../src/services/checkstyle.service.ts";
import { desc } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  try {
    const results = await db
      .select()
      .from(submissions)
      .orderBy(desc(submissions.submittedAt))
      .limit(1);

    if (results.length === 0) {
      console.log("No submissions found.");
      return;
    }

    const sub = results[0];
    console.log("Submission ID:", sub.id);
    console.log("Code:\n", sub.code);

    const workingDir = await fs.mkdtemp(path.join(os.tmpdir(), "oop-checkstyle-test-"));
    const filePath = path.join(workingDir, "Main.java");
    await fs.writeFile(filePath, sub.code, "utf8");
    const reportPath = path.join(workingDir, "checkstyle-report.xml");

    // Run checkstyle command
    const jarPath = path.join(os.homedir(), ".cache", "oop-uet", "checkstyle-10.26.1-all.jar");
    const args = [
      "-jar",
      jarPath,
      "-c",
      "/google_checks.xml",
      "-f",
      "xml",
      "-o",
      reportPath,
      filePath
    ];

    console.log("Running command: java", args.join(" "));
    try {
      await execFileAsync("java", args);
      console.log("Command finished with exit code 0");
    } catch (err) {
      console.log("Command failed (non-zero or error):", err.message);
    }

    if (await fs.access(reportPath).then(() => true).catch(() => false)) {
      const xml = await fs.readFile(reportPath, "utf8");
      console.log("XML REPORT CONTENT:\n", xml);
    } else {
      console.log("XML report file does not exist.");
    }

    await fs.rm(workingDir, { recursive: true, force: true });
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
