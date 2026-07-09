import { describe, it, expect } from "vitest";
import {
  applyStylePolicyToEvaluation,
  applyStylePolicyToViolations,
  extractJavaFiles,
  isValidCheckstyleReport,
  normalizeStylePolicy,
} from "./checkstyle.service.js";

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

describe("Checkstyle Service - style rule policy", () => {
  it("should classify and filter concrete indentation child rules", () => {
    const violations = applyStylePolicyToViolations(
      [
        {
          file: "Main.java",
          line: 7,
          column: 9,
          severity: "error",
          message: "'method def' child has incorrect indentation level 8, expected level should be 4.",
          source: "com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck",
        },
        {
          file: "Main.java",
          line: 14,
          column: 1,
          severity: "error",
          message: "Line is longer than 100 characters.",
          source: "com.puppycrawl.tools.checkstyle.checks.sizes.LineLengthCheck",
        },
      ],
      { disabledRules: ["indentation.method_def_child"] }
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("line_length");
  });

  it("should recompute score after disabled rules are filtered out", () => {
    const evaluation = applyStylePolicyToEvaluation(
      {
        status: "failed",
        score: 0,
        violationCount: 2,
        violations: [
          {
            file: "Main.java",
            line: 4,
            column: 5,
            severity: "error",
            message: "'method def modifier' has incorrect indentation level 4, expected level should be 2.",
            source: "com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck",
          },
          {
            file: "Main.java",
            line: 7,
            column: 9,
            severity: "error",
            message: "'method def' child has incorrect indentation level 8, expected level should be 4.",
            source: "com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck",
          },
        ],
        feedback: null,
        toolVersion: "checkstyle-test",
      },
      { disabledRules: ["indentation.method_def_child"] },
      { penaltyPerViolation: 5, maxViolations: 20 }
    );

    expect(evaluation.violationCount).toBe(1);
    expect(evaluation.score).toBe(95);
    expect(evaluation.violations[0].ruleId).toBe("indentation.method_def_modifier");
  });

  it("should deduplicate equivalent whitespace reports at the same location", () => {
    const violations = applyStylePolicyToViolations(
      [
        {
          file: "CartItem.java",
          line: 18,
          column: 9,
          severity: "error",
          message: "'if' is not followed by whitespace.",
          source: "com.puppycrawl.tools.checkstyle.checks.whitespace.WhitespaceAfterCheck",
        },
        {
          file: "CartItem.java",
          line: 18,
          column: 9,
          severity: "error",
          message: "WhitespaceAround: 'if' is not followed by whitespace. Empty blocks may only be represented as {} when not part of a multi-block statement (4.1.3)",
          source: "com.puppycrawl.tools.checkstyle.checks.whitespace.WhitespaceAroundCheck",
        },
        {
          file: "CartItem.java",
          line: 18,
          column: 11,
          severity: "error",
          message: "'(' is followed by whitespace.",
          source: "com.puppycrawl.tools.checkstyle.checks.whitespace.ParenPadCheck",
        },
      ]
    );

    expect(violations).toHaveLength(2);
    expect(violations.map((violation) => violation.message)).toEqual([
      "'if' is not followed by whitespace.",
      "'(' is followed by whitespace.",
    ]);
  });

  it("should use the UET basic default policy when no policy is provided", () => {
    const policy = normalizeStylePolicy();
    expect(policy.disabledRules).toContain("javadoc");
    expect(policy.disabledRules).toContain("line_length");
  });
});
