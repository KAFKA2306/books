import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog, loadIsbnOverlay } from './load-catalog.mjs';
import { auditHoldingDuplicates } from '../src/holding-duplicate-audit.mjs';
import { auditIsbnExceptions } from '../src/isbn-exception-audit.mjs';
import { auditTitleAnomalies } from '../src/title-anomaly-audit.mjs';

const root = process.cwd();
const catalog = await loadCatalog(root);

const titleRows = auditTitleAnomalies(catalog.works);
const titleReasonCounts = new Map();
for (const row of titleRows) {
  for (const reason of row.reasons) {
    titleReasonCounts.set(reason, (titleReasonCounts.get(reason) ?? 0) + 1);
  }
}

const holdingAudit = auditHoldingDuplicates(catalog.holdings);
const isbnReport = JSON.parse(
  await fs.readFile(path.join(root, 'data/isbn-enrichment-report.json'), 'utf8'),
);
const isbnSourceNeeds = JSON.parse(
  await fs.readFile(path.join(root, 'data/isbn-exception-source-needs.json'), 'utf8'),
);
const isbnAudit = auditIsbnExceptions(
  isbnReport,
  await loadIsbnOverlay(root),
  isbnSourceNeeds,
);

const state = {
  catalog: {
    works: catalog.works.length,
    editions: catalog.editions.length,
    holdings: catalog.holdings.length,
    acquisitions: (catalog.acquisitions ?? []).length,
    kindle_records: (catalog.kindle_records ?? []).length,
  },
  title_anomalies: {
    count: titleRows.length,
    reasons: Object.fromEntries(
      [...titleReasonCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    ),
    next: titleRows.slice(0, 3).map((row) => ({
      work_id: row.work_id,
      title: row.title,
      author: row.author ?? null,
      reasons: row.reasons,
    })),
  },
  isbn_exceptions: isbnAudit.summary,
  holding_duplicates: holdingAudit.summary,
  drill_down: {
    title: 'npm run title:audit',
    title_batch: 'npm run title:review-batch:json',
    isbn: 'npm run isbn:exception-audit:json',
    holdings: 'npm run holding:duplicate-audit:json',
    migration_identity: 'npm run migration:identity-audit:json',
    category_consistency: 'npm run category:consistency-audit:json',
  },
};

console.log(JSON.stringify(state, null, 2));
