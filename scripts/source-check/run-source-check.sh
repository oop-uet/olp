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
log "event=$EVENT_NAME provider=$PROVIDER threshold=$THRESHOLD"

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

if [[ "$EVENT_NAME" == "schedule" ]] && grep -q '"weeklyEnabled"[[:space:]]*:[[:space:]]*false' "$SETTINGS_RESPONSE"; then
  log "Weekly source checking is disabled by administrator. Exiting."
  exit 0
fi

log "Backend settings are enabled. Job queue integration is the next backend step."
log "Expected follow-up endpoints: /api/source-check/jobs/due and /api/source-check/jobs/:id/complete."
