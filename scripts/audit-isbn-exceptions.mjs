import fs from 'node:fs/promises';
import path from 'node:path';
import { loadIsbnOverlay } from './load-catalog.mjs';
import { auditIsbnExceptions } from '../src/isbn-exception-audit.mjs';

const root = process.cwd();
const report = JSON.parse(
  await fs.readFile(path.join(root, 'data/isbn-enrichment-report.json'), 'utf8'),
);
const sourceNeeds = JSON.parse(
  await fs.readFile(path.join(root, 'data/isbn-exception-source-needs.json'), 'utf8'),
);
const audit = auditIsbnExceptions(report, await loadIsbnOverlay(root), sourceNeeds);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(audit, null, 2));
} else {
  console.log(JSON.stringify(audit.summary));
  for (const record of audit.unresolved) {
    const need = record.required_metadata.length
      ? `\tneeds:${record.required_metadata.join(',')}`
      : '';
    console.log(`${record.work_id}\t${record.historical_outcome}\t${record.title}${need}`);
  }
}
