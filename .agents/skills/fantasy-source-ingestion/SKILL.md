---
name: fantasy-source-ingestion
description: Design, add, or review projection, news, injury, or social-data providers for Fantasy Front Office. Use when onboarding a source or building normalization, dedupe, provenance, scheduling, or reliability logic; do not activate unapproved scraping.
---

# Fantasy Source Ingestion

Start with a source-rights record: approved access method, storage and display
permission, derivative and AI use, attribution, retention, rate limits, and
termination obligations. Public accessibility is not approval to scrape. Leave
the adapter disabled until these fields and credentials are approved.

Keep production collection in deterministic scheduler, queue, and worker code.
This skill may help implement or audit that code; it is not the production cron,
does not hold secrets, and does not authorize live collection.

Preserve immutable ingestion-run metadata and source timestamps. Record
`effective_at`, `published_at`, `source_updated_at`, `fetched_at`, and
`available_to_model_at` separately. Normalize source assertions without mixing
reported fact, analyst opinion, and application inference.

Resolve source player IDs through a versioned identity map. Dedupe exact IDs and
hashes first, then event fingerprints. Track original lineage so syndicated
stories count as one source, and preserve conflicting claims as evidence rather
than overwriting them.

For projections, compare only compatible horizons and scoring. Treat missing as
missing. Start with transparent equal-weight medians and disagreement ranges;
learn weights only from fixed-cutoff historical evaluations with sufficient
samples. Expose provenance and confidence components rather than inventing one
opaque score.

Test duplicate runs, source outages, schema drift, ambiguous identity, late
corrections, correlated sources, retention expiry, and `as_of` leakage before
enabling a provider.
