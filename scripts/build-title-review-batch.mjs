import { loadCatalog } from './load-catalog.mjs';
import { auditTitleAnomalies } from '../src/title-anomaly-audit.mjs';
import { buildTitleReviewBatch } from '../src/title-review-batch.mjs';

const catalog = await loadCatalog();
const rows = auditTitleAnomalies(catalog.works);
const batch = buildTitleReviewBatch(rows);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(batch, null, 2));
} else {
  console.log(`title review batch: ${batch.candidate_count} candidates / ${batch.group_count} groups / ${batch.multi_work_group_count} multi-work groups`);
  for (const group of batch.groups) {
    console.log(`${group.member_count}\t${group.review_type}\t${group.base_title}\t${group.author ?? ''}`);
    for (const member of group.members) {
      console.log(`  ${member.work_id}\t${member.reasons.join(',')}\t${member.title}`);
    }
  }
}
