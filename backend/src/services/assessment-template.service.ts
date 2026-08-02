import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import type {
  AssessmentDraftInput,
  AssessmentGradingMode,
  AssessmentQuestionInput,
  AssessmentQuestionType,
} from "./assessment.service.js";

const SOURCE_PDF = "Giữa kỳ-2020-2021-UET.pdf";

type TemplateQuestion = AssessmentQuestionInput & { key: string };

interface TemplateSection {
  key: string;
  title: string;
  introContent?: string;
  questions: TemplateQuestion[];
}

interface TemplateDraft extends Omit<AssessmentDraftInput, "sections"> {
  sections: TemplateSection[];
}

export interface AssessmentTemplateImportResult {
  draft: AssessmentDraftInput;
  warnings: string[];
}

export class AssessmentTemplateImportError extends Error {
  constructor(public readonly details: string[]) {
    super("Template bài kiểm tra không hợp lệ.");
  }
}

const trueFalsePrompts = [
  "Giao diện (interface) phải khai báo ít nhất một phương thức.",
  "Một lớp luôn có thể tạo ra lớp con kế thừa (extends) nó.",
  "Một lớp luôn luôn phải định nghĩa phương thức trong interface mà lớp đó cài đặt.",
  "Nếu lớp A không định nghĩa bất cứ phương thức khởi tạo nào, A sẽ được trình biên dịch cung cấp phương thức khởi tạo mặc định.",
  "Nếu người lập trình không cung cấp phương thức khởi tạo không tham số, trình biên dịch sẽ tự động thêm phương thức này.",
  "Phương thức khởi tạo không thể được khai báo với từ khóa private.",
  "Một giao diện (interface) có thể được kế thừa (extends) bởi các giao diện khác.",
  "Nếu lớp A cài đặt giao diện IFace nhưng không cài đặt hết các phương thức của IFace, A sẽ được xem là lớp trừu tượng.",
  "Trong Java, một lớp có thể có nhiều lớp cha và nhiều lớp con.",
  "Phạm vi truy cập của phương thức được định nghĩa lại phải hẹp hơn phạm vi truy cập của lớp cơ sở.",
  "Giao diện (interface) có thể dùng để khai báo kiểu dữ liệu cho hàm có tham số (ví dụ khai báo tham số cho một hàm là IFace f, với IFace là một giao diện).",
  "Các phương thức trong giao diện (interface) có thể được khai báo private.",
  "Một lớp là trừu tượng thì bắt buộc phải chứa phương thức trừu tượng.",
  "Phương thức khởi tạo được kế thừa ở lớp dẫn xuất.",
  "Phương thức luôn có thể định nghĩa lại (overriding) ở lớp dẫn xuất.",
  "Phương thức của đối tượng (instance method) có thể được gọi không cần có tham chiếu từ phương thức của lớp (phương thức tĩnh static).",
  "Không thể dùng từ khóa “this” để truy cập thuộc tính tĩnh (static) trong cùng một lớp.",
  "Quan hệ “has-a” được cài đặt bằng cơ chế kế thừa.",
  "Java luôn luôn thực hiện cơ chế liên kết động (dynamic binding).",
  "Khi tham số của phương thức là một tham chiếu đến đối tượng, giá trị (nội dung) của đối tượng đó không thay đổi được.",
  "Phương thức tĩnh (static) không được khai báo là private.",
  "Tính đa hình của hướng đối tượng (polymorphism) chỉ xảy ra trong phạm vi có quan hệ kế thừa (inheritance) giữa các lớp.",
  "Phương thức trong lớp trừu tượng sẽ không có định nghĩa.",
  "Từ khóa “this” không được sử dụng trong phương thức tĩnh (static).",
  "Từ khóa “super” không cho phép gọi phương thức tĩnh (static) ở lớp cha.",
];

const codeIntro = `abstract class Person {
    String name;
    public void Person(String s_name) {
        name = s_name;
    }
    public void introduce() {
        System.out.println("My name is +"name);
    }
}

public class Employee extends Person {
    String id;
    public Employee(String sid) {
        name = "";
        id = sid;
    }
    Public Employee(String n, String sid) {
        id = sid;
        super(n);
    }
}

public class Manager extends Employee {
    String name; // Lưu ý: giữ nguyên khai báo này
    double allowance;
    public Manager(String n, double a) {
        name = n;
        allowance = a;
    }
}

public class Test {
    public static void main(String[] arg) {
        Person p = new Employee();
        p.introduce();
    }
}`;

function sampleDraft(): TemplateDraft {
  return {
    title: "Kiểm tra giữa kỳ Lập trình hướng đối tượng 2020-2021",
    instructions: "Thời gian làm bài 90 phút. Không được sử dụng tài liệu.",
    durationMinutes: 90,
    totalPoints: 10,
    sections: [
      {
        key: "C1",
        title: "Câu 1 - Đúng/Sai (5 điểm)",
        questions: trueFalsePrompts.map((prompt, index) => ({
          key: `C1.${index + 1}`,
          type: "true_false",
          prompt,
          points: 0.2,
          gradingMode: "auto",
        })),
      },
      {
        key: "C2",
        title: "Câu 2 - Tự luận (1,5 điểm)",
        questions: [
          {
            key: "C2.a",
            type: "essay",
            prompt: "Thuộc tính private có được kế thừa trong lớp con hay không? Cho thí dụ và giải thích.",
            points: 0.75,
            gradingMode: "llm_assisted",
            referenceAnswer:
              "Đối tượng lớp con vẫn chứa trạng thái private của lớp cha nhưng lớp con không truy cập trực tiếp bằng tên; cần dùng constructor hoặc phương thức public/protected của lớp cha. Ví dụ minh họa Java hợp lệ.",
            gradingPrompt:
              "Chấp nhận cách diễn đạt 'được kế thừa về trạng thái nhưng không truy cập trực tiếp' hoặc cách giải thích tương đương nếu ví dụ Java đúng.",
            rubric: [
              { id: "concept", criterion: "Giải thích đúng phạm vi private và quan hệ với lớp con", points: 0.5 },
              { id: "example", criterion: "Có ví dụ Java phù hợp và giải thích rõ", points: 0.25 },
            ],
          },
          {
            key: "C2.b",
            type: "essay",
            prompt:
              "Cơ chế Up casting và Down casting là như thế nào, cho thí dụ minh họa? Khi nào không thể Down casting đối tượng được?",
            points: 0.75,
            gradingMode: "llm_assisted",
            referenceAnswer:
              "Upcasting chuyển tham chiếu lớp con sang kiểu cha và an toàn/không cần ép tường minh. Downcasting chuyển tham chiếu kiểu cha về kiểu con, cần ép kiểu; chỉ hợp lệ khi đối tượng thực tế là instance của lớp con tương ứng, nếu không sẽ phát sinh ClassCastException. Nên kiểm tra instanceof.",
            gradingPrompt: "Chấm theo bản chất kiểu tham chiếu và kiểu đối tượng; chấp nhận ví dụ Java tương đương.",
            rubric: [
              { id: "upcast", criterion: "Giải thích và minh họa đúng Up casting", points: 0.25 },
              { id: "downcast", criterion: "Giải thích và minh họa đúng Down casting", points: 0.25 },
              { id: "invalid", criterion: "Nêu đúng điều kiện ép kiểu không hợp lệ/ClassCastException", points: 0.25 },
            ],
          },
        ],
      },
      {
        key: "C3",
        title: "Câu 3 - Một lựa chọn (2 điểm)",
        questions: [
          {
            key: "C3.1",
            type: "single_choice",
            prompt:
              "Lớp B kế thừa từ lớp A. Tham chiếu đối tượng “a” trong hai câu lệnh (i) A a = new B() và (ii) A a = (A) new B() có gì khác nhau hay không?",
            points: 0.4,
            gradingMode: "auto",
            options: [
              "Khác nhau. Tham chiếu “a” của (i) có hành vi hoàn toàn của lớp A, trong khi của (ii) có hành vi của lớp B.",
              "Khác nhau. Tham chiếu “a” của (i) có mọi hành vi trong lớp B, trong khi của (ii) chỉ có hành vi trong A.",
              "Hoàn toàn giống nhau.",
            ],
          },
          {
            key: "C3.2",
            type: "single_choice",
            prompt: "Từ khóa super được sử dụng để:",
            points: 0.4,
            gradingMode: "auto",
            options: [
              "Gọi các phương thức khởi tạo và các phương thức khác của lớp cha nhưng câu lệnh super phải được thực hiện đầu tiên.",
              "Gọi các phương thức của lớp cha và các lớp cơ sở khác của một lớp.",
              "Gọi phương thức khởi tạo và các phương thức khác của lớp cha.",
              "Gọi phương thức khởi tạo và các phương thức không phải private của lớp cha.",
            ],
          },
          {
            key: "C3.3",
            type: "single_choice",
            prompt: "Khi tham số của phương thức là một tham chiếu đến đối tượng:",
            points: 0.4,
            gradingMode: "auto",
            options: [
              "Không thể thay đổi các giá trị của đối tượng đó.",
              "Chỉ thay đổi được các giá trị của đối tượng khi có các giao diện cho phép cập nhật các thuộc tính của đối tượng.",
            ],
          },
          {
            key: "C3.4",
            type: "single_choice",
            prompt: "Chọn phát biểu đúng nhất về phương thức static:",
            points: 0.4,
            gradingMode: "auto",
            options: [
              "Phương thức static phải khai báo là public.",
              "Phương thức static không được khai báo là private.",
              "Phạm vi truy cập của phương thức static khai báo giống như những phương thức không phải static (non-static).",
            ],
          },
          {
            key: "C3.5",
            type: "single_choice",
            prompt: "Lớp B kế thừa từ lớp A. Câu lệnh A a = new B() cho kết quả:",
            points: 0.4,
            gradingMode: "auto",
            options: [
              "Tham chiếu “a” có mọi hành vi của lớp B.",
              "Tham chiếu “a” có hành vi của lớp B với các phương thức mà B kế thừa từ A.",
              "Tham chiếu “a” có hành vi của lớp A.",
            ],
          },
        ],
      },
      {
        key: "C4",
        title: "Câu 4 - Đọc và sửa mã Java (1,5 điểm)",
        introContent: codeIntro,
        questions: [
          {
            key: "C4.a",
            type: "code_analysis",
            prompt: "Câu lệnh nào trong đoạn mã báo lỗi? Hãy sửa lỗi chương trình nếu có.",
            points: 1,
            gradingMode: "llm_assisted",
            referenceAnswer:
              "Cần nhận ra lỗi cú pháp ở câu println và từ khóa Public; Person(String) đang viết thành phương thức void thay vì constructor; lời gọi super(n) vừa không ở câu lệnh đầu tiên vừa chưa gọi được constructor cha phù hợp; Manager ngầm gọi super() nhưng Employee không có constructor không tham số; new Employee() trong Test cũng không hợp lệ. Chấp nhận nhiều phương án sửa nếu biên dịch được và giữ ý nghĩa đề.",
            gradingPrompt:
              "Đối chiếu tính hợp lệ khi biên dịch Java. Chấp nhận phương án thêm constructor hoặc sửa lời gọi super tương đương; không bắt buộc giống hệt đáp án mẫu.",
            rubric: [
              { id: "syntax", criterion: "Phát hiện và sửa lỗi câu println cùng từ khóa Public", points: 0.25 },
              { id: "person-super", criterion: "Sửa constructor Person và lời gọi super(n) hợp lệ", points: 0.25 },
              { id: "constructor-chain", criterion: "Sửa chuỗi constructor Employee/Manager hợp lệ", points: 0.25 },
              { id: "test-instantiation", criterion: "Sửa new Employee() hoặc bổ sung constructor phù hợp", points: 0.25 },
            ],
          },
          {
            key: "C4.b",
            type: "short_text",
            prompt:
              "Sau khi sửa lỗi phần a, các câu lệnh sau in ra màn hình kết quả như thế nào?\nEmployee m1 = new Employee(\"Tery\", \"cn2246\");\nm1.introduce();\nManager m2 = new Manager(\"John\", 0.5);\nm2.introduce();",
            points: 0.5,
            gradingMode: "llm_assisted",
            referenceAnswer:
              "Kết quả phụ thuộc phương án sửa hợp lệ ở phần a; với chuỗi constructor gán Person.name từ n và giữ trường Manager.name che khuất, m1 in 'My name is Tery', còn m2 có thể in giá trị Person.name được thiết lập qua constructor cha. GV cần điều chỉnh đáp án theo phương án sửa đã chọn.",
            gradingPrompt:
              "Chấm nhất quán với phương án sửa ở câu 4a của sinh viên; không trừ điểm nếu output khác đáp án gợi ý nhưng đúng với mã đã sửa hợp lệ.",
            rubric: [
              { id: "m1-output", criterion: "Xác định đúng output của m1 theo mã đã sửa", points: 0.25 },
              { id: "m2-output", criterion: "Xác định đúng output của m2 và giải thích field hiding nếu cần", points: 0.25 },
            ],
          },
        ],
      },
    ],
  };
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 32;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
}

export async function createUetMidtermAssessmentTemplate(): Promise<Buffer> {
  const draft = sampleDraft();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UETCodehub";
  workbook.title = "Template bài kiểm tra giữa kỳ OOP 2020-2021";
  workbook.subject = `Chuyển đổi từ ${SOURCE_PDF}`;
  workbook.created = new Date("2020-01-01T00:00:00.000Z");
  workbook.modified = new Date("2020-01-01T00:00:00.000Z");

  const guide = workbook.addWorksheet("HuongDan", {
    properties: { tabColor: { argb: "FF0B3B66" } },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  guide.addRows([
    ["TEMPLATE IMPORT BÀI KIỂM TRA UETCODEHUB"],
    ["Nguồn", SOURCE_PDF],
    ["Cách sử dụng", "Chỉnh sửa các sheet ThongTinDe, CauHoi và Rubric; không đổi tên sheet hoặc tên cột."],
    ["Đáp án", "Các đáp án Đúng/Sai và một lựa chọn đang để trống. GV phải kiểm tra và điền trước khi lưu/phát hành đề."],
    ["Đáp án đúng", "Dùng Đúng/Sai cho true_false; dùng A/B/C/D cho single_choice."],
    ["Loại câu hỏi", "true_false | single_choice | short_text | essay | code_analysis"],
    ["Chế độ chấm", "auto | llm_assisted | manual"],
    ["Rubric", "Mỗi tiêu chí là một dòng trong sheet Rubric; tổng điểm rubric phải bằng điểm câu hỏi."],
    ["Lưu ý", "Sau khi upload, hệ thống chỉ nạp dữ liệu vào trình soạn thảo. GV xem lại rồi bấm Lưu bản nháp."],
  ]);
  guide.mergeCells("A1:B1");
  guide.getRow(1).height = 34;
  guide.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3B66" } };
  guide.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
  guide.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  guide.columns = [{ width: 24 }, { width: 110 }];
  guide.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.height = 36;
    row.eachCell((cell, columnNumber) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      if (columnNumber === 1 && rowNumber > 1) {
        cell.font = { bold: true, color: { argb: "FF0F172A" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      }
    });
  });

  const metadata = workbook.addWorksheet("ThongTinDe", {
    properties: { tabColor: { argb: "FF14B8A6" } },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  metadata.addRows([
    ["Trường", "Giá trị"],
    ["Tên đề", draft.title],
    ["Hướng dẫn", draft.instructions],
    ["Thời lượng (phút)", draft.durationMinutes],
    ["Tổng điểm", draft.totalPoints],
  ]);
  metadata.columns = [{ width: 28 }, { width: 100 }];
  styleHeader(metadata.getRow(1));
  metadata.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = rowNumber === 3 ? 48 : 30;
      row.getCell(1).font = { bold: true };
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", wrapText: true };
      });
    }
  });

  const questionRows: unknown[][] = [[
    "Mã phần",
    "Tên phần",
    "Đề dẫn / đoạn mã",
    "Mã câu",
    "Loại câu hỏi",
    "Nội dung câu hỏi",
    "Điểm",
    "Chế độ chấm",
    "Phương án A",
    "Phương án B",
    "Phương án C",
    "Phương án D",
    "Đáp án đúng",
    "Đáp án gợi ý",
    "Prompt LLM",
  ]];
  const rubricRows: unknown[][] = [["Mã câu", "Mã tiêu chí", "Tiêu chí", "Điểm"]];

  for (const section of draft.sections) {
    section.questions.forEach((question, questionIndex) => {
      questionRows.push([
        section.key,
        section.title,
        questionIndex === 0 ? section.introContent ?? "" : "",
        question.key,
        question.type,
        question.prompt,
        question.points,
        question.gradingMode,
        question.options?.[0] ?? "",
        question.options?.[1] ?? "",
        question.options?.[2] ?? "",
        question.options?.[3] ?? "",
        typeof question.answerKey === "boolean"
          ? question.answerKey ? "Đúng" : "Sai"
          : typeof question.answerKey === "number" ? String.fromCharCode(65 + question.answerKey) : "",
        question.referenceAnswer ?? "",
        question.gradingPrompt ?? "",
      ]);
      for (const criterion of question.rubric ?? []) {
        rubricRows.push([question.key, criterion.id ?? "", criterion.criterion, criterion.points]);
      }
    });
  }

  const questions = workbook.addWorksheet("CauHoi", {
    properties: { tabColor: { argb: "FF0284C7" } },
    views: [{ state: "frozen", ySplit: 1, xSplit: 4 }],
  });
  questions.addRows(questionRows);
  questions.columns = [12, 34, 72, 12, 20, 72, 10, 18, 48, 48, 48, 48, 16, 72, 72].map(
    (width) => ({ width })
  );
  styleHeader(questions.getRow(1));
  questions.autoFilter = { from: "A1", to: `O${questionRows.length}` };
  questions.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = String(row.getCell(4).value).startsWith("C4.") ? 220 : 60;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
    });
    row.getCell(3).font = { name: "Consolas", size: 10 };
    row.getCell(7).numFmt = "0.00";
  });
  for (let rowNumber = 2; rowNumber <= 201; rowNumber += 1) {
    questions.getCell(`E${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"true_false,single_choice,short_text,essay,code_analysis"'],
    };
    questions.getCell(`H${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"auto,llm_assisted,manual"'],
    };
    questions.getCell(`M${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Đúng,Sai,A,B,C,D"'],
    };
  }

  const rubric = workbook.addWorksheet("Rubric", {
    properties: { tabColor: { argb: "FF7C3AED" } },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  rubric.addRows(rubricRows);
  rubric.columns = [14, 22, 90, 12].map((width) => ({ width }));
  styleHeader(rubric.getRow(1));
  rubric.autoFilter = { from: "A1", to: `D${rubricRows.length}` };
  rubric.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 42;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
    });
    row.getCell(4).numFmt = "0.00";
  });

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}

function normalized(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function valueFor(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedAliases = new Set(aliases.map(normalized));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalized(key))) return value;
  }
  return "";
}

function stringFor(row: Record<string, unknown>, aliases: string[]): string {
  return String(valueFor(row, aliases) ?? "").trim();
}

function sheetRecords(workbook: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const actualName = workbook.SheetNames.find((item) => normalized(item) === normalized(name));
  if (!actualName) throw new AssessmentTemplateImportError([`Thiếu sheet ${name}.`]);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[actualName], {
    defval: "",
    raw: true,
  });
}

function parseQuestionType(value: string): AssessmentQuestionType | null {
  const map: Record<string, AssessmentQuestionType> = {
    true_false: "true_false",
    dung_sai: "true_false",
    single_choice: "single_choice",
    mot_lua_chon: "single_choice",
    short_text: "short_text",
    tra_loi_ngan: "short_text",
    essay: "essay",
    tu_luan: "essay",
    code_analysis: "code_analysis",
    phan_tich_ma_java: "code_analysis",
  };
  return map[normalized(value)] ?? null;
}

function parseGradingMode(value: string): AssessmentGradingMode | null {
  const map: Record<string, AssessmentGradingMode> = {
    auto: "auto",
    tu_dong: "auto",
    llm_assisted: "llm_assisted",
    llm_cham_nhap: "llm_assisted",
    manual: "manual",
    gv_cham_thu_cong: "manual",
  };
  return map[normalized(value)] ?? null;
}

function parseTrueFalse(value: string): boolean | undefined {
  const key = normalized(value);
  if (["dung", "true", "1", "yes"].includes(key)) return true;
  if (["sai", "false", "0", "no"].includes(key)) return false;
  return undefined;
}

function parseChoice(value: string, optionCount: number): number | undefined {
  const key = normalized(value).toUpperCase();
  if (!key) return undefined;
  if (/^[A-Z]$/.test(key)) {
    const index = key.charCodeAt(0) - 65;
    return index >= 0 && index < optionCount ? index : undefined;
  }
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric === 0 && optionCount > 0) return 0;
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= optionCount) return numeric - 1;
  return undefined;
}

export function parseAssessmentTemplate(buffer: Buffer): AssessmentTemplateImportResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new AssessmentTemplateImportError(["Không thể đọc file Excel. Hãy dùng file .xlsx hợp lệ."]);
  }

  const metadataRows = sheetRecords(workbook, "ThongTinDe");
  const questionRows = sheetRecords(workbook, "CauHoi");
  const rubricRows = sheetRecords(workbook, "Rubric");
  const errors: string[] = [];
  const warnings: string[] = [];

  const metadata = new Map<string, unknown>();
  for (const row of metadataRows) {
    const field = stringFor(row, ["Trường", "field"]);
    if (field) metadata.set(normalized(field), valueFor(row, ["Giá trị", "value"]));
  }

  const title = String(metadata.get("ten_de") ?? "").trim();
  const instructions = String(metadata.get("huong_dan") ?? "").trim();
  const durationMinutes = Number(metadata.get("thoi_luong_phut"));
  const declaredTotal = Number(metadata.get("tong_diem"));
  if (!title) errors.push("Sheet ThongTinDe thiếu Tên đề.");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
    errors.push("Thời lượng phải là số nguyên từ 1 đến 600 phút.");
  }

  const rubricByQuestion = new Map<string, NonNullable<AssessmentQuestionInput["rubric"]>>();
  rubricRows.forEach((row, index) => {
    const questionKey = stringFor(row, ["Mã câu", "question_key"]);
    const criterion = stringFor(row, ["Tiêu chí", "criterion"]);
    const points = Number(valueFor(row, ["Điểm", "points"]));
    if (!questionKey && !criterion) return;
    if (!questionKey || !criterion || !(points > 0)) {
      errors.push(`Sheet Rubric dòng ${index + 2} chưa đủ Mã câu, Tiêu chí hoặc Điểm.`);
      return;
    }
    const values = rubricByQuestion.get(questionKey) ?? [];
    values.push({
      id: stringFor(row, ["Mã tiêu chí", "criterion_id"]) || `criterion-${values.length + 1}`,
      criterion,
      points,
    });
    rubricByQuestion.set(questionKey, values);
  });

  const sections = new Map<string, TemplateSection>();
  const seenQuestions = new Set<string>();
  questionRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const sectionKey = stringFor(row, ["Mã phần", "section_key"]);
    const sectionTitle = stringFor(row, ["Tên phần", "section_title"]);
    const questionKey = stringFor(row, ["Mã câu", "question_key"]);
    const prompt = stringFor(row, ["Nội dung câu hỏi", "prompt"]);
    if (!sectionKey && !questionKey && !prompt) return;
    if (!sectionKey || !questionKey || !prompt) {
      errors.push(`Sheet CauHoi dòng ${rowNumber} thiếu Mã phần, Mã câu hoặc Nội dung câu hỏi.`);
      return;
    }
    if (seenQuestions.has(questionKey)) {
      errors.push(`Mã câu ${questionKey} bị trùng.`);
      return;
    }
    seenQuestions.add(questionKey);

    const typeValue = stringFor(row, ["Loại câu hỏi", "question_type", "type"]);
    const gradingValue = stringFor(row, ["Chế độ chấm", "grading_mode"]);
    const type = parseQuestionType(typeValue);
    const gradingMode = parseGradingMode(gradingValue);
    const points = Number(valueFor(row, ["Điểm", "points"]));
    if (!type) errors.push(`Câu ${questionKey} có loại câu hỏi không hợp lệ: ${typeValue || "trống"}.`);
    if (!gradingMode) errors.push(`Câu ${questionKey} có chế độ chấm không hợp lệ: ${gradingValue || "trống"}.`);
    if (!(points > 0)) errors.push(`Câu ${questionKey} phải có điểm lớn hơn 0.`);
    if (!type || !gradingMode || !(points > 0)) return;

    const options = ["A", "B", "C", "D"]
      .map((letter) => stringFor(row, [`Phương án ${letter}`, `option_${letter.toLowerCase()}`]))
      .filter(Boolean);
    const answerRaw = stringFor(row, ["Đáp án đúng", "answer_key"]);
    let answerKey: boolean | number | undefined;
    if (type === "true_false") answerKey = parseTrueFalse(answerRaw);
    if (type === "single_choice") answerKey = parseChoice(answerRaw, options.length);
    if (["true_false", "single_choice"].includes(type) && answerKey === undefined) {
      warnings.push(`Câu ${questionKey} chưa có đáp án đúng; GV cần bổ sung trước khi lưu.`);
    }
    if (type === "single_choice" && options.length < 2) {
      errors.push(`Câu ${questionKey} phải có ít nhất hai phương án.`);
    }

    const rubric = rubricByQuestion.get(questionKey) ?? [];
    if (gradingMode === "llm_assisted") {
      if (!stringFor(row, ["Đáp án gợi ý", "reference_answer"])) {
        warnings.push(`Câu ${questionKey} chưa có đáp án gợi ý cho LLM.`);
      }
      const rubricTotal = rubric.reduce((sum, item) => sum + item.points, 0);
      if (Math.abs(rubricTotal - points) > 0.001) {
        warnings.push(`Câu ${questionKey} có tổng điểm rubric ${rubricTotal}, khác điểm câu hỏi ${points}.`);
      }
    }

    const existingSection = sections.get(sectionKey);
    const introContent = stringFor(row, ["Đề dẫn / đoạn mã", "intro_content"]);
    const section = existingSection ?? {
      key: sectionKey,
      title: sectionTitle || sectionKey,
      introContent,
      questions: [],
    };
    if (!section.introContent && introContent) section.introContent = introContent;
    section.questions.push({
      key: questionKey,
      type,
      prompt,
      points,
      gradingMode,
      ...(type === "single_choice" ? { options } : {}),
      ...(answerKey !== undefined ? { answerKey } : {}),
      referenceAnswer: stringFor(row, ["Đáp án gợi ý", "reference_answer"]),
      gradingPrompt: stringFor(row, ["Prompt LLM", "grading_prompt"]),
      rubric,
    });
    sections.set(sectionKey, section);
  });

  if (sections.size === 0) errors.push("Sheet CauHoi không có câu hỏi nào.");
  if (errors.length > 0) throw new AssessmentTemplateImportError(errors);

  const parsedSections = Array.from(sections.values()).map(({ key: _key, ...section }) => ({
    ...section,
    questions: section.questions.map(({ key: _questionKey, ...question }) => question),
  }));
  const calculatedTotal = parsedSections.reduce(
    (sum, section) => sum + section.questions.reduce((questionSum, question) => questionSum + question.points, 0),
    0
  );
  const totalPoints = declaredTotal > 0 ? declaredTotal : calculatedTotal;
  if (Math.abs(totalPoints - calculatedTotal) > 0.001) {
    warnings.push(`Tổng điểm khai báo ${totalPoints} khác tổng điểm câu hỏi ${calculatedTotal}.`);
  }

  return {
    draft: {
      title,
      instructions,
      durationMinutes,
      totalPoints,
      sections: parsedSections,
    },
    warnings,
  };
}
