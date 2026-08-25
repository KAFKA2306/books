import { cleanSpace } from './catalog.mjs';

function evidenceKey(value) {
  return cleanSpace(value ?? '').toLocaleLowerCase('ja').replace(/[\s・･,，、]/g, '');
}

function exactKey(value) {
  return cleanSpace(value ?? '').toLocaleLowerCase('ja');
}

function uniqueWithin(group, selector, work) {
  const target = selector(work);
  if (!target) return false;
  return group.filter((candidate) => selector(candidate) === target).length === 1;
}

export function auditMigrationIdentityEvidence(works = []) {
  const byTitleKey = new Map();
  for (const work of works) {
    const key = String(work?.title_key ?? '').trim();
    if (!key) continue;
    const group = byTitleKey.get(key) ?? [];
    group.push(work);
    byTitleKey.set(key, group);
  }

  const groups = [];
  for (const [title_key, members] of byTitleKey) {
    if (members.length < 2) continue;
    const auditedWorks = members.map((work) => {
      const authorPresent = Boolean(evidenceKey(work.author));
      const workTypePresent = Boolean(exactKey(work.work_type));
      const authorUnique = uniqueWithin(members, (candidate) => evidenceKey(candidate.author), work);
      const workTypeUnique = uniqueWithin(members, (candidate) => exactKey(candidate.work_type), work);
      const combinedUnique = authorPresent && workTypePresent && uniqueWithin(
        members,
        (candidate) => `${evidenceKey(candidate.author)}\u0000${exactKey(candidate.work_type)}`,
        work,
      );
      const resolvable = authorUnique || workTypeUnique || combinedUnique;
      return {
        work_id: work.work_id,
        title: work.title,
        author: work.author ?? null,
        work_type: work.work_type ?? null,
        author_present: authorPresent,
        work_type_present: workTypePresent,
        author_unique: authorUnique,
        work_type_unique: workTypeUnique,
        combined_unique: combinedUnique,
        resolvable_with_supported_evidence: resolvable,
      };
    });
    groups.push({
      title_key,
      title: members[0]?.title ?? null,
      work_count: members.length,
      works: auditedWorks,
    });
  }

  groups.sort((a, b) => b.work_count - a.work_count || String(a.title).localeCompare(String(b.title), 'ja'));
  const auditedWorks = groups.flatMap((group) => group.works);
  const count = (predicate) => auditedWorks.filter(predicate).length;

  return {
    schema: 'kafka.books.migration-identity-evidence-audit.v1',
    summary: {
      total_works: works.length,
      ambiguous_title_groups: groups.length,
      ambiguous_works: auditedWorks.length,
      title_only_resolvable: 0,
      author_present: count((work) => work.author_present),
      author_unique_resolvable: count((work) => work.author_unique),
      work_type_present: count((work) => work.work_type_present),
      work_type_unique_resolvable: count((work) => work.work_type_unique),
      combined_unique_resolvable: count((work) => work.combined_unique),
      supported_evidence_resolvable: count((work) => work.resolvable_with_supported_evidence),
      unresolved_after_supported_evidence: count((work) => !work.resolvable_with_supported_evidence),
    },
    groups,
  };
}
