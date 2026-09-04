# Runbook chuyển Backend API sang Zeabur

Runbook này thực thi ADR-005 theo từng pha có thể rollback. Nó không cho phép
đổi host, schema, provider AI hoặc route trong một ca thi đang mở.

## 1. Sự thật vận hành và điều kiện dừng

- Nếu account được cấp Free/shared compute, Zeabur có thể auto-sleep và không có SLA.
  Không coi nó là hạ tầng luôn sẵn sàng cho ca thi quan trọng nếu chưa có kết quả tải
  và rollback đã ghi nhận.
- Chỉ dashboard Zeabur tại thời điểm tạo project mới là nguồn sự thật về region,
  xác minh tài khoản, quota và build/runtime resource. Không suy diễn các giá
  trị đó từ tài liệu kiến trúc.
- Trước khi tạo project, xác nhận account có nguồn compute hợp lệ. Zeabur đang
  chuyển project mới sang server/cluster; nếu dashboard yêu cầu server trả phí,
  credit hoặc phương thức thanh toán thì đây là **điểm dừng cần phê duyệt**, không
  phải lỗi kỹ thuật để tự ý vượt qua. Lần kiểm tra 04/09/2026 của account canary
  chưa có project, server hoặc credit.
- Render giữ nguyên trong suốt canary và tối thiểu bảy ngày sau cutover ổn định.
- Turso là nguồn sự thật duy nhất. Không đổi schema trong thời gian dual-host.

## 2. Chuẩn bị repository đã có

Repository đã chuẩn bị các thành phần sau:

- `backend/Dockerfile`: image Node 22 + OpenJDK 17 với Checkstyle JAR được tải
  tại image build, không tải JRE/JAR ở cold start.
- `zbpack.json`: buộc Zeabur dùng đúng Dockerfile trong monorepo.
- `.dockerignore`: loại secret, node_modules, report và đề thi khỏi build context.
- `GET /api/health`: chỉ bắt đầu lắng nghe sau migration/compatibility DB hoàn
  tất; Zeabur phải cấu hình HTTP health path này.
- `ASSESSMENT_AI_WORKER_ENABLED=false`: tắt consumer AI trên canary để không
  nhân đôi quota provider với Render. Submit/autosave và durable grading runs
  không bị phụ thuộc worker này.

Không chép `.env` lên Git, Pages hoặc log CI.

## 3. Xác nhận eligibility, tạo service và chọn build đúng trong Zeabur

1. Trong Dashboard > Servers/Projects, xác nhận một trong các nguồn compute:
   server Zeabur đã được phê duyệt, server/cluster tự quản đã bind, hoặc lựa chọn
   shared compute mà account thực sự được cấp. Không chọn mua server hay nạp credit
   trong lúc thực hiện runbook nếu chưa được phê duyệt chi phí.
2. Tạo một project/service tại region APAC gần người dùng nhất **mà dashboard
   thực sự cho phép**. Ghi lại region, nguồn compute và generated HTTPS domain vào ticket.
3. Kết nối GitHub repository `oop-uet/olp`, branch `main`.
4. Để **Root Directory trống / repository root**, vì `package-lock.json` nằm ở
   root. Không đặt `backend` làm root directory.
5. Giữ `zbpack.json` trong repo; hoặc nếu dashboard yêu cầu khai báo, đặt
   `ZBPACK_DOCKERFILE_PATH=backend/Dockerfile`. Không cấu hình cả Dockerfile
   path khác hoặc `ZBPACK_IGNORE_DOCKERFILE`.
6. Watch paths (theo cú pháp ignore-style của Zeabur):

   ```text
   /backend/**
   /package.json
   /package-lock.json
   /zbpack.json
   /.dockerignore
   ```

7. Trong Settings > Health Check, dùng HTTP path `/api/health`. Chỉ tiếp tục
   khi Zeabur báo deployment healthy và URL trả HTTP 200.

Zeabur Git integration là nguồn deploy duy nhất sau khi cấu hình xong; workflow
GitHub `Verify Backend for Zeabur` chỉ kiểm tra cùng commit và không gọi Render
hook hay một CLI deploy thứ hai. Native deploy có thể khởi động song song với
GitHub Actions; nếu cần hard gate trước production, dùng protected PR/release
quy trình đã được phê duyệt thay vì tuyên bố workflow này là deployment gate.

## 4. Biến môi trường service

Sao chép giá trị production hiện có từ secret manager/Render sang Zeabur qua
Dashboard; không ghi giá trị vào runbook. Ít nhất cần:

```text
NODE_ENV=production
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
JWT_SECRET
JWT_REFRESH_SECRET
AI_SECRET_ENCRYPTION_KEY
CORS_ORIGIN=https://uetcodehub.xyz,https://www.uetcodehub.xyz
CLOUDFLARE_PAGES_PROJECT=uetcodehub
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
PROJECT_REPOSITORY_GITHUB_TOKEN
PROJECT_REPOSITORY_REQUIRED_COLLABORATOR
DEPLOYMENT_ENVIRONMENT=production
CHECKSTYLE_JAVA_BIN=/usr/bin/java
CHECKSTYLE_AUTO_DOWNLOAD=0
CHECKSTYLE_AUTO_DOWNLOAD_JRE=0
ASSESSMENT_AI_QUEUE_DELIVERY_MODE=durable_db
ASSESSMENT_AI_WORKER_ENABLED=false
```

Thêm `CLOUDFLARE_ASSESSMENT_QUEUE_*` chỉ khi Queue bridge đã có canary riêng.
Để Zeabur tự inject `PORT`; ứng dụng bind `0.0.0.0:$PORT`. Cấu hình all provider
RPM hiện có theo quota thực tế, không tăng chỉ vì service mới có nhiều CPU.

## 5. Smoke test không đổi traffic

Trước khi hướng frontend nào sang Zeabur:

1. Gọi `GET https://<zeabur-domain>/api/health`; xác nhận 200, `status: ok`.
2. Kiểm tra preflight từ `https://uetcodehub.xyz` và một Pages preview. Không
   dùng `CORS_ORIGIN=*` ở production.
3. Dùng tài khoản canary để kiểm tra login/refresh/logout, autosave, nộp bài,
   Checkstyle, upload/download private R2 và export PDF/Excel.
4. Xác nhận assessment submitted vẫn được ghi Turso khi provider AI tắt; canary
   có `ASSESSMENT_AI_WORKER_ENABLED=false` nên Render là worker duy nhất.
5. Chạy tải nhẹ đã được phê duyệt; ghi p95/p99/error rate và Turso/provider
   headroom. Không load test trong ca thi thật.

## 6. Frontend canary riêng

Workflow **Deploy Frontend to Cloudflare Pages** có `Run workflow` inputs:

```text
api_url=https://<zeabur-domain>
deployment_branch=zeabur-canary
```

Nó tạo một Pages preview mang API Zeabur mà không đổi `VITE_API_URL` production.
Chỉ dùng HTTPS. CORS đã giới hạn previews vào project `uetcodehub`; không mở
`*.pages.dev` chung.

Kiểm tra đầy đủ trên URL preview trước khi dùng custom API domain. Khi có custom
domain `api.uetcodehub.xyz`, kiểm tra lại CORS và TLS. Không thay DNS route đang
phục vụ mà không có phương án quay về domain Render đã kiểm thử.

## 7. Cutover và rollback

1. Lưu timestamp, commit SHA, URL Render và Zeabur, p95/p99/error rate trước
   cutover.
2. Sau khi smoke/canary đạt, đặt GitHub variable `VITE_API_URL` sang HTTPS API
   Zeabur hoặc `https://api.uetcodehub.xyz`, rồi chạy deployment Pages production.
3. Đổi `ASSESSMENT_AI_WORKER_ENABLED=true` **chỉ sau khi** traffic chính đã
   chuyển sang Zeabur và xác nhận Render worker đã dừng. Không có hai worker AI
   active trong thời điểm quota hạn chế.
4. Giữ Render standby ít nhất bảy ngày, theo dõi login, autosave, submit,
   queue backlog, retry AI, Checkstyle và export.

Rollback:

- Đặt `VITE_API_URL` về Render đã kiểm thử và deploy lại Pages; hoặc đổi custom
  API route về Render nếu route đó đã được chuẩn bị trước.
- Đặt worker Zeabur về `false` khi quay về Render.
- Không rollback thủ công dữ liệu Turso, không purge Cloudflare Queue và không
  thay schema. Đối chiếu grading runs/audit trước mọi thao tác recovery.

DNS/cache propagation không có thời gian bảo đảm; chỉ kết thúc cutover khi các
client thực tế nhận đúng API và observability xác nhận trạng thái ổn định.

## 8. Thủ tục ca thi trên compute không có SLA

- Trước giờ mở đề 15 phút, gọi `/api/health`, login canary và xác nhận DB/R2.
- Theo dõi trực tiếp dashboard Zeabur, Turso, Cloudflare và AI provider trong
  khung thi. Cron/uptime ping chỉ hỗ trợ đánh thức, không thay thế pre-warm hoặc
  SLA.
- Nếu có cold start hoặc lỗi thời gian thực, ưu tiên autosave/submit qua API
  đã được xác minh; dừng thay đổi infrastructure cho đến hết ca thi.
