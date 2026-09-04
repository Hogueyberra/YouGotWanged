# Fantasy Front Office

Private fantasy-football decision workspace for redraft, auction, and superflex leagues.

## Release scope

This working foundation uses **fictional demo data**, not current NFL or Yahoo data. It supports two independent demo leagues, roster and auction views, deterministic trade analysis, saved ideas, manual status history, JSON export, and deletion. No trade is submitted to Yahoo.

Yahoo API approval, verified league configuration, actual response fixtures, token storage/rotation, data retention rights, and authorized live projections remain prerequisites for the live release. News collection and X/xAI are disabled backlog integrations.

## Run locally

Requires Node 24 and npm.

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Open http://localhost:3000. Local Sites sign-in supplies a synthetic development account only on loopback. Production requires the authenticated Sites dispatcher; do not expose the Worker directly or trust client-supplied identity headers on a different host.

```sh
npm run check
npm run build
npm audit --omit=dev
npm run smoke
```

The smoke command uses the running localhost server and creates then deletes its own uniquely named test trade. It does not erase existing data.

## Architecture

- TypeScript and Next.js-compatible App Router through Vinext, React, Tailwind, shadcn.
- Cloudflare D1 stores saved trade snapshots and append-only status events.
- Sites manages private hosting and account sign-in.
- `domain/`: pure fantasy rules and exact legal-lineup optimization.
- `server/`: input validation, identity boundaries, actor/league-scoped persistence.
- `integrations/`: read-only provider contracts and disabled news/social adapters.
- `.agents/skills/`: narrowly scoped project skills from the Agency Agents review.
- `.codex/agents/`: focused project review-agent configurations.

D1 is the temporary-deployment implementation behind a repository boundary. Supabase/Postgres remains a future independent-hosting path; it is not currently connected.

## Data safety

Analysis is recomputed server-side, stored with its decision timestamp and input snapshot, and protected against later rewriting. Status changes require an expected revision. Private row operations derive identity from authenticated server context. Trade status changes are journal entries, not roster mutations or Yahoo actions.

Browser storage is not the system of record. Export and delete controls are in Connections. See `/privacy` and `/data-deletion`. These pages are prepared, but a private application page is not a publicly accessible Yahoo application website.

## Database changes

```sh
npm run db:generate
npm run db:migrate:local
```

Commit generated Drizzle migrations. Do not edit migrations after deployment. The initial migration adds a trigger protecting decision-time inputs and ownership. Sites packages migrations with deployment output. Avoid `drizzle-kit studio` on a public interface; four moderate development-only audit findings remain in its legacy esbuild-loader dependency chain. Production dependency audit is tracked separately.

## Delivery notes

See [build status](docs/BUILD_STATUS.md), [architecture](docs/ARCHITECTURE.md), [provider plan](docs/PROVIDER_PLAN.md), and [Yahoo application checklist](docs/YAHOO_APPLICATION.md).
