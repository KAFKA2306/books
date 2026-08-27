import { loadCatalog } from './load-catalog.mjs';
import { auditHoldingDuplicates } from '../src/holding-duplicate-audit.mjs';

const catalog = await loadCatalog();
const audit = auditHoldingDuplicates(catalog.holdings);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(audit, null, 2));
} else {
  const { summary } = audit;
  console.log(`possible cross-source Kindle holding duplicates: ${summary.candidate_group_count} groups / ${summary.candidate_holding_count} holdings`);
  console.log(`candidate quantity represented: ${summary.candidate_quantity}`);
  console.log(`quantity conflicts requiring source review: ${summary.conflict_group_count} groups / ${summary.conflict_holding_count} holdings`);
  console.log(`ASIN-backed duplicate candidate groups: ${summary.asin_backed_group_count}`);
  for (const row of audit.candidates) {
    console.log(`${row.work_id}\t${row.acquired_at}\t${row.holding_count} holdings\t${row.sources.join(' + ')}\t${row.edition_ids.join(',')}`);
  }
  for (const row of audit.conflicts) {
    console.log(`UNVERIFIED\t${row.work_id}\t${row.acquired_at}\tquantity ${row.legacy_kindle_quantity} vs ${row.amazon_xml_quantity}\t${row.edition_ids.join(',')}`);
  }
}
