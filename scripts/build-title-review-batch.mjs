import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog, mergeTitleNormalizationOverlays } from './load-catalog.mjs';
import { auditTitleAnomalies } from '../src/title-anomaly-audit.mjs';
import { buildTitleReviewBatch } from '../src/title-review-batch.mjs';

async function loadNormalizedWorkIds(root = process.cwd()) {
  const dir = path.join(root, 'data/title-normalizations');
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const overlays = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => fs.readFile(path.join(dir, entry.name), 'utf8').then(JSON.parse)));
  const merged = mergeTitleNormalizationOverlays(...overlays);
  return new Set(merged.records.map((record) => record.work_id));
}

const catalog = await loadCatalog();
const rows = auditTitleAnomalies(catalog.works);
const normalizedWorkIds = await loadNormalizedWorkIds();
const batch = buildTitleReviewBatch(rows, { excludedWorkIds: normalizedWorkIds });

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(batch, null, 2));
} else {
  console.log(`title review batch: ${batch.candidate_count} candidates / ${batch.group_count} groups / ${batch.multi_work_group_count} multi-work groups / ${batch.excluded_candidate_count} already normalized excluded`);
  for (const group of batch.groups) {
    console.log(`${group.member_count}\t${group.review_type}\t${group.base_title}\t${group.author ?? ''}`);
    for (const member of group.members) {
      console.log(`  ${member.work_id}\t${member.reasons.join(',')}\t${member.title}`);
    }
  }
}
