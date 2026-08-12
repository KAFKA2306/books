import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorkMerges } from '../src/work-merge.mjs';

function fixture() {
  return {
    stats: { input_count: 2, work_count: 2, edition_count: 2, holding_count: 2 },
    works: [
      { work_id: 'wrk_target', title: '寄生獣', title_key: '寄生獣', author: null, category: '漫画・コミック', status: 'untracked', progress: null, rating: null, price_yen: null, acquired_at: null, item_count: 1, isbn_count: 0, isbn_status: 'missing', sources: ['紙'], formats: ['紙'] },
      { work_id: 'wrk_source', title: '寄生獣(3) (アフタヌーンコミックス)', title_key: '寄生獣3アフタヌーンコミックス', author: null, category: '漫画・コミック', status: 'untracked', progress: null, rating: null, price_yen: null, acquired_at: null, item_count: 1, isbn_count: 0, isbn_status: 'missing', sources: ['Kindle'], formats: ['Kindle'] },
    ],
    editions: [
      { edition_id: 'ed_target', work_id: 'wrk_target', isbn13: null, verification: 'unverified' },
      { edition_id: 'ed_source', work_id: 'wrk_source', isbn13: null, verification: 'unverified' },
    ],
    holdings: [
      { holding_id: 'h1', work_id: 'wrk_target', edition_id: 'ed_target', source: '紙', format: '紙', quantity: 1 },
      { holding_id: 'h2', work_id: 'wrk_source', edition_id: 'ed_source', source: 'Amazon Kindle XML', format: 'Kindle', quantity: 1 },
    ],
    acquisitions: [{ acquisition_id: 'a1', work_id: 'wrk_source', edition_id: 'ed_source' }],
    kindle_items: [{ asin: 'B000000001', work_id: 'wrk_source', edition_id: 'ed_source' }],
    kindle_match_audit: [{ kind: 'purchase_asin', work_id: 'wrk_source' }],
    issue_records: [],
    issue_resolutions: [],
  };
}

const overlay = {
  schema: 'kafka.books.work-merges.v1',
  records: [{
    from_work_id: 'wrk_source',
    into_work_id: 'wrk_target',
    from_title: '寄生獣(3) (アフタヌーンコミックス)',
    into_title: '寄生獣',
    author: '岩明均',
    source_url: 'https://example.com/book',
  }],
};

test('merges duplicate Work and remaps dependent records', () => {
  const result = applyWorkMerges(fixture(), overlay);
  assert.equal(result.works.length, 1);
  assert.equal(result.works[0].work_id, 'wrk_target');
  assert.equal(result.works[0].author, '岩明均');
  assert.equal(result.works[0].item_count, 2);
  assert.deepEqual(new Set(result.works[0].formats), new Set(['紙', 'Kindle']));
  assert.ok(result.editions.every((item) => item.work_id === 'wrk_target'));
  assert.ok(result.holdings.every((item) => item.work_id === 'wrk_target'));
  assert.equal(result.acquisitions[0].work_id, 'wrk_target');
  assert.equal(result.kindle_items[0].work_id, 'wrk_target');
  assert.equal(result.kindle_match_audit[0].work_id, 'wrk_target');
  assert.equal(result.stats.work_count, 1);
  assert.equal(result.stats.input_count, 2);
});

test('fails closed on title drift', () => {
  const bad = structuredClone(overlay);
  bad.records[0].from_title = '別タイトル';
  assert.throws(() => applyWorkMerges(fixture(), bad), /source title drift/);
});
