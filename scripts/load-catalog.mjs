import fs from 'node:fs/promises';
import path from 'node:path';
import { applyCategoryEnrichments } from '../src/category-enrichment.mjs';
import { applyIsbnEnrichments } from '../src/isbn-enrichment.mjs';
import { deriveLibraryClassifications } from '../src/library-classification.mjs';
import { mergeIssueCatalog } from '../src/merge-catalog.mjs';
import { loadKindleMetadata, mergeKindleCatalog } from '../src/kindle-metadata.mjs';
import { loadCompactKindleMetadata } from '../src/kindle-storage.mjs';
import { applyTitleNormalizations } from '../src/title-normalization.mjs';
import { applyWorkMerges } from '../src/work-merge.mjs';

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readJsonDirectoryIfPresent(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const filenames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();
    return Promise.all(
      filenames.map((filename) => readJsonIfPresent(path.join(dirPath, filename))),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function mergeIsbnOverlays(...overlays) {
  const recordsByWork = new Map();
  for (const overlay of overlays) {
    for (const record of overlay?.records ?? []) {
      const existing = recordsByWork.get(record.work_id);
      if (existing && existing.isbn13 !== record.isbn13) {
        throw new Error(`Conflicting ISBN evidence for ${record.work_id}`);
      }
      recordsByWork.set(record.work_id, record);
    }
  }
  return {
    schema: 'kafka.books.isbn-enrichments.v1',
    records: [...recordsByWork.values()].sort((a, b) => a.work_id.localeCompare(b.work_id)),
  };
}

export async function loadIsbnOverlay(root = process.cwd()) {
  const automated = JSON.parse(
    await fs.readFile(path.join(root, 'data/isbn-enrichments.json'), 'utf8'),
  );
  const primaryPartitions = await readJsonDirectoryIfPresent(
    path.join(root, 'data/isbn-primary-verifications'),
  );
  return mergeIsbnOverlays(automated, ...primaryPartitions);
}

export function mergeCategoryOverlays(automated, ...primaryOverlays) {
  const recordsByWork = new Map();
  for (const overlay of [...primaryOverlays, automated]) {
    for (const record of overlay?.records ?? []) {
      const existing = recordsByWork.get(record.work_id);
      if (existing) {
        const sameClassification = existing.ndc_scheme === record.ndc_scheme
          && existing.ndc_code === record.ndc_code
          && existing.category === record.category;
        if (!sameClassification) {
          throw new Error(`Conflicting category evidence for ${record.work_id}`);
        }
        continue;
      }
      recordsByWork.set(record.work_id, record);
    }
  }
  return {
    schema: 'kafka.books.category-enrichments.v1',
    rule_version: 'ndc-map-v1',
    records: [...recordsByWork.values()].sort((a, b) => a.work_id.localeCompare(b.work_id)),
  };
}

export function mergeTitleNormalizationOverlays(...overlays) {
  return {
    schema: 'kafka.books.title-normalizations.v1',
    records: overlays.flatMap((overlay) => overlay?.records ?? []),
  };
}

export function mergeWorkMergeOverlays(...overlays) {
  return {
    schema: 'kafka.books.work-merges.v1',
    records: overlays.flatMap((overlay) => overlay?.records ?? []),
  };
}

export async function loadCatalog(root = process.cwd()) {
  const base = JSON.parse(
    await fs.readFile(path.join(root, 'data/catalog.json'), 'utf8'),
  );
  const issueData = JSON.parse(
    await fs.readFile(path.join(root, 'data/issue-1-books.json'), 'utf8'),
  );

  let merged = mergeIssueCatalog(base, issueData);
  const kindleManifest = await readJsonIfPresent(path.join(root, 'data/kindle/manifest.json'));
  if (kindleManifest) {
    const kindleData = kindleManifest.storage === 'compact-ndjson-array'
      ? await loadCompactKindleMetadata(root, kindleManifest)
      : await loadKindleMetadata(root);
    merged = mergeKindleCatalog(merged, kindleData);
  }

  merged = applyIsbnEnrichments(merged, await loadIsbnOverlay(root));

  const automatedCategoryOverlay = await readJsonIfPresent(path.join(root, 'data/category-enrichments.json')) ?? {
    schema: 'kafka.books.category-enrichments.v1',
    rule_version: 'ndc-map-v1',
    records: [],
  };
  const primaryCategoryPartitions = await readJsonDirectoryIfPresent(
    path.join(root, 'data/category-primary-verifications'),
  );
  const categoryOverlay = mergeCategoryOverlays(
    automatedCategoryOverlay,
    ...primaryCategoryPartitions,
  );
  merged = applyCategoryEnrichments(merged, categoryOverlay);

  const titlePartitions = await readJsonDirectoryIfPresent(
    path.join(root, 'data/title-normalizations'),
  );
  merged = applyTitleNormalizations(
    merged,
    mergeTitleNormalizationOverlays(...titlePartitions),
  );
  merged = deriveLibraryClassifications(merged, categoryOverlay);

  const workMergePartitions = await readJsonDirectoryIfPresent(
    path.join(root, 'data/work-merges'),
  );
  return applyWorkMerges(
    merged,
    mergeWorkMergeOverlays(...workMergePartitions),
  );
}
