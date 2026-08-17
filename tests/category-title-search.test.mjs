import test from 'node:test';
import assert from 'node:assert/strict';
import { categorySearchFallbackTitle } from '../src/category-title-normalization.mjs';

test('uses a substantial Japanese title prefix only as a search fallback', () => {
  assert.equal(
    categorySearchFallbackTitle('命に国境はない 紛争地イラクで考える戦争'),
    '命に国境はない',
  );
  assert.equal(
    categorySearchFallbackTitle('DXビジネスモデル 80事例に学ぶ利益を生み出す攻めの戦略'),
    'DXビジネスモデル',
  );
});

test('does not broaden short or non-Japanese title queries', () => {
  assert.equal(categorySearchFallbackTitle('TOEIC 金のフレーズ'), null);
  assert.equal(categorySearchFallbackTitle('An Introduction to Nonlinear Optimization Theory'), null);
  assert.equal(categorySearchFallbackTitle('蜘蛛の糸'), null);
});
