import ExcelJS from "exceljs";

export interface SubmissionExportRow {
  attemptNumber: number;
  status: string;
  reviewStatus: string;
  startedAt: string;
  submittedAt: string | null;
  autoScore: number;
  predictedScore: number | null;
  officialScore: number | null;
  integrityEventCount: number;
  student: {
    username: string;
    fullName?: string | null;
    email: string;
  };
}

export interface SubmissionExportInput {
  assessment: { title: string; totalPoints: number };
  assignment: { opensAt: string; closesAt: string };
  submissions: SubmissionExportRow[];
}

/** Chọn điểm tốt nhất trong một lần làm: ưu tiên điểm chính thức > dự kiến > tự động */
function bestScore(row: SubmissionExportRow): number | null {
  if (row.officialScore !== null && row.officialScore !== undefined) return row.officialScore;
  if (row.predictedScore !== null && row.predictedScore !== undefined) return row.predictedScore;
  if (row.autoScore !== null && row.autoScore !== undefined) return row.autoScore;
  return null;
}

interface StudentBest {
  username: string;
  fullName: string;
  score: number | null;
}

/** Group theo sinh viên, giữ điểm cao nhất trong tất cả các lần làm */
function groupByStudentBest(submissions: SubmissionExportRow[]): StudentBest[] {
  const map = new Map<string, StudentBest>();

  for (const sub of submissions) {
    const key = sub.student.username;
    const score = bestScore(sub);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        username: sub.student.username,
        fullName: sub.student.fullName || sub.student.username,
        score,
      });
    } else {
      // Lấy điểm cao hơn
      if (score !== null && (existing.score === null || score > existing.score)) {
        existing.score = score;
      }
    }
  }

  // Sắp xếp theo MSSV (giống thứ tự server trả về: username asc)
  return Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username));
}

function fmtDate(isoStr: string | null): string {
  if (!isoStr) return "";
  return new Date(isoStr).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

export async function createAssessmentResultsXlsx(
  input: SubmissionExportInput
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UET OLP";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Kết quả", {
    properties: { tabColor: { argb: "FF0F766E" } },
    views: [{ state: "frozen", ySplit: 3, xSplit: 0 }],
  });

  const total = input.assessment.totalPoints;
  const students = groupByStudentBest(input.submissions);
  const LAST_COL = 4;

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  sheet.mergeCells(1, 1, 1, LAST_COL);
  const titleCell = sheet.getCell("A1");
  titleCell.value = `Kết quả kiểm tra: ${input.assessment.title}`;
  titleCell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  // ── Row 2: Metadata ───────────────────────────────────────────────────────
  sheet.mergeCells(2, 1, 2, LAST_COL);
  const metaCell = sheet.getCell("A2");
  metaCell.value =
    `Tổng điểm: ${total} · Thời gian: ${fmtDate(input.assignment.opensAt)} – ${fmtDate(input.assignment.closesAt)} · Xuất lúc: ${fmtDate(new Date().toISOString())}`;
  metaCell.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  metaCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(2).height = 18;

  // ── Row 3: Column headers ─────────────────────────────────────────────────
  const headers = ["STT", "MSSV", "Họ và tên", `Điểm /${total}`];
  const headerRow = sheet.getRow(3);
  headerRow.height = 32;
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF0D9488" } },
      right: { style: "thin", color: { argb: "FF134E4A" } },
    };
  });

  // ── Column widths ─────────────────────────────────────────────────────────
  sheet.getColumn(1).width = 7;  // STT
  sheet.getColumn(2).width = 14; // MSSV
  sheet.getColumn(3).width = 30; // Họ và tên
  sheet.getColumn(4).width = 14; // Điểm

  // ── Data rows ─────────────────────────────────────────────────────────────
  students.forEach((stu, idx) => {
    const rowNum = idx + 4;
    const row = sheet.getRow(rowNum);
    row.height = 20;

    const isOdd = idx % 2 === 0;
    const bgArgb = isOdd ? "FFFFFFFF" : "FFF0FDFA";

    const values: (string | number | null)[] = [
      idx + 1,
      stu.username,
      stu.fullName,
      stu.score,
    ];

    values.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = val as ExcelJS.CellValue;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
      cell.alignment = {
        vertical: "middle",
        horizontal: colIdx === 0 || colIdx === 3 ? "center" : "left",
      };
      cell.font = { size: 10 };
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
        right: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
    });

    // Cột Điểm: in đậm, màu xanh lá
    const scoreCell = row.getCell(4);
    if (stu.score !== null) {
      scoreCell.font = { bold: true, size: 10, color: { argb: "FF166534" } };
    } else {
      scoreCell.value = "—";
      scoreCell.font = { size: 10, color: { argb: "FF94A3B8" } };
      scoreCell.alignment = { vertical: "middle", horizontal: "center" };
    }
  });

  // ── Summary row ───────────────────────────────────────────────────────────
  if (students.length > 0) {
    const summaryRowNum = students.length + 4;
    const summaryRow = sheet.getRow(summaryRowNum);
    summaryRow.height = 24;

    sheet.mergeCells(summaryRowNum, 1, summaryRowNum, 3);
    const labelCell = summaryRow.getCell(1);
    labelCell.value = `Tổng: ${students.length} sinh viên`;
    labelCell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    labelCell.alignment = { horizontal: "center", vertical: "middle" };

    // Trung bình điểm
    const dataStart = 4;
    const dataEnd = summaryRowNum - 1;
    const avgCell = summaryRow.getCell(4);
    avgCell.value = {
      formula: `IFERROR(AVERAGEIF(D${dataStart}:D${dataEnd},"<>"&""),"—")`,
    };
    avgCell.numFmt = "0.00";
    avgCell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    avgCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    avgCell.alignment = { horizontal: "center", vertical: "middle" };
  }

  // ── Auto filter ───────────────────────────────────────────────────────────
  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: LAST_COL },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
