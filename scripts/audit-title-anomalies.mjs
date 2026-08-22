import { loadCatalog } from './load-catalog.mjs';
import { auditTitleAnomalies } from '../src/title-anomaly-audit.mjs';

const catalog = await loadCatalog();
const rows = auditTitleAnomalies(catalog.works);
const reasonCounts = new Map();
for (const row of rows) {
  for (const reason of row.reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
}

console.log(`bibliographic title anomaly candidates: ${rows.length} / ${catalog.works.length} works`);
for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
  console.log(`  ${reason}: ${count}`);
}

for (const row of rows) {
  console.log(`${row.reasons.join(',')}\t${row.work_id}\t${row.title}${row.author ? `\t${row.author}` : ''}`);
}
