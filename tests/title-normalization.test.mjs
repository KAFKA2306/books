import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../scripts/load-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const expected = new Map([
  ['wrk_368805ff1c88', ['一九八四年', 'ジョージ・オーウェル']],
  ['wrk_55b681a9fd07', ['1Q84', '村上春樹']],
  ['wrk_a5e6f1b281e4', ['画期的囲碁上達法 五路盤問題集', '福井正明']],
  ['wrk_ca712aafec58', ['Animal Farm', 'ジョージ・オーウェル']],
]);

test('manually reviewed titles are applied one work at a time', async () => {
  const catalog = await loadCatalog(root);
  for (const [workId, [title, author]] of expected) {
    const work = catalog.works.find((row) => row.work_id === workId);
    assert.ok(work, `${workId} is missing`);
    assert.equal(work.title, title);
    assert.equal(work.author, author);
  }
});

test('rough memo titles no longer appear in generated works', async () => {
  const catalog = await loadCatalog(root);
  const titles = new Set(catalog.works.map((work) => work.title));
  for (const oldTitle of ['1984年', '1Q84村上春樹', '5路盤問題集、囲碁文庫', 'animal farmオーウェル']) {
    assert.equal(titles.has(oldTitle), false, `${oldTitle} still appears as a work title`);
  }
});
