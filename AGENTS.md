# AGENTS.md — KAFKA BOOKS BFV Kernel

> Bound the work. Falsify necessity. Verify the Contract. Stop at the Fixed Point.

This repository uses **Bounded Falsification & Verification (BFV)** for book ingestion and normalization. The Contract below is both the minimum required outcome and the maximum allowed scope for an ingestion change.

## 1. Functional Contract

An ingestion or normalization change MUST preserve the existing Work / Edition / Holding / Acquisition model and MUST use the repository's canonical normalization and precheck path.

- Normalize and validate ISBNs through the existing catalog functions and `npm run catalog:precheck -- <input.json>`.
- Treat a verified ISBN as an Edition identifier, not as a Work identifier.
- Do not infer an ISBN, edition, format, author, title, or ownership state when the evidence is ambiguous.
- Run duplicate decisions through the canonical precheck rules. Do not bypass an exact ISBN, normalized-title, batch-duplicate, or similarity warning by hand-editing generated output.
- Preserve the evidence needed to trace each added or changed Work/Edition to its source record, overlay, or audit entry.

The detailed ingestion rules are normative: [`docs/ingestion-rules.md`](docs/ingestion-rules.md).

## 2. Non-Functional Contract

Ingestion MUST be reproducible and auditable.

- The same canonical input and repository revision must produce the same normalization/precheck result.
- Duplicate decisions must retain the rule/reason and the matched identifier when one exists.
- Missing or conflicting provenance is a fail-closed condition; it must not be replaced by a guessed value.
- Raw private Kindle XML and credentials must not be committed. Stored derived Kindle data must remain verifiable through the manifest hashes and counts already used by the repository.
- Historical evidence must not be silently rewritten to make a new decision appear older than it is.

## 3. Operational Contract

Before changing canonical catalog state:

1. Run `npm run catalog:precheck -- <input.json>` for candidate imports when applicable.
2. Review blocked records and warnings; do not convert them to success without new evidence.
3. Apply the smallest source/overlay change that satisfies the requested outcome.
4. Run `npm run check`.
5. Review the Git diff, including generated API/catalog changes when applicable.
6. Merge through a reviewable Git commit/PR so rollback is a Git revert to the previous known-good state.

Automations that enrich ISBNs or import Kindle metadata must retain their existing evidence records and must only publish changes after validation succeeds.

## 4. Acceptance Criteria

Every ingestion change must keep all four criteria provable:

1. **ISBN normalization is reproducible.** Input, normalization rule, canonical ISBN result, and repository revision are sufficient to replay the result.
2. **Duplicate decisions are auditable.** A reviewer can determine which rule blocked/matched the record and which existing Work/Edition was involved when applicable.
3. **Rollback is possible.** Canonical changes are isolated in Git history and do not require destructive rewriting of historical evidence to revert.
4. **Provenance remains attached.** Every added or changed Work/Edition can be traced to a source record, source URL/identifier, or repository audit/overlay record that justifies the change.

## 5. Claim and Deletion Test

Before implementing a proposed change, state the Claim it is meant to prove and the Acceptance Criterion it supports.

**Deletion Test:** delete the proposed change conceptually. If all four Acceptance Criteria remain provable without it, the change is not necessary and MUST be rejected from scope.

Examples:

- Adding a second ISBN normalizer fails the Deletion Test because the existing canonical normalizer already proves reproducibility; do not add it.
- Adding an audit field or test is justified only when deleting it makes duplicate reasoning, provenance, rollback, or reproducibility unprovable.
- Cosmetic refactors unrelated to one of the four criteria are outside this Contract.

## 6. Fixed Point

Stop when the requested outcome is satisfied, `npm run check` passes, the four Acceptance Criteria are evidenced, and every remaining proposed change survives the Deletion Test. Do not expand the task merely because adjacent cleanup is possible.
