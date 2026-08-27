import test from 'node:test';
import assert from 'node:assert/strict';
import { auditIsbnExceptions } from '../src/isbn-exception-audit.mjs';

const emptySourceNeeds = {
  schema: 'kafka.books.isbn-exception-source-needs.v1',
  records: [],
};

test('ISBN exception audit subtracts resolved overlays without rewriting historical outcomes', () => {
  const audit = auditIsbnExceptions({
    schema: 'kafka.books.isbn-enrichment-report.v1',
    generated_at: '2026-08-25T00:00:00Z',
    results: [
      { work_id: 'a', title: 'A', outcome: 'no_candidate' },
      { work_id: 'b', title: 'B', outcome: 'no_consensus' },
      { work_id: 'c', title: 'C', outcome: 'accepted' },
    ],
  }, {
    schema: 'kafka.books.isbn-enrichments.v1',
    records: [{
      work_id: 'a',
      isbn13: '9784102113417',
      verified_at: '2026-08-27T00:00:00Z',
      sources: [{ provider: 'ndl', url: 'https://ndl.example/a' }],
    }],
  }, emptySourceNeeds);

  assert.deepEqual(audit.summary, {
    historical_exception_count: 2,
    resolved_count: 1,
    unresolved_count: 1,
    needs_source_detail_count: 0,
    untriaged_count: 1,
    resolution_rate: 0.5,
  });
  assert.equal(audit.records[0].historical_outcome, 'no_candidate');
  assert.equal(audit.records[0].status, 'resolved');
  assert.equal(audit.records[0].isbn13, '9784102113417');
  assert.deepEqual(audit.unresolved.map((record) => record.work_id), ['b']);
});

test('ISBN exception audit preserves null semantics for unresolved records', () => {
  const audit = auditIsbnExceptions({
    schema: 'kafka.books.isbn-enrichment-report.v1',
    results: [{ work_id: 'a', title: 'A', outcome: 'provider_error' }],
  }, {
    schema: 'kafka.books.isbn-enrichments.v1',
    records: [],
  }, emptySourceNeeds);

  assert.equal(audit.unresolved[0].isbn13, null);
  assert.equal(audit.unresolved[0].verified_at, null);
  assert.deepEqual(audit.unresolved[0].sources, []);
  assert.equal(audit.unresolved[0].current_metadata_sufficient_for_isbn_resolution, null);
  assert.deepEqual(audit.unresolved[0].required_metadata, []);
});

test('ISBN exception audit separates records that need source detail from untriaged records', () => {
  const audit = auditIsbnExceptions({
    schema: 'kafka.books.isbn-enrichment-report.v1',
    results: [
      { work_id: 'a', title: 'A', outcome: 'no_candidate' },
      { work_id: 'b', title: 'B', outcome: 'no_candidate' },
    ],
  }, {
    schema: 'kafka.books.isbn-enrichments.v1',
    records: [],
  }, {
    schema: 'kafka.books.isbn-exception-source-needs.v1',
    records: [{
      work_id: 'a',
      title: 'A',
      current_metadata_sufficient_for_isbn_resolution: false,
      required_metadata: ['volume'],
      reason: 'multiple volumes exist',
      sources: ['https://publisher.example/a'],
    }],
  });

  assert.equal(audit.summary.unresolved_count, 2);
  assert.equal(audit.summary.needs_source_detail_count, 1);
  assert.equal(audit.summary.untriaged_count, 1);
  assert.deepEqual(audit.needs_source_detail.map((record) => record.work_id), ['a']);
  assert.deepEqual(audit.untriaged.map((record) => record.work_id), ['b']);
  assert.equal(audit.needs_source_detail[0].current_metadata_sufficient_for_isbn_resolution, false);
  assert.deepEqual(audit.needs_source_detail[0].required_metadata, ['volume']);
});
