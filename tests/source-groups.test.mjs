import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../scripts/load-catalog.mjs';
import {
  normalizeCatalogSources,
  normalizeIssueRecords,
  normalizeSourceGroup,
  SOURCE_GROUPS,
} from '../src/source-groups.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowed = new Set(SOURCE_GROUPS);

test('detailed registration sources collapse into three public groups', () => {
  assert.equal(normalizeSourceGroup('Amazon Kindle XML'), 'Kindle');
  assert.equal(normalizeSourceGroup('Kindle購入履歴'), 'Kindle');
  assert.equal(normalizeSourceGroup('Kindleスクリーンショット'), 'Kindle');
  assert.equal(normalizeSourceGroup('電子書籍メモ'), 'Kindle');
  assert.equal(normalizeSourceGroup('Amazon注文履歴', '単行本'), '紙の本');
  assert.equal(normalizeSourceGroup('Amazon注文履歴', 'Kindle'), 'Kindle');
  assert.equal(normalizeSourceGroup('Amazon', 'Paperback'), '紙の本');
  assert.equal(normalizeSourceGroup('蔵書メモ'), '紙の本');
  assert.equal(normalizeSourceGroup('福山市図書館履歴'), '図書館');
});

test('public catalog exposes only Kindle, paper books, and library', async () => {
  const catalog = normalizeCatalogSources(await loadCatalog(root));
  const workSources = catalog.works.flatMap((work) => work.sources ?? []);
  const holdingSources = catalog.holdings.map((holding) => holding.source).filter(Boolean);

  assert.ok(workSources.length > 0);
  assert.ok(holdingSources.length > 0);
  for (const source of [...workSources, ...holdingSources]) {
    assert.ok(allowed.has(source), `unexpected public source: ${source}`);
  }
  assert.equal(JSON.stringify(catalog).includes('福山市'), false);
});

test('supplemental issue records use the same public source groups', () => {
  const [record] = normalizeIssueRecords([
    { holding: { source: 'Kindleスクリーンショット', format: 'Kindle' } },
  ]);
  assert.equal(record.holding.source, 'Kindle');
});
