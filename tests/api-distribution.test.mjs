import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import test from 'node:test';

await import('../scripts/build-api.mjs');

const base = new URL('../api/v1/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', base), 'utf8'));

test('manifest counts match distributions', async () => {
  const works = JSON.parse(await fs.readFile(new URL('works.json', base), 'utf8'));
  const editions = JSON.parse(await fs.readFile(new URL('editions.json', base), 'utf8'));
  const holdings = JSON.parse(await fs.readFile(new URL('holdings.json', base), 'utf8'));
  assert.equal(works.length, manifest.record_counts.works);
  assert.equal(editions.length, manifest.record_counts.editions);
  assert.equal(holdings.length, manifest.record_counts.holdings);
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

test('CSV files have header and one row per record', async () => {
  for (const [name, count] of [['works.csv', manifest.record_counts.works], ['editions.csv', manifest.record_counts.editions], ['holdings.csv', manifest.record_counts.holdings]]) {
    const lines = (await fs.readFile(new URL(name, base), 'utf8')).trimEnd().split('\n');
    assert.equal(lines.length, count + 1);
  }
});
