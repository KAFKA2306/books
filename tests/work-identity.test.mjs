import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCatalog } from '../scripts/load-catalog.mjs';
import { applyWorkIdentities, workIdentityKey } from '../src/work-identity.mjs';

const catalog = await loadCatalog();

test('same canonical title can represent distinct text and comic works', () => {
  const novel = catalog.works.find((work) => work.work_id === 'wrk_ef4d2b3827f5');
  const comic = catalog.works.find((work) => work.work_id === 'wrk_b54a006c4d2d');
  assert.ok(novel);
  assert.ok(comic);
  assert.equal(novel.title, '十角館の殺人');
  assert.equal(comic.title, '十角館の殺人');
  assert.equal(novel.title_key, comic.title_key);
  assert.equal(novel.work_type, 'text');
  assert.equal(comic.work_type, 'comic');
  assert.equal(comic.adaptation_of_work_id, novel.work_id);
  assert.notEqual(workIdentityKey(novel), workIdentityKey(comic));
});

test('same title and same work type remain a duplicate identity', () => {
  const a = { title_key: 'same', work_type: 'text' };
  const b = { title_key: 'same', work_type: 'text' };
  assert.equal(workIdentityKey(a), workIdentityKey(b));
});

test('work identity evidence fails closed', () => {
  const fixture = { works: [{ work_id: 'a', title_key: 'a' }] };
  assert.throws(
    () => applyWorkIdentities(fixture, {
      schema: 'kafka.books.work-identities.v1',
      records: [{ work_id: 'a', work_type: 'film', source_url: 'https://example.com' }],
    }),
    /unsupported work_type/,
  );
  assert.throws(
    () => applyWorkIdentities(fixture, {
      schema: 'kafka.books.work-identities.v1',
      records: [{ work_id: 'a', work_type: 'text', adaptation_of_work_id: 'missing', source_url: 'https://example.com' }],
    }),
    /adaptation target not found/,
  );
});
