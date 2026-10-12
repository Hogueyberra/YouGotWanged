# Build status — October 6, 2026

## All Yahoo leagues: football + basketball (2026-10-12)

Nick opens the app and sees all of his Yahoo fantasy leagues — football and
basketball — grouped in the league switcher, and the trade analyzer loads
real Yahoo leagues. Built entirely against fixtures: the D1 Yahoo token is
empty and `YAHOO_CLIENT_SECRET` is missing, so no live Yahoo calls were
attempted. Everything lights up automatically once Nick re-adds the client
secret and re-taps Connect Yahoo.

### What was built

- `integrations/yahoo/paths.ts`: `user-leagues` now requests
  `game_keys=nfl,nba` (read-only allowlist preserved).
- `integrations/yahoo/normalizer.ts`: new `normalizeYahooSettings`
  (draft format + ordered roster position counts) and
  `normalizeYahooStandings` (wins/losses/points for per team). The existing
  league/team/player/roster normalizers already handle NBA payloads — the
  envelope shape is identical across sports.
- `integrations/providers/contracts.ts`: `YahooLeagueSettings`,
  `YahooTeamStanding`, and `YahooRosterPositionSetting` provider types;
  `fetchSettings`/`fetchStandings` added to the read-only provider contract.
- `integrations/yahoo/adapter.ts`: `fetchSettings`/`fetchStandings`
  implementations.
- `domain/types.ts`: `Position` gains `PG/SG/SF/PF/C`; `League` gains
  `sport`, `draftType: 'auction' | 'snake'`, `superflex: boolean`,
  `source: 'demo' | 'yahoo'`, and optional `providerLeagueKey`. Demo leagues
  unchanged (football/auction/superflex/demo).
- `server/yahooLeagueConvert.ts` (new, pure/testable): `detectYahooSport`
  (league key → game key → league URL → roster slots, else `unknown`) and
  `convertYahooLeagueToDomain`, which maps Yahoo roster positions to
  `StartingSlot[]` (football: QB/RB/WR/TE/FLEX/K/DEF; basketball:
  PG/SG/SF/PF/C/G/F/UTIL with G→PG,SG / F→SF,PF / UTIL→all five; BN/IR
  excluded), assembles players from all team rosters (projections stay null
  — never invented), teams with standings + FAAB + `myTeamId` from
  `is_current_login`. Per-league failures return issues instead of throwing.
- `server/yahooLeagues.ts` (new, I/O): `requireYahooAdapter` (shared
  503 NOT_CONFIGURED / 409 NOT_CONNECTED preamble), `fetchLeagueSnapshot`
  (extracted verbatim from the snapshot route — FAAB plan contract
  unchanged), `fetchYahooLeagueDetail` (league + settings + standings +
  teams + batched rosters).
- `GET /api/leagues`: lightweight summaries
  `{ key, name, sport, season, teamCount, myTeamName }` for all Yahoo
  leagues; 409 NOT_CONNECTED when Yahoo isn't linked; one bad league never
  kills the list.
- `GET /api/leagues/[key]`: full domain `League` for one Yahoo league, for
  the trade analyzer. Key format validated.
- `server/service.ts`: `leagueByIdAsync` resolves demo ids locally and
  Yahoo keys via fresh read-only snapshots (Yahoo I/O lazy-loaded so unit
  tests stay Cloudflare-free); `evaluateAsync`/`parseTradeAsync` power
  trade analysis, saving, and status transitions for Yahoo leagues.
- `domain/trades.ts`: warnings, summaries, and evidence are source-aware.
  Yahoo analyses report `unavailable` with an honest "no projections"
  message instead of inventing numbers; version `yahoo-trade-analysis-v1`.
- UI (`components/ffo/front-office.tsx`, `operations-views.tsx`,
  `app/office.css`): league switcher groups Yahoo leagues under
  Football / Basketball headings with demo leagues separate; selecting a
  Yahoo league loads it on demand; source badges (Demo vs Yahoo ·
  Football/Basketball); "Connect Yahoo" nudge when not connected; demo-only
  copy (auction ledger, synthetic banners) is conditional — the draft board
  shows an explanatory state for non-auction/Yahoo leagues.

### Verification (2026-10-12)

- `npm run check`: typecheck passes, lint 0 errors, `npm test`: 85 pass
  (new: NBA user-leagues/roster/settings/standings fixtures in
  `tests/provider-yahoo.test.ts`; sport detection + football/basketball
  conversion + graceful failures in `tests/yahoo-leagues.test.ts`;
  basketball lineup optimization + Yahoo honesty cases in
  `tests/domain-trades.test.ts`).
- `npm run build`: passes; `/api/leagues` and `/api/leagues/:key`
  registered.
- No live Yahoo calls attempted (no token/secret in this environment).

### Next tasks

- Nick re-adds `YAHOO_CLIENT_SECRET` and re-taps Connect Yahoo; then verify
  a real NBA league converts (roster slots, positions) and the trade
  analyzer loads it.
- Consider caching converted Yahoo leagues in D1 (24h retention max) —
  every trade analysis currently re-fetches the full league snapshot.

## Yahoo OAuth2 authorization-code flow (read-only)

Yahoo's Fantasy Sports API allowlist is live (confirmed by Yahoo's "Your
Fantasy Sports API access is live" email, received 2026-10-02). The server
side of the confidential-client OAuth flow is now implemented; no real
credentials exist yet, so everything was verified with dummy env values.

### What was built

- `GET /api/integrations/yahoo/authorize` — requires the authenticated
  actor, creates a 256-bit OAuth state, persists only its SHA-256 hash in
  D1 bound to the actor (10-minute expiry, single-use), then 302-redirects
  to `https://api.login.yahoo.com/oauth2/request_auth` with the registered
  client ID, redirect URI, `response_type=code`, state, and `language=en-us`.
- `GET /api/integrations/yahoo/callback` — validates state strictly
  (single-use consume, expiry, actor binding; fails closed to the status
  page), exchanges the code at
  `https://api.login.yahoo.com/oauth2/get_token` with
  `Authorization: Basic base64(client_id:client_secret)`, handles refresh
  token rotation, encrypts tokens with AES-GCM (YAHOO_TOKEN_KEY), and stores
  them in D1. Every outcome redirects to `/connections/yahoo`; token values
  never appear in URLs, logs, or responses.
- Encrypted token persistence in D1 via new migration
  `drizzle/0001_ancient_stephen_strange.sql` (`yahoo_oauth_state`,
  `yahoo_oauth_tokens`, keyed by actor). Persistence lives in
  `server/repository.ts`; orchestration (save, expiry-skew refresh, single
  refresh attempt then require reconnection) in `integrations/yahoo/tokens.ts`.
- `/connections/yahoo` status page (connected vs. error, no token details).
- Connections view now shows a "Connect Yahoo" entry point (only when the
  deployment has credentials configured) and a Connected/Pending badge; the
  overview payload carries `provider.connected` / `provider.connectEnabled`.
  Live Yahoo reads stay disabled — demo data is still shown until the
  PROVIDER_PLAN activation gates are satisfied.
- Env vars documented in `.env.example`: `YAHOO_CLIENT_ID`,
  `YAHOO_CLIENT_SECRET`, `YAHOO_REDIRECT_URI`, `YAHOO_TOKEN_KEY`
  (32 random bytes, base64). Register this exact redirect URI on the Yahoo
  app ("You Got Wanged"):
  `https://fantasy-front-office-nick.hougeyberra.chatgpt.site/api/integrations/yahoo/callback`

### Verification (2026-10-06)

- `npm run typecheck`: passes.
- `npm run lint`: passes, 0 errors.
- `npm test`: 67 pass (50 existing + 17 new in `tests/yahoo-oauth.test.ts`
  covering AES-GCM round-trip/tamper, state hash/verify, authorize URL
  params, token-exchange request shape and Basic auth, refresh rotation,
  single-use/actor-bound/expiring state, token save/get/delete, and
  refresh-failure cleanup).
- `npm run build`: passes; new routes registered.
- Local smoke test with dummy env values against `vinext dev`:
  `/api/integrations/yahoo/authorize` (with local auth cookie) 302s to
  `api.login.yahoo.com` with the correct query params; the state hash row
  was verified present in local D1; callback fail-closed paths verified
  (`?error=invalid_request`, `?error=invalid_state`, `?error=denied` all
  302 to the status page); `/connections/yahoo` returns 200 when signed in
  and redirects to sign-in when anonymous; no-cookie authorize returns 401.
- No real Yahoo token exchange was attempted (no credentials yet).
- The temporary local `.env.local` with dummy values was deleted after
  verification; nothing was committed.

### Still blocked

1. Install the four real env vars on the deployment (Cloudflare/Sites
   secrets); register the callback URL above on the Yahoo developer app.
2. Run the real OAuth handshake once and confirm token storage + rotation.
3. Capture sanitized fixtures per PROVIDER_PLAN and validate normalizers
   before any live data replaces demo data.
4. Account-data deletion now also wipes Yahoo tokens and OAuth state
   (covered by `deleteAll`).

---

# Build status — September 4, 2026

## Working foundation

The application is implemented in `app/` beside the original specification and Agency Agents deposits. No existing user application code was overwritten. Three parallel implementation/review agents worked in disjoint file scopes; a single shared integration branch avoided unnecessary worktree merge churn.

### Available now

- Private account sign-in through Sites and durable Cloudflare D1 storage.
- Two isolated fictional auction/superflex redraft leagues (8 and 10 teams).
- Overview, roster, historical auction board, and provider-readiness screens.
- Exact legal-lineup optimization including FLEX and SUPERFLEX; missing inputs remain unavailable.
- Two-sided trade builder with server-side validation and recomputation.
- Saved immutable decision inputs/results, notes, revision-controlled status timeline.
- Personal-data JSON export, individual trade deletion, and confirmed account-data deletion.
- About, privacy, and deletion instruction pages.
- Tested, allowlisted Yahoo read adapter and provisional normalization; not live-connected.
- Three focused project skills and three read-only reviewers from the Agency Agents review, with license attribution.

All players, projections, auction prices, scores, and league identities shown by this release are **fictional demo data**. Status updates are journal entries; nothing is sent to Yahoo.

## Verification

- `npm run typecheck`: passes.
- `npm run lint`: passes across the full application and starter UI components.
- `npm test`: 50 tests pass, including exact lineup assignment, temporal isolation, provider boundaries, database ownership, immutable snapshots, concurrent revisions, transaction rollback, and scoped deletion.
- `npm run smoke`: passes against the running local server, covering authentication, CSRF, analysis, database save/read-back, status history, stale revisions, cross-league rejection, export, and cleanup of only its own test trade.
- Authenticated home and privacy routes return HTTP 200.
- `npm run build`: production build passes.
- `npm audit --omit=dev`: zero production dependency vulnerabilities at verification time. Four moderate findings remain in Drizzle Kit's development-only legacy esbuild loader; do not expose its development server publicly.
- WebMCP `get_front_office_context` and `navigate_front_office` were verified in the supported local browser: expected schemas/annotations, navigation + read-back, rejected invalid inputs with unchanged state, and return to Overview.
- Broad visual/browser interaction QA and physical-phone testing have not been performed. HTTP workflow coverage and focused WebMCP verification are not substitutes for those checks.

## Temporary deployment

Version 2 is published successfully with owner-only access at:

https://fantasy-front-office-nick.hougeyberra.chatgpt.site

Site project: `appgprj_6a9b5141010481919be480f463afc463`.

Initial release commit: `702659cee1daf7f809beddf2c4df6ea55ce469ce`.
Initial deployment: `appgdep_6a9b54db7e248191b66412061035ab3b` (succeeded 2026-09-04 23:32 UTC).

Current application release commit: `fb034dcccb295e725ba94558f824dcb6f34b875f`.
Current saved version: `appgprj_6a9b5141010481919be480f463afc463~appgver_e8e642d1ac90819185d6d82f661c3026`.
Current deployment: `appgdep_6a9b558a75e88191be5ad10608898ad2` (succeeded 2026-09-04 23:34 UTC).
The second version corrects human-readable selector labels, removes the fictional-manager greeting, and applies the project favicon. The later release-receipt documentation commit does not change application behavior.

Hosted verification: the signed-in browser opened the workspace as its authenticated owner and loaded D1-backed state. WebMCP context and navigation passed hosted read-back checks. Anonymous and forged-identity-header requests returned 401; the platform's publication inspection token alone did not bypass application sign-in. No production test trade data was inserted.

This URL is separate from remote control of the Codex build task. The hosted application works without the office desktop remaining awake; editing this local project remotely depends on the desktop's Remote connection.

## Credential- or decision-blocked work

1. Obtain Yahoo Fantasy read approval and application credentials.
2. Confirm which projection, news, and auction fields are actually exposed; inspect authorized live fixtures.
3. Confirm Yahoo caching, historical storage, export, derived-data, and AI-processing permissions.
4. ~~Implement encrypted user-token persistence, account-bound single-use OAuth state, refresh locking/rotation, revocation, TTL enforcement, and sync orchestration before enabling Yahoo.~~ Done 2026-10-06 (verified with dummy credentials; awaiting real secrets + live handshake test). Sync orchestration and revocation UI remain future work.
5. Import the real league rules and rosters; do not treat demo settings as the user's final settings.
6. Select permitted news feeds and implement provenance/deduplication/source-quality evaluation. No news scraping or cron runs are active.
7. Evaluate X/xAI later, after sources, costs, access terms, and scope are approved.
8. Decide independent deployment/domain and Supabase migration path. Current persistence is D1, not Supabase.

The app has no live AI assistant, automated trade recommendations, live news, waiver execution, or historical outcome grading yet. These must not be implied by the working foundation.

## Resume here

Read `AGENTS.md`, this file, `docs/ARCHITECTURE.md`, and `docs/PROVIDER_PLAN.md`. Run `npm ci`, `npm run db:migrate:local`, and `npm run dev` for local work. Keep live Yahoo ingestion disabled until its gates are satisfied.

## GitHub source — September 9, 2026

The application's `origin` remote is https://github.com/Hogueyberra/YouGotWanged,
using branch `main`. The existing GitHub `project1` notes file and both of its
commits were merged into the application history without overwriting them.
Application code, documentation, project skills, review agents, and migrations
live at the GitHub repository root. The original reference deposits in the
parent local workspace are not part of this application repository.

`npm run check` (type checking, lint, and 50 tests) and `npm run build` passed again
on September 9. This source-repository setup does not change or redeploy the
private Sites application described above.

GitHub upload is **complete**. The owner approved the GitHub CLI authorization
needed for the included CI workflow, and the non-force push to `origin/main`
succeeded. Local `main` now tracks `origin/main`. The original GitHub notes and
history remain intact, and the private Sites deployment is unchanged.

## Cloudflare Workers deployment + password gate (2026-10-06, evening)

Deployed to Cloudflare Workers + D1 as decided 2026-09-24 ("as built").

- Worker: `yougotwanged` at https://yougotwanged.yougotwanged.workers.dev
  (account `Nick@thehogueteam.com's Account`, id `545c8e8c4a901dbff88abbb9fadc3787`).
- D1 database `yougotwanged` (`13725cd1-a351-44a5-8db4-6d5d5b8c2648`); both
  migrations applied remote (`wrangler d1 migrations apply DB --remote`).
- Deploy config: `wrangler.deploy.json` (repo root; derived from the vinext
  `dist/server/wrangler.json` with real account_id, database_id, name).
- Secrets set on the worker: `YAHOO_TOKEN_KEY` (generated 32-byte),
  `YAHOO_REDIRECT_URI` (workers.dev callback URL), `APP_PASSWORD`.
- API token: Nick created a second Cloudflare token with D1 Edit + Workers
  Scripts Edit after the first (narrow) token couldn't list accounts; stored
  via the custom.cloudflare connector. workers.dev subdomain `yougotwanged`
  registered via `PUT /accounts/{id}/workers/subdomain` (the dashboard
  onboarding link 404'd; the API needs PUT, not POST).

### Password gate (new)
The app's identity relied on Sites-platform `oai-*` headers, which don't
exist on Workers (all routes 401/redirected to a dead end). Added:
- `server/passwordAuth.ts` — HMAC-SHA256 cookie (`ygw_auth`) bound to
  `APP_PASSWORD`; fixed single-user actor `{id:'nick'}`; constant-time compares.
- `app/signin/route.ts` — GET renders the password form (delegates to the
  Sites `/signin-with-chatgpt` flow when platform headers are present);
  POST validates and sets the cookie, 303 to `return_to`.
- `app/chatgpt-auth.ts` — anonymous users now redirect to `/signin`.
- `server/identity.ts` — `getActor()` falls back to the password actor.

Verified: typecheck, lint, 67 tests, production build all pass. Live-browser
check of `/signin` in progress at deploy time.

### Still needed (Nick-side)
1. Yahoo app redirect URI → `https://yougotwanged.yougotwanged.workers.dev/api/integrations/yahoo/callback`
   (replaces the chatgpt.site URI he set earlier).
2. Paste Yahoo Client ID in chat → set as `YAHOO_CLIENT_ID` secret.
3. Add `YAHOO_CLIENT_SECRET` himself in the Cloudflare dashboard
   (Workers → yougotwanged → Settings → Variables).
4. Sign in at the workers.dev URL with the app password (given in chat),
   then tap Connect Yahoo on `/connections/yahoo`.

### Redirect fix (same evening)
First live-browser check caught `/` redirecting to the platform-only
`/signin-with-chatgpt` (→ app's not-found page) because `app/page.tsx` and
`app/connections/yahoo/page.tsx` called `chatGPTSignInPath` directly. Both now
use `passwordSignInPath`; `/signin` dispatches to the platform flow when
`oai-*` headers are present, so both deployments stay working. Rebuilt,
redeployed, and re-verified with a cache-bypassing hard refresh:
`/` → `/signin?return_to=%2F`, "Sign in — YouGotWanged" page renders.

### Connect button + snapshot route (same evening)
- The `/connections/yahoo` status page never had a way to start OAuth —
  added a "Connect Yahoo" button linking to `/api/integrations/yahoo/authorize`.
- Extended the Yahoo read layer for the FAAB battle plan: `players` path now
  supports `status=A` (available) + `sort=OR` (ownership rank); `ProviderTeam`
  gains `faabBalance` + `isCurrentLogin`; `ProviderTransaction` gains
  `faabBid` + `playerNames`.
- New `GET /api/integrations/yahoo/snapshot` (actor-gated, read-only):
  per league returns teams (+FAAB), all team rosters, recent transactions,
  and the top 50 available players by ownership rank. Fails closed (502) if
  Yahoo's shape drifts; 409 when Yahoo isn't connected.
- Verified: typecheck, lint, 70 tests pass; production build + deploy clean.
