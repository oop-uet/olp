import "dotenv/config";
import { db } from "./index.js";
import { helpSections, helpItems } from "./schema.js";
import crypto from "node:crypto";

async function seedHelp() {
  console.log("🌱 Seeding Help/Guide data...");

  // Clear existing help tables
  await db.delete(helpItems);
  await db.delete(helpSections);

  const sectionsData = [
    { id: "login", title: "1. Đăng nhập lần đầu", description: null, orderIndex: 1 },
    { id: "executor", title: "2. Cài và kiểm tra Local Executor", description: "Local Executor là chương trình nhỏ chạy trên máy cá nhân để biên dịch và chạy test Java. Website chỉ bắt đầu làm bài khi Executor sẵn sàng.", orderIndex: 2 },
    { id: "exercise", title: "3. Làm bài thực hành", description: null, orderIndex: 3 },
    { id: "assessment", title: "4. Làm bài kiểm tra và quy định cảnh báo", description: "Bài kiểm tra có chế độ giám sát khác bài luyện tập. Hãy chuẩn bị Executor, đóng ứng dụng không cần thiết, và chỉ bắt đầu khi bạn đã sẵn sàng làm liên tục.", orderIndex: 4 },
    { id: "submission", title: "5. Xem bài nộp, tiến độ và bảng xếp hạng", description: null, orderIndex: 5 },
    { id: "troubleshooting", title: "6. Xử lý lỗi thường gặp", description: null, orderIndex: 6 },
  ];

  for (const s of sectionsData) {
    await db.insert(helpSections).values(s);
  }
  console.log("✅ Help sections seeded.");

  const itemsData = [
    // Login steps
    { sectionId: "login", type: "step", title: null, content: "Mở trang đăng nhập và nhập tài khoản được giảng viên hoặc quản trị viên cung cấp.", orderIndex: 1 },
    { sectionId: "login", type: "step", title: null, content: "Thông thường tài khoản sinh viên là MSSV. Nếu là lần đầu đăng nhập, mật khẩu mặc định cũng có thể là MSSV.", orderIndex: 2 },
    { sectionId: "login", type: "step", title: null, content: "Nếu hệ thống yêu cầu đổi mật khẩu, hãy đặt mật khẩu mới trước khi vào lớp học.", orderIndex: 3 },
    { sectionId: "login", type: "step", title: null, content: "Sau khi đăng nhập, hệ thống đưa bạn tới lớp học phần duy nhất của mình và danh sách bài tập.", orderIndex: 4 },

    { sectionId: "executor", type: "step", title: null, content: "Tải file Local Executor từ thông báo trên hệ thống hoặc từ nút tải ở thanh trạng thái Executor.", orderIndex: 1 },
    { sectionId: "executor", type: "step", title: null, content: "Cài JDK >= 17 hoặc cài IntelliJ IDEA kèm JDK. Trên Windows, nếu lệnh java chưa có trong PATH, Executor sẽ tự dò JDK trong IntelliJ ở các thư mục cài đặt phổ biến.", orderIndex: 2 },
    { sectionId: "executor", type: "step", title: null, content: "Mở file Executor đã tải. Nếu hệ điều hành không cho chạy bằng cách nhấp đúp, mở Terminal hoặc Command Prompt tại thư mục Downloads và chạy java -jar oop-local-executor-1.0.0.jar.", orderIndex: 3 },
    { sectionId: "executor", type: "step", title: null, content: "Giữ cửa sổ Executor đang chạy trong suốt thời gian làm bài. Khi sẵn sàng, màn hình sẽ hiện địa chỉ ws://127.0.0.1:9876 hoặc ws://localhost:9876.", orderIndex: 4 },
    { sectionId: "executor", type: "step", title: null, content: "Quay lại website và bấm nút Executor trên thanh trên cùng để kiểm tra kết nối.", orderIndex: 5 },
    { sectionId: "executor", type: "step", title: null, content: "Nếu trình duyệt hiển thị hộp thoại bảo mật \"Access other apps and services on this device\" (Truy cập các ứng dụng và dịch vụ khác trên thiết bị này), hãy chọn \"Allow\" (Cho phép) như hình dưới để website kết nối được với Local Executor: ![Hộp thoại Allow Access](/guide.jpg)", orderIndex: 6 },
    { sectionId: "executor", type: "info", title: "Lưu ý hệ điều hành", content: "Nếu dùng macOS, lần đầu mở file có thể cần xác nhận trong Security & Privacy. Nếu dùng Windows, nên cài IntelliJ IDEA kèm JDK hoặc JDK >= 17 trước khi chạy Executor.", orderIndex: 7 },

    // Exercise steps
    { sectionId: "exercise", type: "step", title: null, content: "Vào mục Bài tập để xem lớp học phần và danh sách bài theo tuần.", orderIndex: 1 },
    { sectionId: "exercise", type: "step", title: null, content: "Chọn Vào làm bài. Với bài kiểm tra, hệ thống sẽ yêu cầu toàn màn hình trước khi bắt đầu.", orderIndex: 2 },
    { sectionId: "exercise", type: "step", title: null, content: "Viết mã trong trình soạn thảo. Nếu bài cần nhiều file Java, dùng nút thêm file và đặt tên đúng với class public.", orderIndex: 3 },
    { sectionId: "exercise", type: "step", title: null, content: "Bấm Chạy thử để biên dịch và chạy test công khai trên máy cá nhân qua Local Executor.", orderIndex: 4 },
    { sectionId: "exercise", type: "step", title: null, content: "Bấm Nộp bài khi đã sẵn sàng. Hệ thống sẽ lưu lần nộp và chấm theo test case của bài.", orderIndex: 5 },
    { sectionId: "exercise", type: "info", title: "Bài có nhiều file Java", content: "Dùng nút thêm file trong editor. File chứa public class phải có tên trùng class, ví dụ public class Student thì file nên là Student.java.", orderIndex: 6 },
    { sectionId: "exercise", type: "info", title: "Đổi tên file", content: "Có thể đổi tên file trong khu vực tab file. Nếu bạn viết class ngoài cùng, hệ thống hỗ trợ gợi ý tên file theo tên class.", orderIndex: 7 },
    { sectionId: "exercise", type: "info", title: "Chạy thử", content: "Chạy thử dùng test công khai để bạn kiểm tra nhanh. Kết quả chạy thử không thay thế cho nộp bài.", orderIndex: 8 },
    { sectionId: "exercise", type: "info", title: "Nộp bài", content: "Mỗi lần nộp được lưu vào lịch sử. Điểm hiển thị dựa trên cấu hình test case và số lần nộp mà giảng viên đặt.", orderIndex: 9 },

    // Assessment rules
    { sectionId: "assessment", type: "step", title: null, content: "Không mở tab khác, chuyển cửa sổ, thu nhỏ trình duyệt hoặc thoát toàn màn hình trong lúc làm bài kiểm tra.", orderIndex: 1 },
    { sectionId: "assessment", type: "step", title: null, content: "Không mở DevTools trong phiên kiểm tra. Nếu trình duyệt đã mở DevTools trước đó, hãy đóng lại rồi tải lại trang trước khi bắt đầu.", orderIndex: 2 },
    { sectionId: "assessment", type: "step", title: null, content: "Không copy đề bài hoặc test case. Hệ thống có thể chặn thao tác sao chép ở khu vực đề bài và test.", orderIndex: 3 },
    { sectionId: "assessment", type: "step", title: null, content: "Khi số cảnh báo vượt ngưỡng do giảng viên hoặc quản trị viên đặt, bài làm có thể bị khóa và ghi nhận 0 điểm.", orderIndex: 4 },
    { sectionId: "assessment", type: "checklist", title: null, content: "Executor đang chạy và báo sẵn sàng.", orderIndex: 5 },
    { sectionId: "assessment", type: "checklist", title: null, content: "Trình duyệt đang dùng Chrome hoặc Edge khi có thể.", orderIndex: 6 },
    { sectionId: "assessment", type: "checklist", title: null, content: "Đã đóng DevTools và các tab không cần thiết.", orderIndex: 7 },
    { sectionId: "assessment", type: "checklist", title: null, content: "Đã đọc kỹ hạn nộp, số lần nộp và quy định cảnh báo.", orderIndex: 8 },

    // Submission info
    { sectionId: "submission", type: "info", title: "Bài nộp", content: "Xem lịch sử các lần nộp, thời gian nộp, điểm và chi tiết kết quả. Bấm vào từng lần nộp để xem mã đã gửi.", orderIndex: 1 },
    { sectionId: "submission", type: "info", title: "Tiến độ", content: "Theo dõi số bài đã làm, điểm hiện tại và mức độ hoàn thành trong lớp học phần.", orderIndex: 2 },
    { sectionId: "submission", type: "info", title: "Bảng xếp hạng", content: "Xem thứ hạng trong lớp theo tổng điểm. Bảng có thể tìm kiếm, sắp xếp và hiển thị vị trí của bạn.", orderIndex: 3 },

    // Troubleshooting FAQ
    { sectionId: "troubleshooting", type: "faq", title: "Website báo Executor chưa sẵn sàng", content: "Kiểm tra Executor còn chạy không, cổng hiển thị có phải 9876 không, sau đó bấm lại nút Executor trên thanh trên cùng. Trên Safari có thể bị hạn chế kết nối tới ứng dụng cục bộ; nên dùng Edge hoặc Chrome khi làm bài.", orderIndex: 1 },
    { sectionId: "troubleshooting", type: "faq", title: "Không chạy được file .jar", content: "Đảm bảo file tải về có đuôi .jar và dung lượng không quá nhỏ. Nếu file bị tải thành .html, hãy tải lại từ đúng nút trong hệ thống sau khi deploy mới nhất đã hoàn tất.", orderIndex: 2 },
    { sectionId: "troubleshooting", type: "faq", title: "Windows báo chưa cài Java/JDK", content: "Cài IntelliJ IDEA kèm JDK hoặc cài JDK 17. Nếu vẫn lỗi, mở IntelliJ, kiểm tra Project SDK, rồi chạy lại Executor. Phiên bản mới sẽ dò JDK trong IntelliJ trước khi báo lỗi.", orderIndex: 3 },
    { sectionId: "troubleshooting", type: "faq", title: "Mất phiên đăng nhập khi đang làm bài", content: "Hệ thống tự lưu mã đang soạn theo bài. Khi đăng nhập lại, quay lại bài làm để kiểm tra nội dung trước khi nộp.", orderIndex: 4 },
  ];

  for (const item of itemsData) {
    await db.insert(helpItems).values({
      id: crypto.randomUUID(),
      sectionId: item.sectionId,
      type: item.type as "step" | "info" | "faq" | "checklist",
      title: item.title,
      content: item.content,
      orderIndex: item.orderIndex,
    });
  }

  console.log("✅ Help items seeded.");
  console.log("🎉 Seeding help guide data complete!");
  process.exit(0);
}

seedHelp().catch((err) => {
  console.error("❌ Seeding help guide failed:", err);
  process.exit(1);
});
