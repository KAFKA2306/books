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

test('detects creator appended to a title when the catalog already knows the author', () => {
  const reasons = detectTitleAnomalies({ title: 'Animal Farm オーウェル', author: 'オーウェル' });
  assert.ok(reasons.includes('author_appended_to_title'));
});

test('does not flag an ordinary title', () => {
  assert.deepEqual(detectTitleAnomalies({ title: '22世紀の民主主義', author: '成田悠輔' }), []);
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
