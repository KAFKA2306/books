import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const agents = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8');
const ingestion = await readFile(new URL('../docs/ingestion-rules.md', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('AGENTS defines all BFV contract layers and acceptance criteria', () => {
  for (const heading of [
    'Functional Contract',
    'Non-Functional Contract',
    'Operational Contract',
    'Acceptance Criteria',
    'Deletion Test',
    'Fixed Point',
  ]) {
    assert.match(agents, new RegExp(heading));
  }

  for (const criterion of [
    'ISBN normalization is reproducible',
    'Duplicate decisions are auditable',
    'Rollback is possible',
    'Provenance remains attached',
  ]) {
    assert.match(agents, new RegExp(criterion));
  }
});

test('ingestion rules bind policy to canonical repository commands and evidence', () => {
  for (const required of [
    'src/catalog.mjs',
    'scripts/precheck.mjs',
    'npm run catalog:precheck',
    'npm run check',
    'data/isbn-enrichments.json',
    'data/kindle/manifest.json',
    'canonicalIsbn13()',
    'precheckCandidates()',
  ]) {
    assert.ok(ingestion.includes(required), `missing ingestion contract reference: ${required}`);
  }
});

test('README keeps Work, Edition, and Holding as the canonical identity layers', () => {
  for (const layer of ['### Work', '### Edition', '### Holding']) {
    assert.ok(readme.includes(layer), `missing canonical layer documentation: ${layer}`);
  }
});

test('non-canonical weekly research workflow stays removed', async () => {
  await assert.rejects(
    () => access(new URL('../.github/workflows/weekly-repo-research.yml', import.meta.url)),
    { code: 'ENOENT' },
  );
});
