# Yahoo Application Submission Draft

This is form-ready working copy. Replace the callback placeholders only after a
stable temporary domain is assigned. Do not claim provider capabilities that
Yahoo has not confirmed.

## Application identity

**Application name:** Fantasy Front Office

**Application type:** Server-side web application

**Temporary application domain:** `https://fantasy-front-office-nick.hougeyberra.chatgpt.site`

**Proposed callback URL:** `https://fantasy-front-office-nick.hougeyberra.chatgpt.site/api/integrations/yahoo/callback`

This domain is currently owner-private. Its About/Privacy pages are not public
application-review pages. The callback and connect routes are scaffolded in
code, but live OAuth against Yahoo still requires application approval and
installed secrets. Do not submit the proposed callback as working until tested
with real credentials; prepare an appropriately accessible application website
before submitting.

The callback must exactly match the final server route and the value used for
the authorization-code exchange.

## Short description

Fantasy Front Office is a private, read-only fantasy football decision
workspace for one user. It connects that user's two Yahoo Fantasy Football
leagues and presents league settings, teams, rosters, standings, matchups, and
transactions in one authenticated dashboard.

The leagues use redraft, auction, and superflex settings. The application uses
the exact rules and roster state of each league for private lineup and trade
analysis. It does not create transactions, edit rosters, submit lineups, or
otherwise write to Yahoo.

## Detailed use and access

- **Users:** One private user at launch.
- **Leagues:** Two private Yahoo Fantasy Football leagues owned or joined by
  that user.
- **Purpose:** Private league dashboard, deterministic legal-lineup analysis,
  and evidence-backed trade decision support.
- **Yahoo operations:** Authenticated read requests only.
- **Separation:** Each request is scoped to the authenticated user and a single
  league. League data is never mixed.
- **Credentials:** Client secrets and user tokens remain encrypted on the
  server. OAuth state is random, short-lived, single-use, and bound to the
  authenticated user.
- **Current launch state:** Synthetic demo data is shown until access is
  approved and the live response contract is verified.

## Data handling statement

Yahoo source data will be cached for no more than 24 hours by default while
retention permission is being confirmed. The application will honor any shorter
required duration. Long-term Yahoo history, redistribution, exports,
AI-processing, or derived-data storage will remain disabled unless Yahoo's
terms or written approval expressly permit those uses.

The product will identify Yahoo as the source and will not present missing or
unverified projections, news, prices, or historical values as Yahoo data.

## Permissions requested

Request only the Yahoo Fantasy Sports read permission needed to retrieve the
authenticated user's fantasy football resources. Do not request write access,
mail, contacts, profile data beyond what Yahoo requires for the authorization
flow, or unrelated Yahoo services.

## Questions requiring Yahoo confirmation

1. Does the approved Fantasy Sports read permission expose player projections,
   and if so which projection horizons and fields?
2. Does it expose player news or injury content? If so, may headlines, excerpts,
   bodies, and canonical URLs be displayed or stored, and for how long?
3. Can auction draft prices or winning bid amounts be retrieved for the user's
   leagues? Which resource and field is authoritative?
4. What cache and retention limits apply to raw responses, normalized league
   data, transactions, standings, rosters, and derived calculations?
5. May the application preserve historical snapshots for private replay and
   trade retrospectives? If not, which derived values or provenance metadata may
   be retained?
6. May permitted Yahoo data be included in private, per-request AI model input
   for recommendations? Are storage, model-provider, training, or geographic
   restrictions applicable?
7. What Yahoo attribution, linking, logo, deletion, and user-disconnection
   requirements apply?
8. Are there per-user or per-application request limits beyond published rate
   guidance that should shape synchronization frequency?

Until answered, projections, news, auction bid retrieval, Yahoo-backed
historical replay, and Yahoo data sent to an AI model remain unavailable.

## OAuth implementation note

Yahoo's published server-side flow uses:

- authorization: `https://api.login.yahoo.com/oauth2/request_auth`
- token exchange and refresh: `https://api.login.yahoo.com/oauth2/get_token`

References:

- [Authorization Code Flow for Server-side Apps](https://developer.yahoo.com/oauth2/guide/flows_authcode/)
- [Making API Requests](https://developer.yahoo.com/oauth2/guide/apirequests/)
