# Cloudflare Queue bridge for assessment AI grading

This Worker is intentionally a **feature-flagged delivery bridge**. The durable
`assessment_ai_grading_runs` table in Turso/libSQL remains the source of truth,
and the current API remains the only code that validates and persists grade
suggestions. No assessment answer, rubric, password, provider key, or JWT is
placed in the Queue message.

## Provisioning order

1. Create the Worker/Queue with `npx wrangler deploy` from this directory. The
   configuration creates the primary queue and its dead-letter queue.
2. In the Worker secret store, set:
   - `INTERNAL_API_BASE_URL` to the HTTPS API root (for example the Render URL).
   - `QUEUE_SHARED_SECRET` to a freshly generated random value of at least 32
     characters.
3. In the API service, set the same value in
   `CLOUDFLARE_ASSESSMENT_QUEUE_SHARED_SECRET`, and set
   `CLOUDFLARE_ASSESSMENT_QUEUE_PRODUCER_URL` to the Worker’s
   `https://…/enqueue` URL.
4. Keep `ASSESSMENT_AI_QUEUE_DELIVERY_MODE=durable_db` during validation. Only
   change it to `cloudflare_queue` for a named canary assessment after checking
   `/api/admin/assessment-operations`, Queue dashboard, provider quota, and a
   submit-with-AI-outage test.

The Worker receives a signed wake-up after the API has committed a submission.
It signs a second callback to the private API endpoint, which uses the existing
atomic database lease. At-least-once Queue delivery and the active backend
worker are therefore safe: duplicate callbacks cannot produce a second grade
write.

This bridge does not turn off the backend recovery worker. That is deliberate
until a full claim/complete consumer with Worker-held provider secrets has
passed the required canary and recovery checks.
