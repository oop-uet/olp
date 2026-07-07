import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const bundledJavaDir = path.join(backendRoot, ".java");
const bundledJava = path.join(bundledJavaDir, "bin", process.platform === "win32" ? "java.exe" : "java");
const requireJava = process.env.CHECKSTYLE_REQUIRE_JAVA === "1";

const CHECKSTYLE_VERSION = process.env.CHECKSTYLE_VERSION ?? "10.26.1";
const CHECKSTYLE_URL =
  process.env.CHECKSTYLE_DOWNLOAD_URL ??
  `https://github.com/checkstyle/checkstyle/releases/download/checkstyle-${CHECKSTYLE_VERSION}/checkstyle-${CHECKSTYLE_VERSION}-all.jar`;
const checkstyleCacheDir = path.join(backendRoot, ".cache");
const checkstyleJarPath = path.join(checkstyleCacheDir, `checkstyle-${CHECKSTYLE_VERSION}-all.jar`);

function hasJava(command) {
  const result = spawnSync(command, ["-version"], { stdio: "ignore" });
  return result.status === 0;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url, targetPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirectCount > 8) {
          reject(new Error("Too many redirects while downloading Java runtime."));
          return;
        }
        downloadFile(response.headers.location, targetPath, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} while downloading Java runtime.`));
        return;
      }

      const file = createWriteStream(targetPath);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });

    request.on("error", reject);
    request.setTimeout(120_000, () => {
      request.destroy(new Error("Timed out while downloading Java runtime."));
    });
  });
}

async function ensureCheckstyleJar() {
  if (await fileExists(checkstyleJarPath)) {
    console.log("[checkstyle] Checkstyle JAR is already available.");
    return;
  }
  try {
    console.log(`[checkstyle] Downloading Checkstyle JAR ${CHECKSTYLE_VERSION}...`);
    await fs.mkdir(checkstyleCacheDir, { recursive: true });
    await downloadFile(CHECKSTYLE_URL, checkstyleJarPath);
    console.log("[checkstyle] Checkstyle JAR prepared.");
  } catch (error) {
    console.warn(`[checkstyle] Failed to download Checkstyle JAR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function findJavaHome(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(rootDir, entry.name, "bin", "java");
    if (await fileExists(candidate)) return path.join(rootDir, entry.name);
  }
  return null;
}

async function installBundledJava() {
  if (process.platform !== "linux") {
    throw new Error(`Automatic Java runtime download is only enabled for Linux, got ${process.platform}.`);
  }

  const arch = os.arch() === "arm64" ? "aarch64" : "x64";
  const downloadUrl = `https://api.adoptium.net/v3/binary/latest/17/ga/linux/${arch}/jre/hotspot/normal/eclipse?project=jdk`;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "oop-java-"));
  const archivePath = path.join(tempDir, "jre.tar.gz");

  await fs.rm(bundledJavaDir, { recursive: true, force: true });
  await downloadFile(downloadUrl, archivePath);

  const extractResult = spawnSync("tar", ["-xzf", archivePath, "-C", tempDir], { stdio: "inherit" });
  if (extractResult.status !== 0) {
    throw new Error("Cannot extract downloaded Java runtime.");
  }

  const javaHome = await findJavaHome(tempDir);
  if (!javaHome) {
    throw new Error("Downloaded Java runtime does not contain bin/java.");
  }

  await fs.rename(javaHome, bundledJavaDir);
  await fs.chmod(bundledJava, 0o755).catch(() => undefined);
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
}

async function main() {
  await ensureCheckstyleJar();

  if (process.env.CHECKSTYLE_SKIP_JRE_DOWNLOAD === "1") return;

  if (process.env.CHECKSTYLE_JAVA_BIN && hasJava(process.env.CHECKSTYLE_JAVA_BIN)) {
    console.log("[java] Using CHECKSTYLE_JAVA_BIN.");
    return;
  }

  if (process.env.JAVA_HOME) {
    const javaFromHome = path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java");
    if (hasJava(javaFromHome)) {
      console.log("[java] Using JAVA_HOME.");
      return;
    }
  }

  if (hasJava("java")) {
    console.log("[java] System Java is available.");
    return;
  }

  if (await fileExists(bundledJava)) {
    console.log("[java] Bundled Java runtime is available.");
    return;
  }

  try {
    console.log("[java] System Java not found. Downloading Eclipse Temurin JRE 17 for Checkstyle...");
    await installBundledJava();
    console.log("[java] Bundled Java runtime installed.");
  } catch (error) {
    console.warn(`[java] ${error instanceof Error ? error.message : String(error)}`);
    if (requireJava) process.exit(1);
  }
}

main();
