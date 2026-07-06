import { describe, expect, it } from "vitest";
import {
  getSemesterCompactPrefix,
  normalizeSectionNameForSemester,
  stripSemesterCompactPrefix,
} from "./semester.js";

describe("semester utilities", () => {
  it("builds compact prefixes from canonical semester ids", () => {
    expect(getSemesterCompactPrefix("2025-2026-HK1")).toBe("I2526");
    expect(getSemesterCompactPrefix("2025-2026-HK2")).toBe("II2526");
    expect(getSemesterCompactPrefix("2025-2026-HK3")).toBe("III2526");
  });

  it("builds compact prefixes from readable Vietnamese semester names", () => {
    expect(getSemesterCompactPrefix("Học kỳ II năm học 2025-2026")).toBe("II2526");
    expect(getSemesterCompactPrefix("Học kỳ 2 năm học 2025-2026")).toBe("II2526");
    expect(getSemesterCompactPrefix("Học kỳ 1 2026-2027")).toBe("I2627");
  });

  it("normalizes section names with the semester prefix exactly once", () => {
    expect(normalizeSectionNameForSemester("INT2204 80", "2025-2026-HK2")).toBe(
      "II2526 INT2204 80"
    );
    expect(normalizeSectionNameForSemester("II2526 INT2204 80", "2025-2026-HK2")).toBe(
      "II2526 INT2204 80"
    );
  });

  it("replaces an old semester prefix when a section moves semesters", () => {
    expect(normalizeSectionNameForSemester("I2526 INT2204 80", "2025-2026-HK2")).toBe(
      "II2526 INT2204 80"
    );
  });

  it("strips existing compact prefixes from names", () => {
    expect(stripSemesterCompactPrefix("III2526 INT2204 80")).toBe("INT2204 80");
  });
});
