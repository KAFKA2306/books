import assert from 'node:assert/strict';
import test from 'node:test';
import { applyKindleMetadata, buildKindleSnapshot, normalizeKindleWorkTitle, parseKindleMetadataText } from '../src/kindle-import.mjs';

const copiedXml = `This XML file does not appear to have any style information associated with it.
<response><sync_time>2026-06-06T03:50:42+0000;softwareVersion:1;ST:SECRET</sync_time><add_update_list>
<meta_data><ASIN>B000000001</ASIN><title>Example & Test（１） (週刊コミックス)</title><authors><author>A</author></authors><publishers><publisher>P & Q</publisher></publishers><publication_date>2025-01-01T00:00:00+0000</publication_date><purchase_date>2026-01-01T00:00:00+0000</purchase_date><cde_contenttype>EBSP</cde_contenttype><content_type>application/x-mobipocket-ebook</content_type><origins><origin><type>Sample</type></origin></origins></meta_data>
<meta_data><ASIN>B000000001</ASIN><title>Example & Test（１） (週刊コミックス)</title><authors><author>A</author></authors><publishers><publisher>P & Q</publisher></publishers><publication_date>2025-01-01T00:00:00+0000</publication_date><purchase_date>2026-01-02T00:00:00+0000</purchase_date><cde_contenttype>EBOK</cde_contenttype><content_type>application/x-mobipocket-ebook</content_type><origins><origin><type>Purchase</type></origin></origins></meta_data>
<meta_data><ASIN>B000000001</ASIN><title>Example & Test（１） (週刊コミックス)</title><authors><author>A</author></authors><publishers><publisher>P & Q</publisher></publishers><publication_date>2025-01-01T00:00:00+0000</publication_date><purchase_date>2026-01-02T00:00:00+0000</purchase_date><cde_contenttype>EBOK</cde_contenttype><content_type>application/x-mobipocket-ebook</content_type><origins><origin><type>Purchase</type></origin></origins></meta_data>
<meta_data><ASIN>B000000002</ASIN><title>相場サイクルの見分け方<新装版></title><authors/><publishers><publisher>日経BP</publisher></publishers><publication_date/><purchase_date>2026-02-01T00:00:00+0000</purchase_date><cde_contenttype>EBSP</cde_contenttype><content_type>application/x-mobipocket-ebook</content_type><origins><origin><type>Sample</type></origin></origins></meta_data>
</add_update_list></response>`;

test('copied Kindle XML is parsed without requiring well-formed XML', () => {
  const parsed = parseKindleMetadataText(copiedXml);
  assert.equal(parsed.source_sync_time, '2026-06-06T03:50:42+0000');
  assert.equal(parsed.raw_record_count, 4);
  assert.equal(parsed.record_count, 3);
  assert.equal(parsed.records[0].title, 'Example & Test(1) (週刊コミックス)');
  assert.equal(parsed.records[0].publishers[0], 'P & Q');
  assert.equal(parsed.records[2].title, '相場サイクルの見分け方<新装版>');
});

test('same ASIN retains sample and purchase as separate acquisitions', () => {
  const snapshot = buildKindleSnapshot(parseKindleMetadataText(copiedXml));
  assert.equal(snapshot.items.length, 2);
  assert.equal(snapshot.acquisitions.length, 3);
  const item = snapshot.items.find((row) => row.asin === 'B000000001');
  assert.deepEqual(new Set(item.access_types), new Set(['Sample', 'Purchase']));
  assert.equal(item.catalog_eligible, true);
});

test('sample-only ASIN is not a catalog holding', () => {
  const base = {
    stats: { input_count: 0, work_count: 0, edition_count: 0, holding_count: 0 },
    works: [], editions: [], holdings: [],
  };
  const merged = applyKindleMetadata(base, parseKindleMetadataText(copiedXml));
  assert.equal(merged.holdings.length, 1);
  assert.equal(merged.holdings[0].source, 'Amazon Kindle');
  assert.equal(merged.editions.length, 1);
  assert.equal(merged.acquisitions.length, 3);
  assert.equal(merged.acquisitions.filter((row) => row.acquisition_type === 'sample').length, 2);
});

test('Kindle volume and imprint decorations collapse to a work title', () => {
  assert.equal(normalizeKindleWorkTitle('運動の神話　下'), '運動の神話');
  assert.equal(normalizeKindleWorkTitle('暗号解読（上）（新潮文庫）'), '暗号解読');
});
