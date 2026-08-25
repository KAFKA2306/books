import test from 'node:test';
import assert from 'node:assert/strict';
import { auditMigrationIdentityEvidence } from '../src/migration-identity-evidence-audit.mjs';

const works = [
  { work_id: 'novel', title: '同名作品', title_key: '同名作品', author: '著者A', work_type: 'text' },
  { work_id: 'comic', title: '同名作品', title_key: '同名作品', author: '著者B', work_type: 'comic' },
  { work_id: 'single', title: '別作品', title_key: '別作品', author: '著者C', work_type: 'text' },
];

test('audits only same-title work groups and measures supported identity evidence', () => {
  const report = auditMigrationIdentityEvidence(works);
  assert.deepEqual(report.summary, {
    total_works: 3,
    ambiguous_title_groups: 1,
    ambiguous_works: 2,
    title_only_resolvable: 0,
    author_present: 2,
    author_unique_resolvable: 2,
    work_type_present: 2,
    work_type_unique_resolvable: 2,
    combined_unique_resolvable: 2,
    supported_evidence_resolvable: 2,
    unresolved_after_supported_evidence: 0,
  });
  assert.equal(report.groups[0].works.length, 2);
});

test('reports unresolved works when supported evidence is absent or non-unique', () => {
  const report = auditMigrationIdentityEvidence([
    { work_id: 'a', title: '同名', title_key: '同名', author: null, work_type: null },
    { work_id: 'b', title: '同名', title_key: '同名', author: null, work_type: null },
  ]);
  assert.equal(report.summary.supported_evidence_resolvable, 0);
  assert.equal(report.summary.unresolved_after_supported_evidence, 2);
});

test('combined evidence can resolve a work when neither field is unique alone', () => {
  const report = auditMigrationIdentityEvidence([
    { work_id: 'a', title: '同名', title_key: '同名', author: '著者A', work_type: 'text' },
    { work_id: 'b', title: '同名', title_key: '同名', author: '著者A', work_type: 'comic' },
    { work_id: 'c', title: '同名', title_key: '同名', author: '著者B', work_type: 'text' },
  ]);
  const a = report.groups[0].works.find((work) => work.work_id === 'a');
  assert.equal(a.author_unique, false);
  assert.equal(a.work_type_unique, false);
  assert.equal(a.combined_unique, true);
  assert.equal(a.resolvable_with_supported_evidence, true);
});
