import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, mergeIsbnOverlays } from '../scripts/load-catalog.mjs';

test('primary ISBN evidence overrides matching automated metadata but rejects conflicts', () => {
  const merged = mergeIsbnOverlays(
    { records: [{ work_id: 'a', isbn13: '9784102113417', publisher: null }] },
    { records: [{ work_id: 'a', isbn13: '9784102113417', publisher: '新潮社' }] },
  );
  assert.equal(merged.records.length, 1);
  assert.equal(merged.records[0].publisher, '新潮社');
  assert.throws(
    () => mergeIsbnOverlays(
      { records: [{ work_id: 'a', isbn13: '9784102113417' }] },
      { records: [{ work_id: 'a', isbn13: '9784764910010' }] },
    ),
    /Conflicting ISBN evidence/,
  );
});

test('primary bibliographic batch materializes three verified paper editions', async () => {
  const catalog = await loadCatalog(process.cwd());
  const expected = new Map([
    ['wrk_960378886748', '9784757410435'],
    ['wrk_af6a9618d5cf', '9784764910010'],
    ['wrk_f541f6d7f63f', '9784262104799'],
  ]);

  for (const [workId, isbn13] of expected) {
    const edition = catalog.editions.find((item) => (
      item.work_id === workId && item.isbn13 === isbn13
    ));
    assert.ok(edition, `${workId} should expose ISBN ${isbn13}`);
    assert.equal(edition.verification, 'verified');
    assert.ok(edition.verification_sources.length >= 2);
    assert.equal(
      catalog.works.find((work) => work.work_id === workId)?.isbn_status,
      'verified',
    );
  }
});
