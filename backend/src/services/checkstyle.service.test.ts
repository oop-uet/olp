import { describe, it, expect } from "vitest";
import { isValidCheckstyleReport, extractJavaFiles } from "./checkstyle.service.js";

describe("Checkstyle Service - XML report validation", () => {
  it("should invalidate empty reports", () => {
    expect(isValidCheckstyleReport("")).toBe(false);
    expect(isValidCheckstyleReport("   ")).toBe(false);
  });

  it("should invalidate reports missing checkstyle tags", () => {
    expect(isValidCheckstyleReport("<xml>hello</xml>")).toBe(false);
  });

  it("should invalidate reports with exceptions", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<checkstyle version="10.26.1">
<exception>
<stackTrace>java.lang.NullPointerException</stackTrace>
</exception>
</checkstyle>`;
    expect(isValidCheckstyleReport(xml)).toBe(false);
  });

  it("should validate correct reports with zero violations", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<checkstyle version="10.26.1">
</checkstyle>`;
    expect(isValidCheckstyleReport(xml)).toBe(true);
  });

  it("should validate correct reports with violations", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<checkstyle version="10.26.1">
<file name="Main.java">
<error line="1" column="5" severity="warning" message="test message" source="test.source"/>
</file>
</checkstyle>`;
    expect(isValidCheckstyleReport(xml)).toBe(true);
  });
});

describe("Checkstyle Service - extractJavaFiles", () => {
  it("should extract files from structured JSON code", () => {
    const payload = JSON.stringify({
      format: "oop-java-files",
      files: [
        { name: "Main.java", content: "public class Main {}" },
        { name: "Helper.java", content: "public class Helper {}" },
        { name: "Readme.txt", content: "some text" }
      ]
    });
    const result = extractJavaFiles(payload);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Main.java");
    expect(result[0].content).toBe("public class Main {}");
    expect(result[1].name).toBe("Helper.java");
  });

  it("should fallback to single file extraction for raw java source", () => {
    const code = "public class Main { public static void main(String[] args) {} }";
    const result = extractJavaFiles(code);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Main.java");
    expect(result[0].content).toBe(code);
  });

  it("should return empty list if code does not look like java", () => {
    const code = "print('hello world')";
    const result = extractJavaFiles(code);
    expect(result).toHaveLength(0);
  });
});
