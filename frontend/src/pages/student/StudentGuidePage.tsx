import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

const sections = [
  { id: 'login', title: 'Đăng nhập lần đầu' },
  { id: 'executor', title: 'Cài Local Executor' },
  { id: 'exercise', title: 'Làm bài thực hành' },
  { id: 'assessment', title: 'Làm bài kiểm tra' },
  { id: 'submission', title: 'Xem bài nộp và điểm' },
  { id: 'troubleshooting', title: 'Xử lý lỗi thường gặp' },
]

const executorSteps = [
  'Tải file Local Executor từ thông báo trên hệ thống hoặc từ nút tải ở thanh trạng thái Executor.',
  'Cài JDK 17 hoặc cài IntelliJ IDEA kèm JDK. Trên Windows, nếu lệnh java chưa có trong PATH, Executor sẽ tự dò JDK trong IntelliJ ở các thư mục cài đặt phổ biến.',
  'Mở file Executor đã tải. Nếu hệ điều hành không cho chạy bằng cách nhấp đúp, mở Terminal hoặc Command Prompt tại thư mục Downloads và chạy java -jar oop-local-executor-1.0.0.jar.',
  'Giữ cửa sổ Executor đang chạy trong suốt thời gian làm bài. Khi sẵn sàng, màn hình sẽ hiện địa chỉ ws://127.0.0.1:9876 hoặc ws://localhost:9876.',
  'Quay lại website và bấm nút Executor trên thanh trên cùng để kiểm tra kết nối.',
]

const workflowSteps = [
  'Vào mục Bài tập để xem lớp học phần và danh sách bài theo tuần.',
  'Chọn Vào làm bài. Với bài kiểm tra, hệ thống sẽ yêu cầu toàn màn hình trước khi bắt đầu.',
  'Viết mã trong trình soạn thảo. Nếu bài cần nhiều file Java, dùng nút thêm file và đặt tên đúng với class public.',
  'Bấm Chạy thử để biên dịch và chạy test công khai trên máy cá nhân qua Local Executor.',
  'Bấm Nộp bài khi đã sẵn sàng. Hệ thống sẽ lưu lần nộp và chấm theo test case của bài.',
]

const assessmentRules = [
  'Không mở tab khác, chuyển cửa sổ, thu nhỏ trình duyệt hoặc thoát toàn màn hình trong lúc làm bài kiểm tra.',
  'Không mở DevTools trong phiên kiểm tra. Nếu trình duyệt đã mở DevTools trước đó, hãy đóng lại rồi tải lại trang trước khi bắt đầu.',
  'Không copy đề bài hoặc test case. Hệ thống có thể chặn thao tác sao chép ở khu vực đề bài và test.',
  'Khi số cảnh báo vượt ngưỡng do giảng viên hoặc quản trị viên đặt, bài làm có thể bị khóa và ghi nhận 0 điểm.',
]

const troubleshooting = [
  {
    title: 'Website báo Executor chưa sẵn sàng',
    detail:
      'Kiểm tra Executor còn chạy không, cổng hiển thị có phải 9876 không, sau đó bấm lại nút Executor trên thanh trên cùng. Trên Safari có thể bị hạn chế kết nối tới ứng dụng cục bộ; nên dùng Edge hoặc Chrome khi làm bài.',
  },
  {
    title: 'Không chạy được file .jar',
    detail:
      'Đảm bảo file tải về có đuôi .jar và dung lượng không quá nhỏ. Nếu file bị tải thành .html, hãy tải lại từ đúng nút trong hệ thống sau khi deploy mới nhất đã hoàn tất.',
  },
  {
    title: 'Windows báo chưa cài Java/JDK',
    detail:
      'Cài IntelliJ IDEA kèm JDK hoặc cài JDK 17. Nếu vẫn lỗi, mở IntelliJ, kiểm tra Project SDK, rồi chạy lại Executor. Phiên bản mới sẽ dò JDK trong IntelliJ trước khi báo lỗi.',
  },
  {
    title: 'Mất phiên đăng nhập khi đang làm bài',
    detail:
      'Hệ thống tự lưu mã đang soạn theo bài. Khi đăng nhập lại, quay lại bài làm để kiểm tra nội dung trước khi nộp.',
  },
]

export function StudentGuidePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-gradient-to-r from-[#003366] to-[#002b56] text-white shadow-md border-b-4 border-[#f37021]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 border border-white/20 text-xs font-black text-[#f37021] tracking-wider shadow-inner">
              UET
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                UET OASIS <span className="text-[10px] font-bold bg-[#f37021] text-white px-1.5 py-0.5 rounded tracking-wide uppercase">Cẩm nang</span>
              </h1>
              <p className="text-xs text-slate-300 font-medium">Hướng dẫn sử dụng dành cho sinh viên Lập trình hướng đối tượng</p>
            </div>
          </div>
          <Link
            to="/login"
            className="px-4 py-2 text-xs font-bold text-white bg-[#f37021] hover:bg-[#e05f10] active:scale-[0.98] transition-all rounded-lg shadow-sm border border-[#f37021]/30 cursor-pointer"
          >
            Đăng nhập
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
              Mục lục hướng dẫn
            </p>
            <nav className="space-y-1">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-[#003366]/5 hover:text-[#003366] transition-all duration-150 active:scale-[0.98] cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f37021] shrink-0" />
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-8 shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#f37021]/5 rounded-full -mr-8 -mt-8 blur-lg" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#003366]/5 rounded-full -ml-12 -mb-12 blur-xl" />
            
            <p className="text-[11px] font-black uppercase tracking-widest text-[#f37021] select-none">
              Khởi động nhanh
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-800 leading-snug">
              Làm bài Java OOP trên website, biên dịch trực tiếp bằng máy cá nhân
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 max-w-3xl">
              Hệ thống UET OASIS cung cấp trình soạn thảo trực tuyến chuyên nghiệp. Trình biên dịch Java sẽ được chạy trực tiếp trên máy tính cá nhân của bạn thông qua phần mềm <strong>Local Executor</strong>, đảm bảo tốc độ biên dịch tối ưu và trải nghiệm làm bài tốt nhất.
            </p>
          </section>

          <GuideSection id="login" title="1. Đăng nhập lần đầu">
            <ol className="space-y-3.5 text-xs leading-relaxed text-slate-600 font-medium">
              <li className="flex gap-3">
                <span className="font-bold text-slate-800">1.</span>
                <span>Mở trang đăng nhập và nhập tài khoản được giảng viên hoặc quản trị viên cung cấp.</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-slate-800">2.</span>
                <span>Thông thường tài khoản sinh viên là MSSV. Nếu là lần đầu đăng nhập, mật khẩu mặc định cũng có thể là MSSV.</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-slate-800">3.</span>
                <span>Nếu hệ thống yêu cầu đổi mật khẩu, hãy đặt mật khẩu mới trước khi vào lớp học.</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-slate-800">4.</span>
                <span>Sau khi đăng nhập, hệ thống đưa bạn tới lớp học phần duy nhất của mình và danh sách bài tập.</span>
              </li>
            </ol>
          </GuideSection>

          <GuideSection id="executor" title="2. Cài và kiểm tra Local Executor">
            <p className="mb-4 text-xs leading-relaxed text-slate-500 font-semibold">
              Local Executor là chương trình nhỏ chạy trên máy cá nhân để biên dịch và chạy test Java. Website chỉ bắt đầu làm bài khi Executor sẵn sàng.
            </p>
            <StepList items={executorSteps} />
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900 font-medium">
              <strong>Lưu ý:</strong> Nếu dùng macOS, lần đầu mở file có thể cần xác nhận trong Security & Privacy. Nếu dùng Windows, nên cài IntelliJ IDEA kèm JDK hoặc JDK 17 trước khi chạy Executor.
            </div>
          </GuideSection>

          <GuideSection id="exercise" title="3. Làm bài thực hành">
            <StepList items={workflowSteps} />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <InfoCard
                title="Bài có nhiều file Java"
                text="Dùng nút thêm file trong editor. File chứa public class phải có tên trùng class, ví dụ public class Student thì file nên là Student.java."
              />
              <InfoCard
                title="Đổi tên file"
                text="Có thể đổi tên file trong khu vực tab file. Nếu bạn viết class ngoài cùng, hệ thống hỗ trợ gợi ý tên file theo tên class."
              />
              <InfoCard
                title="Chạy thử"
                text="Chạy thử dùng test công khai để bạn kiểm tra nhanh. Kết quả chạy thử không thay thế cho nộp bài."
              />
              <InfoCard
                title="Nộp bài"
                text="Mỗi lần nộp được lưu vào lịch sử. Điểm hiển thị dựa trên cấu hình test case và số lần nộp mà giảng viên đặt."
              />
            </div>
          </GuideSection>

          <GuideSection id="assessment" title="4. Làm bài kiểm tra và quy định cảnh báo">
            <p className="mb-4 text-xs leading-relaxed text-slate-500 font-semibold">
              Bài kiểm tra có chế độ giám sát khác bài luyện tập. Hãy chuẩn bị Executor, đóng ứng dụng không cần thiết, và chỉ bắt đầu khi bạn đã sẵn sàng làm liên tục.
            </p>
            <StepList items={assessmentRules} />
          </GuideSection>

          <GuideSection id="submission" title="5. Xem bài nộp, tiến độ và bảng xếp hạng">
            <div className="grid gap-4 md:grid-cols-3">
              <InfoCard
                title="Bài nộp"
                text="Xem lịch sử các lần nộp, thời gian nộp, điểm và chi tiết kết quả. Bấm vào từng lần nộp để xem mã đã gửi."
              />
              <InfoCard
                title="Tiến độ"
                text="Theo dõi số bài đã làm, điểm hiện tại và mức độ hoàn thành trong lớp học phần."
              />
              <InfoCard
                title="Bảng xếp hạng"
                text="Xem thứ hạng trong lớp theo tổng điểm. Bảng có thể tìm kiếm, sắp xếp và hiển thị vị trí của bạn."
              />
            </div>
          </GuideSection>

          <GuideSection id="troubleshooting" title="6. Xử lý lỗi thường gặp">
            <div className="space-y-3">
              {troubleshooting.map((item) => (
                <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 hover:bg-slate-50 transition-colors">
                  <h3 className="text-xs font-bold text-slate-800">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500 font-medium">{item.detail}</p>
                </div>
              ))}
            </div>
          </GuideSection>

          <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 shadow-sm">
            <h2 className="text-base font-bold text-emerald-900 flex items-center gap-2">
              <span className="text-lg">✓</span> Checklist chuẩn bị trước khi làm bài kiểm tra
            </h2>
            <div className="mt-4 grid gap-3 text-xs text-emerald-900 md:grid-cols-2">
              <ChecklistItem text="Executor đang chạy và báo sẵn sàng." />
              <ChecklistItem text="Trình duyệt đang dùng Chrome hoặc Edge khi có thể." />
              <ChecklistItem text="Đã đóng DevTools và các tab không cần thiết." />
              <ChecklistItem text="Đã đọc kỹ hạn nộp, số lần nộp và quy định cảnh báo." />
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function GuideSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm border-l-4 border-l-[#003366]">
      <h2 className="mb-4 text-base font-bold text-slate-800 border-b border-slate-100 pb-3">{title}</h2>
      <div className="space-y-3">
        {children}
      </div>
    </section>
  )
}

function StepList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3.5">
      {items.map((item, index) => (
        <li key={item} className="flex gap-3.5 text-xs leading-relaxed text-slate-600 font-medium">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#003366] text-[10px] font-bold text-white shadow-sm">
            {index + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  )
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 hover:bg-slate-50 transition-colors">
      <h3 className="text-xs font-bold text-slate-800">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-500 font-medium">{text}</p>
    </div>
  )
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-emerald-200/50 bg-white px-4 py-3 font-bold text-emerald-800 shadow-sm flex items-center gap-2 select-none">
      <span className="text-emerald-500 font-black text-sm">✓</span>
      {text}
    </div>
  )
}
