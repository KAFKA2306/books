import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const agents = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8');
const ingestion = await readFile(new URL('../docs/ingestion-rules.md', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('AGENTS preserves required repository guidance without custom process terminology', () => {
  for (const required of [
    'Work / Edition / Holding / Acquisition',
    'npm run catalog:precheck',
    'provenance',
    'npm run check',
    'rollback',
  ]) {
    assert.ok(agents.includes(required), `missing repository guidance: ${required}`);
  }

  for (const obsolete of [
    'Bounded Falsification & Verification',
    'BFV',
    'Functional Contract',
    'Non-Functional Contract',
    'Operational Contract',
    'Deletion Test',
    'Fixed Point',
  ]) {
    assert.ok(!agents.includes(obsolete), `obsolete custom process terminology remains: ${obsolete}`);
    assert.ok(!ingestion.includes(obsolete), `obsolete custom process terminology remains: ${obsolete}`);
  }
});

test('ingestion rules reference the existing commands and evidence paths', () => {
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
    assert.ok(ingestion.includes(required), `missing ingestion reference: ${required}`);
  }
});

test('README keeps Work, Edition, and Holding as distinct identity layers', () => {
  assert.match(
    readme,
    /作品（Work）・版（Edition）・所蔵（Holding）/u,
    'README must document Work, Edition, and Holding together as distinct concepts',
  );
});

test('removed weekly research workflow stays removed', async () => {
  await assert.rejects(
    () => access(new URL('../.github/workflows/weekly-repo-research.yml', import.meta.url)),
    { code: 'ENOENT' },
  );
});
