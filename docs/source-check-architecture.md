# Source Code Checking Architecture

## Goal

The platform needs a source-code checking feature that can be run manually by instructors and scheduled weekly through GitHub Actions. Administrators must be able to disable the feature globally to control compute cost.

## Technology Survey

### JPlag

JPlag is purpose-built for educational plagiarism and collusion detection. It compares submissions pairwise, supports Java, can run entirely locally, exports reports/CSV, and has options such as normalization and base-code handling. It is the best fit for Java OOP exercises where many students submit solutions to the same assignment.

### PMD CPD

PMD CPD is a copy-paste detector. It is useful as a cheap first pass for duplicated code fragments and supports Java plus many other languages. It is not enough as the main plagiarism engine because it focuses on duplicate blocks, not full submission similarity and collusion workflows.

### Dolos

Dolos is a modern plagiarism detection ecosystem with CLI, web app, dashboards, clustering, and JSON-oriented workflows. It is a good future provider, especially if the system later needs richer visual exploration, but JPlag is simpler and more established for Java OOP assignments today.

### Static Analysis Tools

Semgrep, PMD rules, Checkstyle, and SpotBugs should be treated as code-quality/security/style checks. They can be added to the same GitHub Actions workflow, but they do not replace a plagiarism detector.

### ML Similarity Metrics

Recent research tools and metrics such as CodeBLEU, CrystalBLEU, CodeBERTScore, and tree-edit-distance variants are promising for code similarity research. They are not recommended as the production default because they are harder to explain to instructors, more expensive to run, and less aligned with classroom plagiarism reports.

## Decision

Use **JPlag as the primary provider** for source-code similarity checking.

Use **PMD CPD as an optional pre-check** when the instructor wants a fast duplicate-fragment scan.

Keep **Dolos as a future provider** behind the same provider interface.

## Runtime Model

1. Administrators control global settings:
   - `source_check_enabled`
   - `source_check_weekly_enabled`
   - `source_check_provider`
   - `source_check_similarity_threshold`
   - `source_check_max_runtime_minutes`
2. Instructors configure which section/exercise pairs should be checked weekly.
3. GitHub Actions runs on `workflow_dispatch` and on a weekly cron.
4. The workflow exits quickly if the admin toggle is off or if no instructor-scheduled jobs are due.
5. For each due job, the runner fetches submissions, writes them to a temporary directory by student ID, runs JPlag, uploads the HTML/JSON/CSV report as an artifact, and posts report metadata back to the backend.
6. The instructor page shows the latest run, suspicious pairs, report artifacts, and manual "Run now" action.

## GitHub Actions Design

Recommended weekly cron for Saturday 22:00 Vietnam time:

```yaml
schedule:
  - cron: "0 15 * * 6"
```

GitHub cron uses UTC, so `15:00 UTC` maps to `22:00 Asia/Ho_Chi_Minh`.

The workflow should also expose manual inputs:

```yaml
workflow_dispatch:
  inputs:
    exercise_id:
      required: false
    section_id:
      required: false
    provider:
      default: jplag
    threshold:
      default: "70"
```

Secrets required:

- `SOURCE_CHECK_API_URL`
- `SOURCE_CHECK_API_TOKEN`

## Backend Interfaces

Planned endpoints:

- `GET /api/source-check/settings`
- `PUT /api/source-check/settings`
- `POST /api/source-check/jobs`
- `GET /api/source-check/jobs/due`
- `POST /api/source-check/jobs/:id/start`
- `POST /api/source-check/jobs/:id/complete`
- `GET /api/source-check/reports`
- `GET /api/source-check/reports/:id`

The current synchronous endpoint `GET /api/exercises/:id/plagiarism` remains as a small manual fallback, but should not be used for weekly batch scans.

## Data Model

Suggested tables:

- `source_check_settings`: section/exercise schedule, provider, threshold, enabled flag.
- `source_check_jobs`: queued/running/completed/failed job state.
- `source_check_reports`: aggregate report metadata, artifact URL, summary counts.
- `source_check_pairs`: suspicious pair rows with score, submission IDs, and review status.

## UI Requirements

Instructor "Kiểm tra mã nguồn":

- Show current admin status and selected provider.
- Select section and exercise.
- Configure weekly schedule per exercise/section.
- Run manual check now.
- Show latest report, suspicious pairs, and artifact download link.

Admin "Cấu hình hệ thống":

- Toggle source checking globally.
- Toggle weekly scheduled checking.
- Select provider.
- Configure similarity threshold and max runtime.
