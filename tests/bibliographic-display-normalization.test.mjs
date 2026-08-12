import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeAuthorDisplay,
  normalizeBibliographicDisplayCatalog,
  normalizeCategoryDisplay,
} from '../src/bibliographic-display-normalization.mjs';

test('collapses duplicated NDL-style author authority strings', () => {
  assert.equal(
    normalizeAuthorDisplay('pha, 1978-,pha, 1978-,pha 著,pha,1978-'),
    'pha',
  );
  assert.equal(
    normalizeAuthorDisplay('及川, 拓馬, 1987-,及川, 拓馬, 1987-,及川拓馬 著,及川,拓馬,1987-'),
    '及川拓馬',
  );
  assert.equal(
    normalizeAuthorDisplay('木村, 草太,木村, 草太,木村草太 著,木村,草太'),
    '木村草太',
  );
});

test('does not merge unrelated comma-separated authors without authority evidence', () => {
  assert.equal(
    normalizeAuthorDisplay('村上春樹, 川上未映子'),
    '村上春樹, 川上未映子',
  );
});

test('normalizes category aliases to the public controlled vocabulary', () => {
  assert.equal(normalizeCategoryDisplay('経済'), '経済・社会');
  assert.equal(normalizeCategoryDisplay('物理'), '科学・技術');
  assert.equal(normalizeCategoryDisplay('情報工学・制御'), 'コンピュータ・AI');
  assert.equal(normalizeCategoryDisplay('法律'), '政治・法律');
  assert.equal(normalizeCategoryDisplay('ゲーム・娯楽'), 'ゲーム・戦略');
});

test('normalizes public catalog fields while retaining raw values', () => {
  const catalog = normalizeBibliographicDisplayCatalog({
    works: [{
      work_id: 'work:1',
      title: 'トーイック公式問題集',
      title_key: 'トーイック公式問題集',
      author: '木村, 草太,木村, 草太,木村草太 著,木村,草太',
      category: '法律',
    }],
    editions: [{ edition_id: 'edition:1', work_id: 'work:1', title: 'トーイック公式問題集' }],
  });

  assert.deepEqual(catalog.works[0], {
    work_id: 'work:1',
    title: 'TOEIC 公式問題集',
    title_key: 'toeic公式問題集',
    title_raw: 'トーイック公式問題集',
    author: '木村草太',
    author_raw: '木村, 草太,木村, 草太,木村草太 著,木村,草太',
    category: '政治・法律',
    category_raw: '法律',
  });
  assert.deepEqual(catalog.editions[0], {
    edition_id: 'edition:1',
    work_id: 'work:1',
    title: 'TOEIC 公式問題集',
    title_raw: 'トーイック公式問題集',
  });
});
