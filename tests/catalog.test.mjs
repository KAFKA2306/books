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
