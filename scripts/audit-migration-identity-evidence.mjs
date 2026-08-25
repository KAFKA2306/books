import { loadCatalog } from './load-catalog.mjs';
import { auditMigrationIdentityEvidence } from '../src/migration-identity-evidence-audit.mjs';

const report = auditMigrationIdentityEvidence((await loadCatalog()).works);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const s = report.summary;
  console.log(`migration identity evidence audit: ${s.ambiguous_title_groups} ambiguous title groups / ${s.ambiguous_works} works`);
  console.log(`  title only: ${s.title_only_resolvable}/${s.ambiguous_works} resolvable`);
  console.log(`  author unique: ${s.author_unique_resolvable}/${s.ambiguous_works}`);
  console.log(`  work_type unique: ${s.work_type_unique_resolvable}/${s.ambiguous_works}`);
  console.log(`  supported evidence: ${s.supported_evidence_resolvable}/${s.ambiguous_works}`);
  console.log(`  unresolved: ${s.unresolved_after_supported_evidence}/${s.ambiguous_works}`);
  for (const group of report.groups) {
    console.log(`${group.title_key}\t${group.work_count}\t${group.works.map((work) => `${work.work_id}:${work.work_type ?? '-'}:${work.author ?? '-'}`).join('\t')}`);
  }
}
