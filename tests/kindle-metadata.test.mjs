import assert from 'node:assert/strict';
import test from 'node:test';
import { titleKey } from '../src/catalog.mjs';
import { mergeKindleCatalog, parseKindleMetadataXml } from '../src/kindle-metadata.mjs';

const xml = `This XML file does not appear to have any style information associated with it.
<response>
<sync_time>2026-06-06T03:50:42+0000;softwareVersion:70980;SE:F</sync_time>
<add_update_list>
<meta_data>
<ASIN>B000000001</ASIN><title>Test Book</title>
<authors><author>Author A</author></authors>
<publishers><publisher>Avid Reader Press / Simon & Schuster</publisher></publishers>
<publication_date>2025-01-01T00:00:00+0000</publication_date>
<purchase_date>2025-02-01T00:00:00+0000</purchase_date>
<cde_contenttype>EBOK</cde_contenttype><content_type>application/x-mobipocket-ebook</content_type>
<origins><origin><type>Purchase</type></origin></origins>
</meta_data>
<meta_data>
<ASIN>B000000001</ASIN><title>Test Book</title>
<authors><author>Author A</author></authors>
<publishers><publisher>Avid Reader Press / Simon & Schuster</publisher></publishers>
<publication_date>2025-01-01T00:00:00+0000</publication_date>
<purchase_date>2025-01-01T00:00:00+0000</purchase_date>
<cde_contenttype>EBSP</cde_contenttype><content_type>application/x-mobipocket-ebook</content_type>
<origins><origin><type>Sample</type></origin></origins>
</meta_data>
<meta_data>
<ASIN>B000000002</ASIN><title>Prime Only Book</title>
<authors><author>Author B</author></authors>
<publishers><publisher>Publisher B</publisher></publishers>
<purchase_date>2025-03-01T00:00:00+0000</purchase_date>
<cde_contenttype>EBOK</cde_contenttype><content_type>application/x-mobipocket-ebook</content_type>
<origins><origin><type>Prime</type></origin></origins>
</meta_data>
</add_update_list>
</response>`;

test('Kindle parser tolerates raw ampersands and preserves source semantics', () => {
  const parsed = parseKindleMetadataXml(xml);
  assert.equal(parsed.sync_time, '2026-06-06T03:50:42Z');
  assert.equal(parsed.source_software_version, '70980');
  assert.equal(parsed.records.length, 3);
  assert.equal(parsed.records[0].publishers[0], 'Avid Reader Press / Simon & Schuster');
  assert.equal(parsed.records[0].origin_type, 'purchase');
  assert.equal(parsed.records[1].origin_type, 'sample');
  assert.equal(parsed.records[2].origin_type, 'prime');
});

test('Purchase becomes a holding while Sample and Prime remain access history only', () => {
  const parsed = parseKindleMetadataXml(xml);
  const workId = 'wrk_111111111111';
  const catalog = {
    stats: {
      input_count: 1,
      work_count: 1,
      edition_count: 1,
      holding_count: 1,
      merged_input_count: 0,
      isbn_verified_count: 0,
      untracked_count: 1,
    },
    works: [{
      work_id: workId,
      title: 'Test Book',
      title_key: titleKey('Test Book'),
      author: null,
      category: 'test',
      status: 'untracked',
      progress: null,
      rating: null,
      price_yen: null,
      acquired_at: null,
      item_count: 1,
      isbn_count: 0,
      isbn_status: 'missing',
      sources: ['Kindleスクリーンショット'],
      formats: ['Kindle'],
    }],
    editions: [{
      edition_id: `kindle:${workId}`,
      id_kind: 'source_scoped',
      work_id: workId,
      isbn13: null,
      verification: 'unverified',
      format: 'Kindle',
    }],
    holdings: [{
      holding_id: 'hld_legacy',
      work_id: workId,
      edition_id: `kindle:${workId}`,
      source: 'Kindleスクリーンショット',
      format: 'Kindle',
      quantity: 1,
    }],
  };

  const merged = mergeKindleCatalog(catalog, { records: parsed.records });
  assert.equal(merged.acquisitions.length, 3);
  assert.equal(merged.kindle_items.length, 2);
  assert.equal(merged.holdings.filter((row) => row.source === 'Amazon Kindle XML').length, 1);
  assert.equal(merged.holdings.some((row) => row.source === 'Kindleスクリーンショット'), false);
  assert.equal(merged.editions.some((row) => row.edition_id === 'asin:B000000001'), true);
  assert.equal(merged.editions.some((row) => row.edition_id === 'asin:B000000002'), false);
  assert.equal(merged.kindle_items.find((row) => row.asin === 'B000000002').owned, false);
  assert.equal(merged.stats.kindle_replaced_screenshot_holding_count, 1);
});
