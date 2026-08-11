import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './load-catalog.mjs';
import { diagnoseMigration, parseCsv, renderDiagnosisHtml } from '../src/migration-diagnosis.mjs';

const inputPath = process.argv[2];
const outputDir = process.argv[3] ?? 'artifacts/migration-diagnosis';
if (!inputPath) {
  console.error('Usage: npm run migration:diagnose -- <input.csv> [output-dir]');
  process.exit(2);
}
if (path.extname(inputPath).toLowerCase() !== '.csv') {
  console.error('MVP supports CSV input only.');
  process.exit(2);
}

const input = await fs.readFile(inputPath, 'utf8');
const rows = parseCsv(input);
const catalog = await loadCatalog();
const report = diagnoseMigration(rows, catalog);
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(outputDir, 'report.html'), renderDiagnosisHtml(report), 'utf8');
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Wrote ${path.join(outputDir, 'report.json')} and ${path.join(outputDir, 'report.html')}`);
