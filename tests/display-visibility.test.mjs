import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  createDisplayCatalog,
  filterWorksForDisplay,
  includeLowPriceFromSearch,
  isDefaultHiddenLowPriceWork,
} from '../src/display-visibility.mjs';

const fixtureWorks = [
  { work_id: 'w54', price_yen: 54, category: 'A', status: 'read', sources: ['Kindle'] },
  { work_id: 'w55', price_yen: 55, category: 'A', status: 'unread', sources: ['Kindle'] },
  { work_id: 'w56', price_yen: 56, category: 'B', status: 'reading', sources: ['紙の本'] },
  { work_id: 'wnull', price_yen: null, category: 'B', status: 'untracked', sources: ['図書館'] },
];

test('54 / 55 are hidden by default while 56 / null remain visible', () => {
  assert.equal(isDefaultHiddenLowPriceWork(fixtureWorks[0]), true);
  assert.equal(isDefaultHiddenLowPriceWork(fixtureWorks[1]), true);
  assert.equal(isDefaultHiddenLowPriceWork(fixtureWorks[2]), false);
  assert.equal(isDefaultHiddenLowPriceWork(fixtureWorks[3]), false);
  assert.deepEqual(
    filterWorksForDisplay(fixtureWorks).map((work) => work.work_id),
    ['w56', 'wnull'],
  );
});

test('explicit include_low_price restores the complete Work collection', () => {
  assert.equal(includeLowPriceFromSearch('?include_low_price=1'), true);
  assert.equal(includeLowPriceFromSearch('?include_low_price=0'), false);
  assert.equal(includeLowPriceFromSearch(''), false);
  assert.deepEqual(
    filterWorksForDisplay(fixtureWorks, { includeLowPrice: true }).map((work) => work.work_id),
    fixtureWorks.map((work) => work.work_id),
  );
});

test('display catalog changes only the Work view and never canonical entities', () => {
  const catalog = {
    works: fixtureWorks,
    editions: [{ edition_id: 'e1', work_id: 'w54', isbn13: '9780306406157' }],
    holdings: [{ holding_id: 'h1', work_id: 'w54' }],
    acquisitions: [{ acquisition_id: 'a1', work_id: 'w54', price_yen: 54 }],
    stats: { work_count: 4 },
  };
  const snapshot = structuredClone(catalog);
  const display = createDisplayCatalog(catalog);

  assert.deepEqual(display.works.map((work) => work.work_id), ['w56', 'wnull']);
  assert.strictEqual(display.editions, catalog.editions);
  assert.strictEqual(display.holdings, catalog.holdings);
  assert.strictEqual(display.acquisitions, catalog.acquisitions);
  assert.strictEqual(display.stats, catalog.stats);
  assert.deepEqual(catalog, snapshot);
});

test('browser wrapper wires the toggle and applies the display boundary before the joined app loads', async () => {
  const root = new URL('../', import.meta.url);
  const app = await fs.readFile(new URL('app.js', root), 'utf8');
  const html = await fs.readFile(new URL('index.html', root), 'utf8');

  assert.match(app, /createDisplayCatalog/);
  assert.match(app, /include_low_price/);
  assert.match(app, /installCatalogDisplayBoundary\(\);[\s\S]*await loadJoinedModule/);
  assert.match(html, /id="includeLowPriceToggle"/);
  assert.match(html, /55円以下も表示/);
});
