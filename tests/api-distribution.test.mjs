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
  ]) {
    assert.ok(names.has(name), `${name} is missing from the API collection index`);
  }
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
