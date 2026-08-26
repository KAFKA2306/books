import assert from 'node:assert/strict';
import test from 'node:test';
import { consolidateLegacyKindleHoldings } from '../src/holding-deduplication.mjs';

function baseCatalog(holdings, workOverrides = {}) {
  return {
    stats: {
      input_count: holdings.reduce((sum, row) => sum + row.quantity, 0),
      work_count: 1,
      edition_count: 3,
      holding_count: holdings.length,
      merged_input_count: 0,
    },
    works: [{
      work_id: 'wrk_test',
      title: 'Test',
      title_key: 'test',
      item_count: holdings.reduce((sum, row) => sum + row.quantity, 0),
      sources: [...new Set(holdings.map((row) => row.source))],
      formats: ['Kindle'],
      price_yen: 500,
      progress: 0.5,
      rating: 4,
      ...workOverrides,
    }],
    editions: [
      { edition_id: 'pending:test', work_id: 'wrk_test', id_kind: 'pending_title_key', verification: 'unverified' },
      { edition_id: 'asin:B000000001', work_id: 'wrk_test', id_kind: 'asin', verification: 'unverified' },
      { edition_id: 'asin:B000000002', work_id: 'wrk_test', id_kind: 'asin', verification: 'unverified' },
    ],
    holdings,
  };
}

function legacy(quantity = 1) {
  return {
    holding_id: 'legacy',
    work_id: 'wrk_test',
    edition_id: 'pending:test',
    source: 'Kindle購入履歴',
    format: 'Kindle',
    quantity,
    acquired_at: '2024-01-02',
    price_yen: 500,
    progress: 0.5,
    rating: 4,
  };
}

function xml(id = 'B000000001') {
  return {
    holding_id: `xml-${id}`,
    work_id: 'wrk_test',
    edition_id: `asin:${id}`,
    source: 'Amazon Kindle XML',
    format: 'Kindle',
    quantity: 1,
    acquired_at: '2024-01-02T12:34:56Z',
    price_yen: null,
    progress: null,
    rating: null,
  };
}

test('single legacy + single ASIN XML holding consolidate while preserving user metadata', () => {
  const result = consolidateLegacyKindleHoldings(baseCatalog([legacy(), xml()]));
  assert.equal(result.holdings.length, 1);
  assert.equal(result.holdings[0].holding_id, 'xml-B000000001');
  assert.equal(result.holdings[0].price_yen, 500);
  assert.equal(result.holdings[0].progress, 0.5);
  assert.equal(result.holdings[0].rating, 4);
  assert.equal(result.editions.some((row) => row.edition_id === 'pending:test'), false);
  assert.equal(result.works[0].item_count, 1);
  assert.equal(result.stats.holding_count, 1);
  assert.equal(result.stats.kindle_deduplicated_legacy_holding_count, 1);
  assert.deepEqual(result.holding_deduplication_audit[0].preserved_fields, ['price_yen', 'progress', 'rating']);
});

test('quantity-matched legacy aggregate consolidates into distinct ASIN holdings when metadata is preserved at work level', () => {
  const result = consolidateLegacyKindleHoldings(baseCatalog([legacy(2), xml(), xml('B000000002')]));
  assert.equal(result.holdings.length, 2);
  assert.deepEqual(result.holdings.map((row) => row.holding_id).sort(), ['xml-B000000001', 'xml-B000000002']);
  assert.equal(result.editions.some((row) => row.edition_id === 'pending:test'), false);
  assert.equal(result.works[0].item_count, 2);
  assert.equal(result.stats.input_count, 2);
  assert.equal(result.stats.holding_count, 2);
  assert.equal(result.holding_deduplication_audit.length, 1);
  assert.deepEqual(result.holding_deduplication_audit[0].retained_asins, ['B000000001', 'B000000002']);
  assert.deepEqual(result.holding_deduplication_audit[0].preserved_at_work_fields, ['price_yen', 'progress', 'rating']);
});

test('multiple ASIN XML holdings stay fail-closed when legacy quantity does not match', () => {
  const result = consolidateLegacyKindleHoldings(baseCatalog([legacy(), xml(), xml('B000000002')]));
  assert.equal(result.holdings.length, 3);
  assert.equal(result.holding_deduplication_audit.length, 0);
});

test('quantity-matched aggregate stays fail-closed when legacy metadata is not preserved at work level', () => {
  const result = consolidateLegacyKindleHoldings(baseCatalog(
    [legacy(2), xml(), xml('B000000002')],
    { price_yen: 999 },
  ));
  assert.equal(result.holdings.length, 3);
  assert.equal(result.holding_deduplication_audit.length, 0);
});

test('non-unit legacy quantity stays fail-closed against one XML holding', () => {
  const result = consolidateLegacyKindleHoldings(baseCatalog([legacy(2), xml()]));
  assert.equal(result.holdings.length, 2);
  assert.equal(result.holding_deduplication_audit.length, 0);
});
