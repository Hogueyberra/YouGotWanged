---
name: temporal-trade-integrity
description: Implement or review Fantasy Front Office trade analysis, saved decisions, replay, and outcome grading where as-of correctness and immutable inputs matter. Use for historical or counterfactual trade work.
---

# Temporal Trade Integrity

Require an authenticated actor, `league_id`, and valid `as_of` for every private
trade calculation. Confirm that teams, players, ownership, league rules, and
projections belong to that league at the requested time.

Reject any observation whose publication or capture time is later than `as_of`.
Freeze the exact permitted inputs, calculation version, missing signals, and
provenance used for a decision. Never replace the original decision analysis
when later results arrive; outcome grading is a separate record and version.

Keep Yahoo retention constraints distinct from application replay goals. If the
source contract does not permit historical storage, retain only approved
derived evidence and mark unavailable inputs rather than reconstructing them.

Use deterministic legal-lineup evaluation. Superflex accepts QB, RB, WR, or TE;
one player cannot occupy two slots. Treat auction spend as historical cost, not
current value. Do not invent projections, replacement players, winners, or a
composite score when evidence is absent.

Test the temporal boundary directly: a fixture captured one instant after
`as_of` must be invisible, repeated analysis must use the same frozen inputs,
league data must not cross boundaries, and later grades must leave the original
analysis unchanged.
