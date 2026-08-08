# Book ingestion and normalization rules

This document is the operational ingestion contract referenced by `AGENTS.md`. It records the repository's existing canonical behavior instead of creating a second normalization implementation.

## Canonical paths

- Catalog normalization and duplicate decisions: `src/catalog.mjs`
- Import precheck CLI: `scripts/precheck.mjs`
- Canonical catalog: `data/catalog.json`
- ISBN evidence overlay: `data/isbn-enrichments.json`
- ISBN attempt/report state: `data/isbn-enrichment-state.json`, `data/isbn-enrichment-report.json`
- Kindle evidence: `data/kindle/manifest.json` and `data/kindle/records-*.ndjson`

## ISBN normalization

Use `canonicalIsbn13()` from `src/catalog.mjs`; do not implement another formatter in an ingestion path.

The current contract is:

1. Strip non-ISBN punctuation through the existing normalizer.
2. Validate ISBN-10 before converting it to ISBN-13.
3. Validate the ISBN-13 check digit.
4. Return no canonical ISBN for invalid input; never repair a failed check digit by guessing.

Run candidates through:

```bash
npm run catalog:precheck -- path/to/input.json
```

The International ISBN Agency states that ISBNs assigned since 1 January 2007 consist of 13 digits, include a check digit, and identify a particular edition and format. Primary reference: https://www.isbn-international.org/content/what-isbn/10

## Duplicate decisions

`precheckCandidates()` is authoritative for candidate imports. Preserve its machine-readable result rather than replacing a blocked decision with an undocumented manual choice.

Current decision boundaries include:

- existing canonical ISBN -> blocked
- duplicate ISBN inside the same batch -> blocked
- no ISBN + exact normalized title match -> blocked
- duplicate normalized title inside the same batch without ISBN -> blocked
- new ISBN + existing normalized Work title -> `add_edition` with a warning
- title similarity at or above the configured threshold -> warning for human review, not automatic identity

For an ingestion review, keep enough evidence to answer:

- What candidate input was evaluated?
- What normalized title / `title_key` / ISBN-13 resulted?
- Which action was returned (`create_work`, `add_edition`, `blocked`)?
- Which existing Work was matched, if any?
- Which errors or warnings caused the decision?

Do not merge two Works or Editions only because a fuzzy similarity warning exists.

## Provenance

A new or changed Work/Edition must remain traceable to evidence already supported by the repository. Acceptable provenance forms depend on the ingestion path and include:

- an import/source record retained in the repository,
- an ISBN enrichment record containing the adopted ISBN and source URLs,
- a Kindle normalized record plus `data/kindle/manifest.json` input hash/count evidence,
- another versioned audit/overlay record that identifies the source and decision.

Do not invent a source URL, acquisition date, ISBN, edition, or format to satisfy schema completeness. If provenance is insufficient, leave the candidate blocked or unverified.

## Automated ISBN enrichment

The existing ISBN enrichment process is stricter than a single-source lookup: the repository requires a valid ISBN-13, high title similarity, agreement from at least two providers, a unique qualifying ISBN, an eligible single unverified non-digital Edition, and duplicate/reference validation before adoption. Keep those guards intact.

The current public-source documentation is in `docs/isbn-enrichment.md`. Enrichment changes must retain adopted-source evidence and the attempt/report state, then pass `npm run check` before publication.

## Kindle ingestion

Kindle ingestion treats local Kindle XML as an input but does not commit the raw XML. The normalized snapshot stores the input SHA-256, sync/software metadata, counts, and per-part hashes in `data/kindle/manifest.json`.

Only a `purchase` becomes a Kindle Holding. Sample, Prime, dictionary, and unknown acquisition events must not be promoted to ownership. Same-ASIN events with different acquisition meaning or timestamps remain distinct; only semantically identical events are deduplicated.

## Rollback

Canonical ingestion changes must be reviewable in Git. To rollback:

1. Revert the commit/PR that introduced the catalog or overlay change.
2. Do not delete older evidence merely because the current decision changed.
3. Re-run `npm run check` and regenerate API artifacts through the existing build path.
4. Confirm the resulting diff returns to the previous known-good catalog/evidence state.

A rollback that requires guessing old values or reconstructing deleted provenance fails the Operational Contract.

## BFV review checklist

For every proposed ingestion change, record a Claim and the acceptance criterion it makes provable. Apply the Deletion Test from `AGENTS.md`: if removing the change leaves ISBN reproducibility, duplicate auditability, rollback, and provenance all provable, reject the change as unnecessary.

Required verification before merge:

```bash
npm run check
```

When the change contains import candidates, also preserve/review the `catalog:precheck` result. Stop once the requested outcome is proven; unrelated normalization cleanup belongs in a separate issue.
