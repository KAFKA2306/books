import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { dedupeKindleRecords, loadCompactKindleMetadata } from '../src/kindle-storage.mjs';

const record = {
  ordinal: 7,
  asin: 'B000000001',
  title: 'Test Book',
  authors: ['Author'],
  publishers: ['Publisher'],
  publication_date: '2025-01-01T00:00:00Z',
  acquired_at: '2025-02-01T00:00:00Z',
  origin_type: 'purchase',
  cde_contenttype: 'EBOK',
  content_type: 'application/x-mobipocket-ebook',
  textbook_type: null,
};

test('exact duplicate Kindle records collapse and ordinals are reassigned', () => {
  const rows = dedupeKindleRecords([record, { ...record, ordinal: 8 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ordinal, 1);
});

test('different acquisition semantics are not collapsed', () => {
  const rows = dedupeKindleRecords([
    record,
    { ...record, ordinal: 8, origin_type: 'sample', acquired_at: '2025-01-01T00:00:00Z', cde_contenttype: 'EBSP' },
  ]);
  assert.equal(rows.length, 2);
});

test('compact NDJSON snapshot inflates to canonical Kindle records', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kafka-books-kindle-'));
  const dir = path.join(root, 'data', 'kindle');
  await fs.mkdir(dir, { recursive: true });
  const fields = ['record_id','asin','title','authors','publishers','publication_date','acquired_at','cde_contenttype','content_type','acquisition_type'];
  const row = ['knd_test','B000000001','Test Book',['Author'],['Publisher'],'2025-01-01T00:00:00Z','2025-02-01T00:00:00Z','EBOK','application/x-mobipocket-ebook','Purchase'];
  const content = `${JSON.stringify(row)}\n`;
  const crypto = await import('node:crypto');
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const manifest = {
    storage: 'compact-ndjson-array', fields, record_count: 1, unique_asin_count: 1,
    parts: [{ name: 'records-01.ndjson', records: 1, bytes: Buffer.byteLength(content), sha256 }],
  };
  await fs.writeFile(path.join(dir, 'records-01.ndjson'), content);
  const loaded = await loadCompactKindleMetadata(root, manifest);
  assert.equal(loaded.records.length, 1);
  assert.equal(loaded.records[0].ordinal, 1);
  assert.equal(loaded.records[0].origin_type, 'purchase');
  assert.equal(loaded.records[0].asin, 'B000000001');
});
