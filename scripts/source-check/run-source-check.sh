#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="${SOURCE_CHECK_OUTPUT_DIR:-source-check-output}"
mkdir -p "$OUTPUT_DIR"

log() {
  printf '%s\n' "$1" | tee -a "$OUTPUT_DIR/run.log"
}

if [[ -z "${SOURCE_CHECK_API_URL:-}" || -z "${SOURCE_CHECK_API_TOKEN:-}" ]]; then
  log "Source check is not configured. Missing SOURCE_CHECK_API_URL or SOURCE_CHECK_API_TOKEN."
  log "Skipping without consuming runner time on JPlag."
  exit 0
fi

API_URL="${SOURCE_CHECK_API_URL%/}"
EVENT_NAME="${SOURCE_CHECK_EVENT_NAME:-schedule}"
PROVIDER="${SOURCE_CHECK_PROVIDER:-jplag}"
THRESHOLD="${SOURCE_CHECK_THRESHOLD:-70}"
STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
export SOURCE_CHECK_STARTED_AT="$STARTED_AT"

log "Source Check Coordinator"
log "event=$EVENT_NAME"

SETTINGS_RESPONSE="$OUTPUT_DIR/settings.json"
HTTP_CODE="$(
  curl -sS -o "$SETTINGS_RESPONSE" -w "%{http_code}" \
    -H "Authorization: Bearer ${SOURCE_CHECK_API_TOKEN}" \
    "${API_URL}/api/source-check/settings" || true
)"

if [[ "$HTTP_CODE" != "200" ]]; then
  log "Backend source-check settings endpoint is not ready or not reachable (HTTP $HTTP_CODE)."
  log "The workflow scaffold is installed; backend job endpoints must be enabled before scheduled scans run."
  exit 0
fi

if grep -q '"enabled"[[:space:]]*:[[:space:]]*false' "$SETTINGS_RESPONSE"; then
  log "Source checking is disabled by administrator. Exiting."
  exit 0
fi

read_setting() {
  node -e '
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const value = process.argv[2].split(".").reduce((cursor, key) => cursor == null ? undefined : cursor[key], data);
    process.stdout.write(value == null ? "" : String(value));
  ' "$SETTINGS_RESPONSE" "$1"
}

if [[ "$EVENT_NAME" == "schedule" ]] && grep -q '"weeklyEnabled"[[:space:]]*:[[:space:]]*false' "$SETTINGS_RESPONSE"; then
  log "Weekly source checking is disabled by administrator. Exiting."
  exit 0
fi

if [[ "$EVENT_NAME" == "schedule" ]]; then
  CONFIG_DAY="$(read_setting schedule.day)"
  CONFIG_HOUR="$(read_setting schedule.hour)"
  CONFIG_MINUTE="$(read_setting schedule.minute)"
  CONFIG_LABEL="$(read_setting schedule.dayLabel) $(read_setting schedule.timeLabel) Asia/Ho_Chi_Minh"
  CURRENT_DAY="$(TZ=Asia/Ho_Chi_Minh date +%w)"
  CURRENT_HOUR="$(TZ=Asia/Ho_Chi_Minh date +%H)"
  CURRENT_MINUTE="$(TZ=Asia/Ho_Chi_Minh date +%M)"
  MINUTE_DELTA=$((10#$CURRENT_MINUTE - 10#$CONFIG_MINUTE))

  if [[ "$CURRENT_DAY" != "$CONFIG_DAY" || "$((10#$CURRENT_HOUR))" != "$CONFIG_HOUR" || "$MINUTE_DELTA" -lt 0 || "$MINUTE_DELTA" -gt 4 ]]; then
    log "Not due yet. Configured weekly run: $CONFIG_LABEL. Current Vietnam time: day=$CURRENT_DAY ${CURRENT_HOUR}:${CURRENT_MINUTE}."
    exit 0
  fi

  PROVIDER="$(read_setting provider)"
  THRESHOLD="$(read_setting threshold)"
fi

log "provider=$PROVIDER threshold=$THRESHOLD"

if [[ -z "${SOURCE_CHECK_EXERCISE_ID:-}" ]]; then
  log "No exercise_id was provided. Scheduled job discovery is not configured yet, so no scan was started."
  exit 0
fi

REQUEST_BODY="$OUTPUT_DIR/request.json"
REPORT_RESPONSE="$OUTPUT_DIR/report.json"
SUMMARY_FILE="$OUTPUT_DIR/summary.md"

node > "$REQUEST_BODY" <<'NODE'
const payload = {
  exercise_id: process.env.SOURCE_CHECK_EXERCISE_ID || undefined,
  section_id: process.env.SOURCE_CHECK_SECTION_ID || undefined,
  semester: process.env.SOURCE_CHECK_SEMESTER || undefined,
  provider: process.env.SOURCE_CHECK_PROVIDER || "jplag",
  threshold: process.env.SOURCE_CHECK_THRESHOLD || "70",
  artifact_url: process.env.SOURCE_CHECK_ARTIFACT_URL || undefined,
  workflow_run_id: process.env.SOURCE_CHECK_WORKFLOW_RUN_ID || undefined,
  triggered_by: process.env.SOURCE_CHECK_TRIGGERED_BY || undefined,
  started_at: process.env.SOURCE_CHECK_STARTED_AT || undefined,
};

for (const key of Object.keys(payload)) {
  if (payload[key] === undefined || payload[key] === "") delete payload[key];
}

process.stdout.write(JSON.stringify(payload, null, 2));
NODE

log "Starting backend source check run for exercise_id=${SOURCE_CHECK_EXERCISE_ID}."
HTTP_CODE="$(
  curl -sS -o "$REPORT_RESPONSE" -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${SOURCE_CHECK_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-binary "@$REQUEST_BODY" \
    "${API_URL}/api/source-check/run" || true
)"

if [[ "$HTTP_CODE" != "201" ]]; then
  log "Source check run failed or report could not be saved (HTTP $HTTP_CODE)."
  cat "$REPORT_RESPONSE" | tee -a "$OUTPUT_DIR/run.log"
  exit 1
fi

node - "$REPORT_RESPONSE" > "$SUMMARY_FILE" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const report = data.report || {};
const percent = Number(data.threshold || report.threshold || 0) * 100;
const lines = [
  "# Source Check Report",
  "",
  `- Report ID: ${data.id}`,
  `- Status: ${data.status}`,
  `- Provider: ${data.provider}`,
  `- Threshold: ${Number.isFinite(percent) ? percent.toFixed(0) : "?"}%`,
  `- Total submissions: ${data.totalSubmissions ?? report.totalSubmissions ?? 0}`,
  `- Compared pairs: ${data.comparedPairs ?? report.comparedPairs ?? 0}`,
  `- Suspicious pairs: ${data.pairCount ?? report.pairs?.length ?? 0}`,
  `- Finished at: ${data.finishedAt}`,
];
process.stdout.write(`${lines.join("\n")}\n`);
NODE

cat "$SUMMARY_FILE" | tee -a "$OUTPUT_DIR/run.log"
