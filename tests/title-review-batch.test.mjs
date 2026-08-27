import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTitleReviewBatch, deriveReviewBaseTitle } from '../src/title-review-batch.mjs';

test('deriveReviewBaseTitle removes reviewable volume, commercial, and imprint metadata', () => {
  assert.equal(deriveReviewBaseTitle('カノジョも彼女(1) (週刊少年マガジンコミックス)'), 'カノジョも彼女');
  assert.equal(deriveReviewBaseTitle('ローカル女子の遠吠え【電子限定版】 1巻 (まんがタイムコミックス)'), 'ローカル女子の遠吠え');
  assert.equal(deriveReviewBaseTitle('【先行試し読み】四季崎姉妹はあばかれたい (ヤングジャンプコミックスDIGITAL)'), '四季崎姉妹はあばかれたい');
});

test('buildTitleReviewBatch groups same base title and author for one review', () => {
  const batch = buildTitleReviewBatch([
    { work_id: 'wrk_1', title: '作品(1) (コミックス)', author: '著者A', reasons: ['volume_metadata'] },
    { work_id: 'wrk_2', title: '作品(2) (コミックス)', author: '著者A', reasons: ['volume_metadata'] },
    { work_id: 'wrk_3', title: '作品(1) (コミックス)', author: '著者B', reasons: ['volume_metadata'] },
  ]);

  assert.equal(batch.schema, 'kafka.books.title-review-batch.v1');
  assert.equal(batch.candidate_count, 3);
  assert.equal(batch.excluded_candidate_count, 0);
  assert.equal(batch.group_count, 2);
  assert.equal(batch.multi_work_group_count, 1);
  assert.equal(batch.groups[0].base_title, '作品');
  assert.equal(batch.groups[0].author, '著者A');
  assert.deepEqual(batch.groups[0].members.map((member) => member.work_id), ['wrk_1', 'wrk_2']);
  assert.equal(batch.groups[1].review_type, 'single_candidate');
});

test('batch generation is advisory and preserves original candidate titles', () => {
  const original = '作品【電子限定版】 1巻 (コミックス)';
  const batch = buildTitleReviewBatch([
    { work_id: 'wrk_1', title: original, author: '著者A', reasons: ['commercial_annotation'] },
  ]);
  assert.equal(batch.groups[0].members[0].title, original);
  assert.equal(batch.groups[0].base_title, '作品');
});

test('buildTitleReviewBatch excludes work ids already covered by normalization evidence', () => {
  const batch = buildTitleReviewBatch([
    { work_id: 'wrk_existing', title: '既存作品(1) (コミックス)', author: '著者A', reasons: ['volume_metadata'] },
    { work_id: 'wrk_new', title: '新規作品(1) (コミックス)', author: '著者B', reasons: ['volume_metadata'] },
  ], {
    excludedWorkIds: new Set(['wrk_existing']),
  });

  assert.equal(batch.candidate_count, 1);
  assert.equal(batch.excluded_candidate_count, 1);
  assert.deepEqual(batch.groups.flatMap((group) => group.members.map((member) => member.work_id)), ['wrk_new']);
});
