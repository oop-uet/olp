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
log "Backend settings are enabled. Job queue integration is the next backend step."
log "Expected follow-up endpoints: /api/source-check/jobs/due and /api/source-check/jobs/:id/complete."
