import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCatalog } from '../scripts/load-catalog.mjs';
import {
  canonicalIsbn13,
  isValidIsbn13,
  normalizeTitle,
  precheckCandidates,
  titleKey,
} from '../src/catalog.mjs';

const catalog = await loadCatalog();

test('semantic numbers are preserved', () => {
  assert.equal(normalizeTitle('1984年'), '1984年');
  assert.equal(normalizeTitle('1Q84村上春樹'), '1Q84村上春樹');
  assert.equal(normalizeTitle('22世紀の民主主義'), '22世紀の民主主義');
});

test('volume and edition suffixes are removed', () => {
  assert.equal(normalizeTitle('新 賢明なる投資家 下'), '新 賢明なる投資家');
  assert.equal(normalizeTitle('シジュウカラ ： 2 (ジュールコミックス)'), 'シジュウカラ');
  assert.equal(normalizeTitle('ハッブル宇宙望遠鏡がとらえた驚異の大宇宙【第2版】'), 'ハッブル宇宙望遠鏡がとらえた驚異の大宇宙');
  assert.equal(normalizeTitle('日経サイエンス １９年７月号'), '日経サイエンス');
});

test('title keys are stable', () => {
  assert.equal(titleKey('ゆるキャン'), titleKey('ゆるきゃん'));
  assert.equal(titleKey('暗号解読(上)'), titleKey('暗号解読(下)'));
});

test('ISBN validation and conversion', () => {
  assert.equal(canonicalIsbn13('0-306-40615-2'), '9780306406157');
  assert.ok(isValidIsbn13('9780306406157'));
  assert.equal(canonicalIsbn13('9780306406158'), null);
});

test('existing normalized title without ISBN is blocked', () => {
  const result = precheckCandidates([{ title: '暗号解読 下' }], catalog);
  assert.equal(result.ok, false);
  assert.equal(result.results[0].action, 'blocked');
});

test('new ISBN on existing work is classified as a new edition', () => {
  const result = precheckCandidates([{ title: '暗号解読 上', isbn13: '9780306406157' }], catalog);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].action, 'add_edition');
});

test('duplicate ISBN in a batch is blocked', () => {
  const result = precheckCandidates([
    { title: 'A', isbn13: '9780306406157' },
    { title: 'B', isbn13: '9780306406157' },
  ], catalog);
  assert.equal(result.ok, false);
  assert.equal(result.results[1].action, 'blocked');
});

test('Issue #1 resolves all 60 records without duplicate holdings', () => {
  assert.equal(catalog.issue_records.length, 60);
  assert.equal(catalog.stats.issue_1_duplicate_skipped_count, 24);
  assert.equal(catalog.stats.issue_1_added_record_count, 36);
  assert.equal(catalog.stats.issue_1_new_work_count, 35);
});

test('Issue #1 official OCR corrections are canonicalized', () => {
  const titles = new Set(catalog.works.map((work) => work.title));
  assert.ok(titles.has('メタスキル'));
  assert.ok(titles.has('宗教認知科学入門'));
  assert.ok(titles.has('身体性認知とは何か'));
  assert.ok(titles.has('投資は金利が9割'));
  assert.ok(titles.has('世界大激変'));
  assert.ok(!titles.has('資産は金利が9割'));
});

test('verified ISBN editions are unique and valid', () => {
  const values = catalog.editions.map((edition) => edition.isbn13).filter(Boolean);
  assert.equal(values.length, new Set(values).size);
  assert.ok(values.every(isValidIsbn13));
  assert.equal(catalog.stats.isbn_verified_count, 61);
});

test('raw source title fields are not stored', () => {
  const json = JSON.stringify(catalog.issue_records);
  assert.equal(json.includes('title_raw'), false);
  assert.equal(json.includes('raw_title'), false);
  assert.equal(json.includes('source_text'), false);
});
