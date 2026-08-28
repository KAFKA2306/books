import assert from 'node:assert/strict';
import test from 'node:test';
import { auditTitleAnomalies, detectTitleAnomalies } from '../src/title-anomaly-audit.mjs';

test('detects commercial annotations, volume metadata, and imprint suffixes', () => {
  const reasons = detectTitleAnomalies({
    title: '作品名 モノクロ版【期間限定無料】 1 (ジャンプコミックスDIGITAL)',
    author: null,
  });
  assert.ok(reasons.includes('commercial_annotation'));
  assert.ok(reasons.includes('volume_metadata'));
  assert.ok(reasons.includes('imprint_or_series_suffix'));
});

test('detects full-width volume digits used in publisher bibliographic titles', () => {
  const reasons = detectTitleAnomalies({ title: 'ＧＴＯ（８）', author: '藤沢 とおる' });
  assert.ok(reasons.includes('volume_metadata'));
});

test('distinguishes semantic bracketed title text from retail annotations', () => {
  assert.deepEqual(
    detectTitleAnomalies({ title: 'バーナード嬢曰く。【友情篇】', author: '施川 ユウキ' }),
    [],
  );
  assert.deepEqual(
    detectTitleAnomalies({ title: '一度読んだら絶対に忘れない世界史の教科書【経済編】', author: '山﨑 圭一' }),
    [],
  );
  assert.ok(
    detectTitleAnomalies({ title: '作品名【電子限定特典付き】', author: null }).includes('commercial_annotation'),
  );
});

test('preserves publisher-defined edition titles', () => {
  assert.deepEqual(
    detectTitleAnomalies({ title: '五等分の花嫁 フルカラー版', author: '春場 ねぎ' }),
    [],
  );
  assert.deepEqual(
    detectTitleAnomalies({ title: 'メタモルフォーゼの縁側【分冊版】', author: '鶴谷 香央理' }),
    [],
  );
  assert.deepEqual(
    detectTitleAnomalies({ title: '本居宣長（上下）合本版', author: '小林 秀雄' }),
    [],
  );
  assert.deepEqual(
    detectTitleAnomalies({ title: '完訳7つの習慣 特装版', author: 'スティーブン・R・コヴィー' }),
    [],
  );
  assert.deepEqual(
    detectTitleAnomalies({ title: '骨粗鬆症の予防と治療ガイドライン 2025年版 ダイジェスト版', author: '骨粗鬆症の予防と治療ガイドライン作成委員会' }),
    [],
  );
  assert.ok(
    !detectTitleAnomalies({ title: 'きのう何食べた？（８）限定版', author: 'よしなが ふみ' }).includes(
      'commercial_annotation',
    ),
  );
});

test('preserves publisher-defined microcontent serial titles', () => {
  assert.deepEqual(
    detectTitleAnomalies({ title: 'ひかえめに言っても、これは愛 プチデザ(1)', author: '藤もも' }),
    [],
  );
  assert.deepEqual(
    detectTitleAnomalies({ title: 'ひかえめに言っても、これは愛　プチデザ（１６）', author: '藤もも' }),
    [],
  );
});

test('detects explicit creator-role suffixes without flagging semantic 編 titles', () => {
  assert.deepEqual(
    detectTitleAnomalies({ title: '作品名 Kindle版', author: null }),
    ['format_marker'],
  );
  assert.deepEqual(
    detectTitleAnomalies({ title: '作品名 著', author: null }),
    ['creator_role_suffix'],
  );
  assert.deepEqual(
    detectTitleAnomalies({ title: 'カードキャプターさくら クリアカード編', author: 'ＣＬＡＭＰ' }),
    [],
  );
  assert.deepEqual(
    detectTitleAnomalies({ title: '経済数学の直観的方法 マクロ経済学編', author: '長沼伸一郎' }),
    [],
  );
  assert.deepEqual(
    detectTitleAnomalies({ title: '一度読んだら絶対に忘れない世界史の教科書 経済編', author: '山﨑圭一' }),
    [],
  );
});

test('detects creator appended to a title when the catalog already knows the author', () => {
  const reasons = detectTitleAnomalies({ title: 'Animal Farm オーウェル', author: 'オーウェル' });
  assert.ok(reasons.includes('author_appended_to_title'));
});

test('does not flag an ordinary or already-normalized title', () => {
  assert.deepEqual(detectTitleAnomalies({ title: '22世紀の民主主義', author: '成田悠輔' }), []);
  assert.deepEqual(
    detectTitleAnomalies({ title: 'To LOVEる―とらぶる―', author: '矢吹健太朗, 長谷見沙貴' }),
    [],
  );
});

test('audit output contains only candidates and prioritizes multi-reason rows', () => {
  const rows = auditTitleAnomalies([
    { work_id: 'a', title: '普通の本', author: null },
    { work_id: 'b', title: '作品名(1) (コミックス)', author: null },
    { work_id: 'c', title: '作品名 Kindle版', author: null },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].work_id, 'b');
  assert.ok(rows[0].reasons.length >= rows[1].reasons.length);
});
