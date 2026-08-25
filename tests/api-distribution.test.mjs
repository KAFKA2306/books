import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import test from 'node:test';

await import('../scripts/build-api.mjs');

const base = new URL('../api/v1/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', base), 'utf8'));
const collectionIndex = JSON.parse(await fs.readFile(new URL('collections.json', base), 'utf8'));

async function readJson(name) {
  return JSON.parse(await fs.readFile(new URL(name, base), 'utf8'));
}

test('every collection is fully retrievable as JSON', async () => {
  assert.ok(collectionIndex.collections.length > 0);
  for (const collection of collectionIndex.collections) {
    const rows = await readJson(collection.json);
    assert.ok(Array.isArray(rows), `${collection.name} must be an array`);
    assert.equal(rows.length, collection.count);
    assert.equal(rows.length, manifest.record_counts[collection.name]);
  }
});

test('all canonical catalog arrays are API collections', async () => {
  const catalog = await readJson('catalog.json');
  const canonicalNames = new Set(
    collectionIndex.collections
      .filter((collection) => collection.kind === 'canonical')
      .map((collection) => collection.name),
  );
  const catalogArrayNames = Object.entries(catalog)
    .filter(([, value]) => Array.isArray(value))
    .map(([name]) => name);

  assert.ok(catalogArrayNames.length > 0);
  for (const name of catalogArrayNames) {
    assert.ok(canonicalNames.has(name), `${name} is missing from the API collection index`);
  }
});

test('operational source lists are API collections', () => {
  const names = new Set(collectionIndex.collections.map((collection) => collection.name));
  for (const name of [
    'issue_records',
    'isbn_enrichments',
    'isbn_enrichment_attempts',
    'isbn_enrichment_results',
    'category_enrichments',
    'category_enrichment_attempts',
    'category_enrichment_results',
    'classifications',
    'classification_schemes',
    'ndc10_main_classes',
    'migration_identity_evidence_audit',
    'migration_identity_evidence_groups',
  ]) {
    assert.ok(names.has(name), `${name} is missing from the API collection index`);
  }
});

test('migration identity evidence audit is reproducibly exposed', async () => {
  const [summary] = await readJson('migration_identity_evidence_audit.json');
  const groups = await readJson('migration_identity_evidence_groups.json');
  assert.equal(summary.schema, 'kafka.books.migration-identity-evidence-audit.v1');
  assert.equal(summary.ambiguous_title_groups, groups.length);
  assert.equal(
    summary.ambiguous_works,
    groups.reduce((total, group) => total + group.work_count, 0),
  );
  assert.ok(summary.standard_url.startsWith('https://www.ifla.org/'));
  assert.ok(manifest.generated_from.includes('data/work-identities/'));
});

test('primary ISBN verification evidence is exposed by the API', async () => {
  const rows = await readJson('isbn_enrichments.json');
  const expected = new Map([
    ['wrk_960378886748', '9784757410435'],
    ['wrk_af6a9618d5cf', '9784764910010'],
    ['wrk_f541f6d7f63f', '9784262104799'],
  ]);
  for (const [workId, isbn13] of expected) {
    assert.ok(
      rows.some((row) => row.work_id === workId && row.isbn13 === isbn13),
      `${workId} primary ISBN evidence is missing from API`,
    );
  }
  assert.ok(manifest.generated_from.includes('data/isbn-primary-verifications/'));
});

test('core entity identifiers remain unique', async () => {
  const works = await readJson('works.json');
  const editions = await readJson('editions.json');
  const holdings = await readJson('holdings.json');
  assert.equal(new Set(works.map((row) => row.work_id)).size, works.length);
  assert.equal(new Set(editions.map((row) => row.edition_id)).size, editions.length);
  assert.equal(new Set(holdings.map((row) => row.holding_id)).size, holdings.length);
});

test('manifest hashes and byte sizes match files', async () => {
  for (const entry of manifest.files) {
    const content = await fs.readFile(new URL(entry.name, base));
    assert.equal(content.byteLength, entry.bytes);
    assert.equal(crypto.createHash('sha256').update(content).digest('hex'), entry.sha256);
  }
});

test('every collection has a CSV distribution', async () => {
  for (const collection of collectionIndex.collections) {
    const content = await fs.readFile(new URL(collection.csv, base), 'utf8');
    assert.ok(content.length > 0, `${collection.csv} is empty`);
    assert.ok(content.includes('\n'), `${collection.csv} has no header terminator`);
  }
});
