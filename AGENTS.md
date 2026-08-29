# AGENTS.md

Use the repository's existing catalog and validation paths. Detailed ingestion behavior is canonical in [`docs/ingestion-rules.md`](docs/ingestion-rules.md); do not copy those rules here.

## Start without conversation history

Do not depend on prior chat, previous agent memory, or old status reports.

1. Read this file and the current default branch.
2. Check open PRs and Issues. Continue an existing canonical PR before starting another workline.
3. Run `npm run agent:state`. It gives a short, read-only view of current catalog counts and active audit queues.
4. Choose one current queue or PR, then run only the detailed audit named in `agent:state` for that task.
5. Read only the source files, data records, tests, and primary external sources needed for that task.
6. After context compaction or agent handoff, repeat steps 2–4 instead of reconstructing the conversation.

`agent:state` is an index derived from canonical data. It is not a second source of truth and must not be persisted as a manually maintained status file.

## Keep decision quality with a small context window

Use only this working set unless the selected task requires more: this file, current open PR/Issue, `agent:state`, one detailed audit, the files/tests being changed, and the primary sources for the exact claim.

- Finish a valid open PR before opening a competing workline.
- Otherwise prefer current real-data work that can end in a verified reusable result. Do not spend a run on records that the existing audit already says require missing source detail unless that source detail is available.
- Prefer verified data corrections and completed evidence over documentation or infrastructure churn.
- Use the strongest primary source needed for the exact change and stop when the evidence is sufficient; do not collect redundant sources just to increase citation count.
- Batch only independent, low-ambiguity records that share the same research surface. Keep ambiguous records separate.
- Treat title text as metadata, not identity. Work merges/splits, Edition reassignment, adaptation links, and same-title resolution require explicit identity evidence and focused regression tests.
- Never reduce an audit count by discarding Edition differences, identifiers, provenance, units, dates, or null semantics.
- If evidence is insufficient, leave the record unchanged and report it as UNVERIFIED instead of guessing.

## Change rules

- Preserve the Work / Edition / Holding / Acquisition model and existing identifiers.
- Use existing ISBN normalization, duplicate checks, overlays, and audit paths. For candidate imports, use `npm run catalog:precheck -- <input.json>` when applicable.
- Do not infer ISBNs, editions, formats, authors, titles, ownership, dates, or provenance when evidence is ambiguous. Preserve null as null.
- Keep source records and audit evidence sufficient to explain every changed Work or Edition.
- Keep private Kindle XML and credentials out of the repository; preserve manifest hashes and counts for derived Kindle data.
- Prefer DELETE > MERGE > REPLACE > ADD. Reuse or simplify existing code before adding another implementation, dependency, config, workflow, script, or document.
- Keep changes reviewable in Git and keep rollback a normal revert. Do not rewrite historical evidence to make a current decision appear older.

## Completion

Run `npm run check`, inspect the generated catalog/API changes, open or update one PR, verify exact-head CI, merge only that verified head, read back `main`, and verify publication separately when the public Pages/API changed. Stop when the requested outcome is verified; unrelated cleanup belongs elsewhere.
