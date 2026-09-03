# Runbook rollout Hybrid Cloudflare

Tài liệu này vận hành kiến trúc trong
[ADR-004](hybrid-cloudflare-architecture.md). Mục tiêu là bật từng thành phần có
rollback độc lập; không dùng runbook này để thay đổi hạ tầng trong một ca thi đang mở.

## 1. Trạng thái mặc định an toàn

- API giao dịch: Render/Node + Turso/libSQL.
- Frontend production: GitHub Pages cho đến khi Pages canary được phê duyệt.
- AI grading: `assessment_ai_grading_runs` trong Turso và backend worker hiện hữu.
- Queue delivery: `ASSESSMENT_AI_QUEUE_DELIVERY_MODE=durable_db`.

`cloudflare_queue` chỉ thêm một delivery wake-up sau transaction; không được phép làm
submit, autosave, start/resume hay điểm chính thức phụ thuộc vào Worker/Queue.

## 2. Chuẩn bị trước khi bật bất kỳ route nào

1. Chọn một assessment canary, không có hệ quả điểm chính thức.
2. Lưu backup Turso, kiểm tra khôi phục trên bản sao và ghi thời điểm/bằng chứng vào ticket.
3. Ghi baseline p50/p95/p99 và error rate cho login, preflight, start, autosave, submit,
   review và export; đồng thời chụp queue state từ `GET /api/admin/assessment-operations`.
4. Kiểm tra quota trên dashboard Cloudflare/Turso và provider AI. Không suy đoán quota từ
   browser hoặc endpoint public.
5. Có người trực biết cách rollback DNS/Pages flag/queue flag và quyền truy cập secret.

Không deploy migration schema, đổi provider, hoặc đổi route trong thời gian ca thi thật.

## 3. Cloudflare Pages canary

Trong GitHub repository, tạo các giá trị sau:

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | Token chỉ đủ quyền Pages deploy cho account/project |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| Variable | `CLOUDFLARE_PAGES_PROJECT` | Tên project Pages, ví dụ `uetcodehub` |
| Variable | `VITE_API_URL` | HTTPS API root, không kèm secret |
| Variable | `CLOUDFLARE_PAGES_ENABLED` | `true` chỉ khi bắt đầu canary |

Sau khi workflow **Deploy Frontend to Cloudflare Pages** tạo preview:

1. Đặt `CLOUDFLARE_PAGES_PROJECT` cùng giá trị ở environment API và deploy API để CORS chỉ
   chấp nhận `project.pages.dev` cùng các preview thuộc project đó. Giữ `CORS_ORIGIN` là
   allow-list tường minh cho custom domain/local development.
2. Kiểm tra login, refresh token, logout, direct deep link, download file và màn hình thi
   từ preview. Browser phải nhận `X-Request-Id` để truy vết khi cần.
3. Kiểm tra `_headers`: `nosniff`, clickjacking protection, referrer policy và permissions
   policy. CSP chưa được bật cứng vì cần inventory script/style/Monaco runtime trước khi
   chặn; thêm CSP chỉ sau kiểm thử đầy đủ.
4. Chỉ đổi custom-domain/DNS sau ít nhất một release canary ổn định. Giữ GitHub Pages và
   bản build trước làm rollback một release cycle.

Rollback: đặt `CLOUDFLARE_PAGES_ENABLED=false` và chuyển DNS/custom domain về artifact
GitHub Pages đã kiểm thử. Không cần thay API contract hay database.

## 4. R2 private artifact lifecycle

R2 bucket không public. Backend dùng S3 API key chỉ ở runtime server; URL ký có hạn tối đa
15 phút. Object key mới theo dạng:

`<environment>/<resource>/<scope>/<timestamp>-<sanitized-name>`

Lifecycle gợi ý cần cấu hình tại R2 dashboard (điều chỉnh theo quy chế lưu trữ):

| Prefix | Mục đích | Thời hạn gợi ý |
|---|---|---:|
| `*/imports/*` | Bản sao import tạm | 30 ngày |
| `*/exports/*` | CSV/XLSX export tạm | 7 ngày |
| `*/templates/*` | Template GV upload | theo sở hữu đề / xóa khi đề xóa |
| `*/assessment-exports/*` | PDF/Word đề/đáp án | 30 ngày hoặc theo quy định |
| `*/source-check/*` | Report source-check | theo quy chế audit |

Trước khi chuyển thêm artifact sang R2, kiểm thử người học không thể tải export/answer key
của lớp khác bằng cách sửa object key hay dùng URL hết hạn.

## 5. Queue bridge canary

Từ thư mục `cloudflare/assessment-ai-queue`:

```bash
npx wrangler deploy
npx wrangler secret put INTERNAL_API_BASE_URL
npx wrangler secret put QUEUE_SHARED_SECRET
```

`INTERNAL_API_BASE_URL` phải là API HTTPS; `QUEUE_SHARED_SECRET` là giá trị ngẫu nhiên ít
nhất 32 ký tự. Đặt cùng secret trong Render API:

```text
CLOUDFLARE_ASSESSMENT_QUEUE_PRODUCER_URL=https://<worker>/enqueue
CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET=<same-secret>
ASSESSMENT_AI_QUEUE_DELIVERY_MODE=durable_db
```

Đầu tiên gửi request test signed bằng test/automation, kiểm tra Worker `/health`, Queue,
DLQ và `/api/admin/assessment-operations`. Sau đó chỉ đổi
`ASSESSMENT_AI_QUEUE_DELIVERY_MODE=cloudflare_queue` trong canary. Worker giới hạn một
consumer, batch 5, retry 3 lần, delay 60 giây và DLQ để không tạo burst gọi provider.

Test bắt buộc trước go/no-go:

1. Nộp bài khi toàn bộ provider AI tắt: session vẫn `submitted` và giảng viên chấm tay được.
2. Giao cùng message lặp: chỉ một run được claim; không nhân đôi điểm/audit.
3. Tắt Worker/Queue: run còn `queued` trong Turso và backend worker/manual flow vẫn xử lý.
4. Callback sai timestamp, nonce, audience, signature hoặc body: API từ chối; không ghi run.
5. Chạm rate limit: run giữ trạng thái retry/queued, không tự cho 0 điểm.

Rollback Queue: đổi mode về `durable_db` (hoặc xóa producer URL), tạm dừng consumer nếu
cần. Không purge queue trước khi đối chiếu với run database; queue không phải nguồn sự thật.

## 6. Quyết định D1 và compute

Không chuyển Turso sang D1 hoặc Java runner sang Workers theo runbook này. Chỉ mở quyết
định đó khi đạt các gate tải/index/backup/compatibility nêu trong ADR-004. Không dual-write
hai database trong ca thi thật.
