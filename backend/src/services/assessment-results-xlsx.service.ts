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

function reviewStatusLabel(row: SubmissionExportRow): string {
  if (row.reviewStatus === "official") return "Điểm chính thức";
  if (row.reviewStatus === "pending_review") return "Chờ GV duyệt";
  if (row.reviewStatus === "ai_queued") return "AI đang xếp hàng";
  if (row.reviewStatus === "ai_running") return "AI đang chấm";
  if (row.status === "in_progress") return "Đang làm bài";
  if (row.status === "voided") return "Bị huỷ";
  return "Đã nộp";
}

function fmtDate(isoStr: string | null): string {
  if (!isoStr) return "";
  return new Date(isoStr).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
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
  const { submissions } = input;

  // ── Merge header rows ────────────────────────────────────────────────────
  const LAST_COL = 9;

  // Row 1: Title
  sheet.mergeCells(1, 1, 1, LAST_COL);
  const titleCell = sheet.getCell("A1");
  titleCell.value = `Kết quả kiểm tra: ${input.assessment.title}`;
  titleCell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  // Row 2: Metadata
  sheet.mergeCells(2, 1, 2, LAST_COL);
  const metaCell = sheet.getCell("A2");
  metaCell.value =
    `Tổng điểm: ${total} · Thời gian: ${fmtDate(input.assignment.opensAt)} – ${fmtDate(input.assignment.closesAt)} · Xuất lúc: ${fmtDate(new Date().toISOString())}`;
  metaCell.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  metaCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(2).height = 18;

  // Row 3: Column headers
  const headers = [
    "MSSV",
    "Họ và tên",
    "Email",
    "Lượt làm",
    "Thời điểm nộp",
    `Điểm tự động /${total}`,
    `Điểm dự kiến /${total}`,
    `Điểm chính thức /${total}`,
    "Trạng thái",
  ];
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

  // ── Column widths ────────────────────────────────────────────────────────
  sheet.getColumn(1).width = 14; // MSSV
  sheet.getColumn(2).width = 26; // Họ tên
  sheet.getColumn(3).width = 28; // Email
  sheet.getColumn(4).width = 10; // Lượt làm
  sheet.getColumn(5).width = 20; // Thời điểm nộp
  sheet.getColumn(6).width = 16; // Điểm tự động
  sheet.getColumn(7).width = 16; // Điểm dự kiến
  sheet.getColumn(8).width = 18; // Điểm chính thức
  sheet.getColumn(9).width = 18; // Trạng thái

  // ── Data rows ────────────────────────────────────────────────────────────
  submissions.forEach((sub, idx) => {
    const rowNum = idx + 4;
    const row = sheet.getRow(rowNum);
    row.height = 20;

    const isOdd = idx % 2 === 0;
    const bgArgb = isOdd ? "FFFFFFFF" : "FFF0FDFA";

    const values = [
      sub.student.username,
      sub.student.fullName || sub.student.username,
      sub.student.email,
      sub.attemptNumber,
      fmtDate(sub.submittedAt),
      sub.autoScore ?? "",
      sub.predictedScore ?? "",
      sub.officialScore ?? "",
      reviewStatusLabel(sub),
    ];

    values.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = val as ExcelJS.CellValue;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
      cell.alignment = {
        vertical: "middle",
        horizontal: colIdx >= 3 && colIdx <= 7 ? "center" : "left",
      };
      cell.font = { size: 10 };
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
        right: { style: "hair", color: { argb: "FFE2E8F0" } },
      };

      // Score columns: bold & colored
      if (colIdx === 5 && sub.autoScore !== null && sub.autoScore !== undefined) {
        cell.font = { bold: true, size: 10, color: { argb: "FF1E40AF" } };
      }
      if (colIdx === 6 && sub.predictedScore !== null && sub.predictedScore !== undefined) {
        cell.font = { bold: true, size: 10, color: { argb: "FF0D766E" } };
      }
      if (colIdx === 7 && sub.officialScore !== null && sub.officialScore !== undefined) {
        cell.font = { bold: true, size: 10, color: { argb: "FF166534" } };
      }

      // Status badge colors
      if (colIdx === 8) {
        const status = reviewStatusLabel(sub);
        if (status === "Điểm chính thức") {
          cell.font = { bold: true, size: 10, color: { argb: "FF166534" } };
        } else if (status === "Chờ GV duyệt") {
          cell.font = { bold: true, size: 10, color: { argb: "FF92400E" } };
        } else if (status.includes("AI")) {
          cell.font = { bold: true, size: 10, color: { argb: "FF1E40AF" } };
        }
      }
    });

    // Integrity warning: highlight entire row in amber if events > 0
    if ((sub.integrityEventCount ?? 0) > 0) {
      for (let c = 1; c <= LAST_COL; c++) {
        const cell = row.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
      }
      // Mark MSSV cell with note
      row.getCell(1).font = { bold: true, size: 10, color: { argb: "FF92400E" } };
      row.getCell(1).note = `⚠ ${sub.integrityEventCount} cảnh báo vi phạm giám sát`;
    }
  });

  // ── Summary row ──────────────────────────────────────────────────────────
  if (submissions.length > 0) {
    const summaryRowNum = submissions.length + 4;
    const summaryRow = sheet.getRow(summaryRowNum);
    summaryRow.height = 24;

    sheet.mergeCells(summaryRowNum, 1, summaryRowNum, 5);
    const labelCell = summaryRow.getCell(1);
    labelCell.value = `Tổng cộng: ${submissions.length} bài nộp`;
    labelCell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    labelCell.alignment = { horizontal: "center", vertical: "middle" };

    // Average formulas for score columns (cols 6, 7, 8)
    const dataStart = 4;
    const dataEnd = summaryRowNum - 1;
    [6, 7, 8].forEach((col) => {
      const cell = summaryRow.getCell(col);
      const colL = colLetter(col);
      cell.value = {
        formula: `IFERROR(AVERAGEIF(${colL}${dataStart}:${colL}${dataEnd},"<>"&""),"-")`,
      };
      cell.numFmt = "0.00";
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    summaryRow.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  }

  // ── Auto filter on header row ────────────────────────────────────────────
  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: LAST_COL },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
