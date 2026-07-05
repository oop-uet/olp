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
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
              UET
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">Hướng dẫn sử dụng UET OASIS</h1>
              <p className="text-sm text-slate-500">Dành cho sinh viên học Lập trình hướng đối tượng</p>
            </div>
          </div>
          <Link to="/login" className="btn-primary btn-sm">
            Đăng nhập
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Nội dung</p>
            <nav className="space-y-1">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-primary-50 hover:text-primary"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-wide text-primary">Bắt đầu nhanh</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Làm bài Java OOP trên website, chạy mã bằng máy cá nhân
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              UET OASIS dùng trình duyệt để hiển thị đề bài, soạn mã và nộp bài. Phần biên dịch Java chạy trên máy
              của bạn thông qua Local Executor, vì vậy trước khi làm bài hãy đảm bảo Executor đã kết nối thành công.
            </p>
          </section>

          <GuideSection id="login" title="1. Đăng nhập lần đầu">
            <ol className="space-y-3 text-sm leading-6 text-slate-700">
              <li><strong>1.</strong> Mở trang đăng nhập và nhập tài khoản được giảng viên hoặc quản trị viên cung cấp.</li>
              <li><strong>2.</strong> Thông thường tài khoản sinh viên là MSSV. Nếu là lần đầu đăng nhập, mật khẩu mặc định cũng có thể là MSSV.</li>
              <li><strong>3.</strong> Nếu hệ thống yêu cầu đổi mật khẩu, hãy đặt mật khẩu mới trước khi vào lớp học.</li>
              <li><strong>4.</strong> Sau khi đăng nhập, hệ thống đưa bạn tới lớp học phần duy nhất của mình và danh sách bài tập.</li>
            </ol>
          </GuideSection>

          <GuideSection id="executor" title="2. Cài và kiểm tra Local Executor">
            <p className="mb-4 text-sm leading-6 text-slate-700">
              Local Executor là chương trình nhỏ chạy trên máy cá nhân để biên dịch và chạy test Java. Website chỉ bắt đầu
              làm bài khi Executor sẵn sàng.
            </p>
            <StepList items={executorSteps} />
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <strong>Lưu ý:</strong> Nếu dùng macOS, lần đầu mở file có thể cần xác nhận trong Security & Privacy. Nếu
              dùng Windows, nên cài IntelliJ IDEA kèm JDK hoặc JDK 17 trước khi chạy Executor.
            </div>
          </GuideSection>

          <GuideSection id="exercise" title="3. Làm bài thực hành">
            <StepList items={workflowSteps} />
            <div className="mt-5 grid gap-3 md:grid-cols-2">
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
            <p className="mb-4 text-sm leading-6 text-slate-700">
              Bài kiểm tra có chế độ giám sát khác bài luyện tập. Hãy chuẩn bị Executor, đóng ứng dụng không cần thiết,
              và chỉ bắt đầu khi bạn đã sẵn sàng làm liên tục.
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
                <div key={item.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </GuideSection>

          <section className="rounded-lg border border-primary-100 bg-primary-50 p-6">
            <h2 className="text-lg font-bold text-primary-900">Checklist trước khi làm bài kiểm tra</h2>
            <div className="mt-4 grid gap-3 text-sm text-primary-900 md:grid-cols-2">
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
    <section id={id} className="scroll-mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

function StepList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  )
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-primary-100 bg-white px-4 py-3 font-semibold">
      {text}
    </div>
  )
}
