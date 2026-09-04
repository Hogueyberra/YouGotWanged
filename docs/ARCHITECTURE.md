# Architecture Decision: Portable Private MVP

**Status:** Accepted for the temporary deployment

## Context

Fantasy Front Office is a private application for one user and two Yahoo
Fantasy Football leagues. It needs a working authenticated deployment before
the independent production platform and Yahoo provider approval are final.

The UI and route layer use TypeScript and Next.js-compatible App Router APIs.
The checked-in runtime is Vinext, which targets the current Cloudflare/Sites
environment. Source data, trade calculations, and temporal rules must remain
portable because the planned independent deployment uses Supabase/Postgres.

## Decision

Use these temporary deployment components:

- **Application runtime:** Vinext with Next-compatible App Router APIs.
- **Application identity:** Sites identity for access to the private temporary
  deployment.
- **Database:** Cloudflare D1 through the repository boundary.
- **Yahoo authorization:** A separate server-side OAuth connection, enabled
  only after application approval and credentials exist.

Keep persistence behind `server/repository.ts`. UI components, domain services,
and provider adapters must not import D1 bindings or issue platform-specific SQL
directly. Keep data transfer objects and domain invariants in ordinary
TypeScript. Route handlers derive the authenticated actor from Sites identity
and pass it explicitly to repository methods with `leagueId`.

Provider code lives under `integrations/`. It performs read-only network access,
defensive normalization, provenance capture, and source-specific retention. It
does not write application records directly; the calling service validates the
normalized result and commits through the repository.

## Identity and authorization boundaries

Sites identity answers who may enter the private application. Yahoo OAuth
answers which Yahoo resources that user has authorized the server to read. A
Yahoo token never substitutes for application authorization, and a browser-
supplied actor ID is never trusted.

Every private league operation requires:

1. a server-derived authenticated actor;
2. an explicit `leagueId`; and
3. repository verification that the actor owns or may access that league.

Secrets and provider tokens remain server-side. Source text is untrusted data
and cannot become executable instructions for an AI tool.

## Temporal and source boundaries

Historical calculations require `as_of` and the exact permitted inputs used by
the calculation. Later outcome grades are separate from the original decision.
No observation captured or published after `as_of` may enter that analysis.

This goal does not override provider retention. Yahoo cache defaults to 24 hours
and immutable Yahoo history remains disabled until its contract permits it. If
source rows must be purged, store only allowed derived output and provenance and
report unavailable replay evidence honestly.

The application remains on synthetic labeled data until a provider is approved
and its live response shape is verified. Missing projections, news, auction
prices, or provider fields remain missing.

## Portability to Supabase/Postgres

The move to the independent platform should replace repository and identity
adapters, not domain behavior. Preserve:

- repository interfaces and authorization arguments;
- stable string IDs at domain boundaries;
- explicit timestamps rather than database-local time assumptions;
- JSON-serializable provider evidence;
- transaction boundaries around saved trade revisions and token rotation; and
- tests that run without D1 or Supabase.

Avoid relying on D1-only SQL, Cloudflare request globals, or Sites claims inside
domain modules. Supabase Row Level Security will become defense in depth after
migration; server-side actor and league checks remain required.

## Consequences

This architecture enables a fast private deployment and keeps the application
portable. It also means Sites identity and D1 are temporary infrastructure, not
the final data-security model. Provider activation and long-term historical
features remain intentionally gated by credentials, live contract fixtures, and
source permissions.
