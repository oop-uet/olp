import { describe, it, expect } from "vitest";
import { computeLeaderboard, type StudentInfo, type SubmissionData } from "./leaderboard.service.js";

describe("leaderboard.service", () => {
  describe("computeLeaderboard", () => {
    it("should return empty array for no students", () => {
      const result = computeLeaderboard([], []);
      expect(result).toEqual([]);
    });

    it("should return students with zero scores when no submissions", () => {
      const students: StudentInfo[] = [
        { userId: "u1", studentName: "Alice", studentExternalId: "21020001" },
        { userId: "u2", studentName: "Bob", studentExternalId: "21020002" },
      ];

      const result = computeLeaderboard(students, []);
      expect(result).toHaveLength(2);
      expect(result[0].totalScore).toBe(0);
      expect(result[1].totalScore).toBe(0);
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
      expect(result[0].completedExercises).toBe(0);
    });

    it("should rank by total score descending", () => {
      const students: StudentInfo[] = [
        { userId: "u1", studentName: "Alice", studentExternalId: "21020001" },
        { userId: "u2", studentName: "Bob", studentExternalId: "21020002" },
        { userId: "u3", studentName: "Charlie", studentExternalId: "21020003" },
      ];

      const submissions: SubmissionData[] = [
        { studentId: "u1", exerciseId: "e1", score: 50, submittedAt: "2024-06-10T10:00:00Z" },
        { studentId: "u2", exerciseId: "e1", score: 80, submittedAt: "2024-06-10T11:00:00Z" },
        { studentId: "u3", exerciseId: "e1", score: 70, submittedAt: "2024-06-10T12:00:00Z" },
      ];

      const result = computeLeaderboard(students, submissions);
      expect(result[0].studentName).toBe("Bob");
      expect(result[0].totalScore).toBe(80);
      expect(result[0].rank).toBe(1);
      expect(result[1].studentName).toBe("Charlie");
      expect(result[1].totalScore).toBe(70);
      expect(result[1].rank).toBe(2);
      expect(result[2].studentName).toBe("Alice");
      expect(result[2].totalScore).toBe(50);
      expect(result[2].rank).toBe(3);
    });

    it("should use highest score per exercise", () => {
      const students: StudentInfo[] = [
        { userId: "u1", studentName: "Alice", studentExternalId: "21020001" },
      ];

      const submissions: SubmissionData[] = [
        { studentId: "u1", exerciseId: "e1", score: 40, submittedAt: "2024-06-10T10:00:00Z" },
        { studentId: "u1", exerciseId: "e1", score: 80, submittedAt: "2024-06-10T11:00:00Z" },
        { studentId: "u1", exerciseId: "e1", score: 60, submittedAt: "2024-06-10T12:00:00Z" },
        { studentId: "u1", exerciseId: "e2", score: 100, submittedAt: "2024-06-10T13:00:00Z" },
      ];

      const result = computeLeaderboard(students, submissions);
      expect(result[0].totalScore).toBe(180); // 80 (highest for e1) + 100 (highest for e2)
    });

    it("should break ties by earliest latest-submission timestamp", () => {
      const students: StudentInfo[] = [
        { userId: "u1", studentName: "Alice", studentExternalId: "21020001" },
        { userId: "u2", studentName: "Bob", studentExternalId: "21020002" },
      ];

      const submissions: SubmissionData[] = [
        { studentId: "u1", exerciseId: "e1", score: 80, submittedAt: "2024-06-15T10:00:00Z" },
        { studentId: "u2", exerciseId: "e1", score: 80, submittedAt: "2024-06-14T10:00:00Z" },
      ];

      const result = computeLeaderboard(students, submissions);
      // Both have same score (80), Bob's latest submission is earlier
      expect(result[0].studentName).toBe("Bob");
      expect(result[0].rank).toBe(1);
      expect(result[1].studentName).toBe("Alice");
      expect(result[1].rank).toBe(2);
    });

    it("should count completed exercises (score > 0)", () => {
      const students: StudentInfo[] = [
        { userId: "u1", studentName: "Alice", studentExternalId: "21020001" },
      ];

      const submissions: SubmissionData[] = [
        { studentId: "u1", exerciseId: "e1", score: 80, submittedAt: "2024-06-10T10:00:00Z" },
        { studentId: "u1", exerciseId: "e2", score: 0, submittedAt: "2024-06-10T11:00:00Z" },
        { studentId: "u1", exerciseId: "e3", score: 50, submittedAt: "2024-06-10T12:00:00Z" },
      ];

      const result = computeLeaderboard(students, submissions);
      expect(result[0].completedExercises).toBe(2); // e1 and e3 have score > 0
    });

    it("should use studentExternalId for display and fallback to userId", () => {
      const students: StudentInfo[] = [
        { userId: "u1", studentName: "Alice", studentExternalId: "21020001" },
        { userId: "u2", studentName: "Bob", studentExternalId: null },
      ];

      const result = computeLeaderboard(students, []);
      expect(result[0].studentId).toBe("21020001");
      expect(result[1].studentId).toBe("u2");
    });

    it("should handle null scores as 0", () => {
      const students: StudentInfo[] = [
        { userId: "u1", studentName: "Alice", studentExternalId: "21020001" },
      ];

      const submissions: SubmissionData[] = [
        { studentId: "u1", exerciseId: "e1", score: null, submittedAt: "2024-06-10T10:00:00Z" },
        { studentId: "u1", exerciseId: "e2", score: 50, submittedAt: "2024-06-10T11:00:00Z" },
      ];

      const result = computeLeaderboard(students, submissions);
      expect(result[0].totalScore).toBe(50);
      expect(result[0].completedExercises).toBe(1); // only e2 has score > 0
    });

    it("should sum highest scores across multiple exercises", () => {
      const students: StudentInfo[] = [
        { userId: "u1", studentName: "Alice", studentExternalId: "21020001" },
        { userId: "u2", studentName: "Bob", studentExternalId: "21020002" },
      ];

      const submissions: SubmissionData[] = [
        { studentId: "u1", exerciseId: "e1", score: 90, submittedAt: "2024-06-10T10:00:00Z" },
        { studentId: "u1", exerciseId: "e2", score: 85, submittedAt: "2024-06-10T11:00:00Z" },
        { studentId: "u1", exerciseId: "e3", score: 70, submittedAt: "2024-06-10T12:00:00Z" },
        { studentId: "u2", exerciseId: "e1", score: 100, submittedAt: "2024-06-10T10:00:00Z" },
        { studentId: "u2", exerciseId: "e2", score: 100, submittedAt: "2024-06-10T11:00:00Z" },
      ];

      const result = computeLeaderboard(students, submissions);
      expect(result[0].studentName).toBe("Alice");
      expect(result[0].totalScore).toBe(245); // 90 + 85 + 70
      expect(result[1].studentName).toBe("Bob");
      expect(result[1].totalScore).toBe(200); // 100 + 100
    });

    it("should track latest submission timestamp correctly", () => {
      const students: StudentInfo[] = [
        { userId: "u1", studentName: "Alice", studentExternalId: "21020001" },
      ];

      const submissions: SubmissionData[] = [
        { studentId: "u1", exerciseId: "e1", score: 50, submittedAt: "2024-06-10T10:00:00Z" },
        { studentId: "u1", exerciseId: "e1", score: 80, submittedAt: "2024-06-15T10:30:00Z" },
        { studentId: "u1", exerciseId: "e2", score: 100, submittedAt: "2024-06-12T10:00:00Z" },
      ];

      const result = computeLeaderboard(students, submissions);
      expect(result[0].latestSubmission).toBe("2024-06-15T10:30:00Z");
    });

    it("should ignore submissions from non-enrolled students", () => {
      const students: StudentInfo[] = [
        { userId: "u1", studentName: "Alice", studentExternalId: "21020001" },
      ];

      const submissions: SubmissionData[] = [
        { studentId: "u1", exerciseId: "e1", score: 50, submittedAt: "2024-06-10T10:00:00Z" },
        { studentId: "u999", exerciseId: "e1", score: 100, submittedAt: "2024-06-10T10:00:00Z" },
      ];

      const result = computeLeaderboard(students, submissions);
      expect(result).toHaveLength(1);
      expect(result[0].totalScore).toBe(50);
    });
  });
});
