import fs from 'node:fs/promises';
import path from 'node:path';
import { applyMigrationReviewObservations } from '../src/migration-review-observation.mjs';

const reportPath = process.argv[2];
const observationsPath = process.argv[3];
const outputPath = process.argv[4] ?? reportPath;

if (!reportPath || !observationsPath) {
  console.error('Usage: npm run migration:measure-review -- <report.json> <observations.json> [output.json]');
  process.exit(2);
}

const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const observations = JSON.parse(await fs.readFile(observationsPath, 'utf8'));
const measured = applyMigrationReviewObservations(report, observations);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(measured, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(measured.summary.review_measurement, null, 2));
console.log(`Wrote ${outputPath}`);
