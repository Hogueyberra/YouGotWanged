---
name: yahoo-sync-contract
description: Implement or review Yahoo Fantasy OAuth, read-only adapters, response normalization, synchronization, and retention for Fantasy Front Office. Use when work touches Yahoo provider data; do not use it to infer undocumented Yahoo fields or enable write operations.
---

# Yahoo Sync Contract

Read `AGENTS.md`, `docs/PROVIDER_PLAN.md`, and the affected files under
`integrations/yahoo/` before changing Yahoo behavior.

Keep Yahoo access read-only. Build requests only through the allowlisted path
builder, keep credentials server-side, bound timeouts and retries, honor 429
delays, and never retry a write operation. Treat OAuth callback state as a
single-use secret and replace a stored refresh token when Yahoo rotates it.

Treat the JSON contract as provisional until sanitized live fixtures have been
captured with approved credentials. Unknown shapes and missing required IDs must
produce explicit normalization issues; they are not empty successful results.
Keep missing provider fields missing.

Attach source, request resource, capture time, and retention deadline to every
fetch. Yahoo data expires after 24 hours unless a reviewed provider agreement
permits another duration. Do not add immutable Yahoo history merely because an
application calculation needs replay; resolve the rights question first.

Add fixture-based tests for idempotency, malformed payloads, pagination,
authorization failure, rate limiting, and redaction. Report live verification
as credential-blocked until a real approved response has been tested.
