import fs from 'node:fs/promises';
import path from 'node:path';
import {
  applyMigrationReviewObservations,
  buildMigrationReviewObservationTemplate,
} from '../src/migration-review-observation.mjs';

const args = process.argv.slice(2);
const initMode = args[0] === '--init';
const reportPath = initMode ? args[1] : args[0];
const observationsPath = initMode ? args[2] : args[1];
const outputPath = initMode ? null : (args[2] ?? reportPath);

if (!reportPath || !observationsPath) {
  console.error([
    'Usage:',
    '  npm run migration:measure-review -- --init <report.json> <observations.json>',
    '  npm run migration:measure-review -- <report.json> <observations.json> [output.json]',
  ].join('\n'));
  process.exit(2);
}

const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));

if (initMode) {
  const observations = buildMigrationReviewObservationTemplate(report);
  await fs.mkdir(path.dirname(observationsPath), { recursive: true });
  await fs.writeFile(observationsPath, `${JSON.stringify(observations, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ bibliographic_review_rows: observations.length }, null, 2));
  console.log(`Wrote ${observationsPath}`);
  process.exit(0);
}

const observations = JSON.parse(await fs.readFile(observationsPath, 'utf8'));
const measured = applyMigrationReviewObservations(report, observations);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(measured, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(measured.summary.review_measurement, null, 2));
console.log(`Wrote ${outputPath}`);
