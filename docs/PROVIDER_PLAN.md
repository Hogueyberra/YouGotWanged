# Provider Plan

## Current decision

Fantasy Front Office uses synthetic, visibly labeled demo data until Yahoo has
approved the application, credentials exist, and sanitized live responses have
been validated. Production provider access is read-only.

The current integration foundation provides:

- an allowlisted Yahoo Fantasy path builder;
- a bounded HTTPS GET client with timeout, response-size, retry, and total
  backoff limits;
- explicit handling of `Retry-After` without retrying earlier than requested;
- credential-redacted readiness reporting;
- defensive league, team, player, roster, and transaction normalizers; and
- a disabled interface for future news and social providers.

The normalizers use the published Yahoo JSON examples as a provisional
contract. `liveValidated: false` remains part of every result until approved
credentials have produced sanitized fixtures. An unknown response shape is an
error, not an empty successful collection.

Primary references:

- [Yahoo Fantasy Sports API guide](https://developer.yahoo.com/fantasysports/guide/)
- [Yahoo server-side authorization-code flow](https://developer.yahoo.com/oauth2/guide/flows_authcode/)
- [Yahoo bearer-token request guidance](https://developer.yahoo.com/oauth2/guide/apirequests/)

## Yahoo read surface

Only these resource families are represented in code:

| Operation            | Allowlisted resource shape                                 | Normalization state                |
| -------------------- | ---------------------------------------------------------- | ---------------------------------- |
| Discover NFL leagues | `/users;use_login=1/games;game_keys=nfl/leagues`           | Provisional league normalizer      |
| League               | `/league/{league_key}`                                     | Provisional league normalizer      |
| Settings             | `/league/{league_key}/settings`                            | Envelope only                      |
| Teams                | `/league/{league_key}/teams`                               | Provisional team normalizer        |
| Standings            | `/league/{league_key}/standings`                           | Envelope only                      |
| Scoreboard           | `/league/{league_key}/scoreboard;week={week}`              | Envelope only                      |
| Players              | `/league/{league_key}/players;start={start};count={count}` | Provisional player normalizer      |
| Team roster          | `/team/{team_key}/roster;week={week}`                      | Provisional roster normalizer      |
| Transactions         | `/league/{league_key}/transactions`                        | Provisional transaction normalizer |

All calls request JSON and use bearer authorization. Resource keys accept only
letters, digits, dot, underscore, and hyphen. No arbitrary upstream URL can be
provided by a browser request.

Settings, standings, and scoreboard responses may be fetched for controlled
contract capture, but their fields must not enter domain calculations until a
resource-specific normalizer and fixtures exist.

## OAuth boundary

The repository contains pure helpers for authorization URL construction,
cryptographically random state, hashed state comparison, and refresh-token
rotation. It does not expose a connection route or token exchange without an
approved Yahoo application and secrets.

When the flow is implemented:

1. Create state server-side, store only its hash with a short expiry and
   single-use marker, and bind it to the authenticated application user.
2. Exchange the callback code only after state validation.
3. Store access and refresh tokens encrypted server-side; never return them to
   the browser or logs.
4. If Yahoo returns a new refresh token, atomically replace the old token.
5. Refresh once after an authentication failure, then require reconnection;
   never loop.

Application login and Yahoo authorization are separate. Sites identity
authenticates the private application during temporary deployment; Yahoo OAuth
grants read access to the user's fantasy resources.

## Retention and historical integrity

Yahoo payloads and normalized Yahoo observations default to a maximum 24-hour
retention period pending written source terms. The application must not preserve
immutable historical Yahoo rosters, standings, transactions, or other source
fields merely because replay would be useful.

Before historical Yahoo storage is enabled, confirm retention, display,
derivative-use, export, and AI-processing permission. If permission remains
limited, retain only allowed calculation outputs and provenance metadata, purge
source payloads on schedule, and label unavailable historical inputs rather
than reconstructing them.

Every accepted observation needs separate `effective_at`, `published_at` when
available, `source_updated_at` when available, `fetched_at`, and
`available_to_model_at`. An `as_of` calculation can use only information with
`available_to_model_at <= as_of`.

## Projection, news, and social sources

No live collection, scraper, scheduled task, or confidence score is enabled.
Onboard future sources by role: an authoritative status source, a licensed news
feed, and two genuinely independent projection sources. Yahoo remains the
authority for the user's league state, not necessarily projections or news.

Each source needs an approved record covering:

- access method and current terms version;
- collection, storage, display, derivative, export, and AI-use permission;
- attribution and canonical-link requirements;
- retention and deletion obligations;
- rate limits and failure policy; and
- original content lineage so syndicated stories do not count as independent
  corroboration.

Start projection comparison with an equal-weight median and visible range over
compatible horizons and league scoring. Missing data remains missing. Learn
source weights only from fixed-cutoff outcome tests with enough samples; do not
assign reputation-based reliability scores.

Production collection belongs in a durable scheduler, queue, and worker with
idempotency, schema-drift alerts, and partial-run status. A Codex skill can help
implement or review this system, but it is not the production collector.

## Activation gates

Yahoo may replace demo data only after all of these are complete:

- final callback domain and application registration;
- secrets installed in the server environment;
- successful state-bound OAuth test and token-rotation test;
- sanitized fixtures captured for each enabled resource;
- normalizers updated and contract tests passing;
- league ownership and cross-league isolation tests;
- retention purge verified; and
- Yahoo permissions documented for every stored and displayed field.

Projection or news providers have the same gates plus explicit derivative and
AI-use permission. A single source outage must produce a visible partial or
stale state, never fabricated current data.
