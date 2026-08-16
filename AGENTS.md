# AGENTS.md

Use the repository's existing catalog and validation paths. Detailed ingestion behavior is documented in [`docs/ingestion-rules.md`](docs/ingestion-rules.md); do not duplicate those rules here.

Before changing catalog data or ingestion behavior:

1. Re-read the current default branch, open Issues/PRs, relevant workflows, and the files you plan to change.
2. Preserve the existing Work / Edition / Holding / Acquisition model.
3. Use the existing ISBN normalization and duplicate-checking code. For candidate imports, run `npm run catalog:precheck -- <input.json>` when applicable.
4. Do not infer ISBNs, editions, formats, authors, titles, ownership, or provenance when evidence is ambiguous.
5. Keep source records and audit evidence sufficient to explain added or changed Work/Edition records.
6. Keep private Kindle XML and credentials out of the repository. Preserve the existing manifest hashes and counts for derived Kindle data.
7. Prefer the smallest change that produces the requested data or user outcome. Reuse or simplify existing code before adding another implementation, dependency, configuration file, or workflow.
8. Run `npm run check` before merge and inspect generated catalog/API changes when applicable.
9. Keep changes reviewable in Git so rollback is a normal revert; do not rewrite historical evidence to make a current decision appear older.
10. Stop when the requested outcome is verified. Put unrelated cleanup in a separate issue.
