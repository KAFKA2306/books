const CLASS_URI = /(?:rdf:resource|resource)=["'](https?:\/\/id\.ndl\.go\.jp\/class\/(ndc10|ndc9|ndlc)\/([^"'<>]+))["']/gi;

export function normalizeClassificationCode(value) {
  const text = String(value ?? '').trim();
  return text ? decodeURIComponent(text) : null;
}

export function parseNdlClassifications(xml) {
  const records = [];
  const seen = new Set();
  for (const match of String(xml).matchAll(CLASS_URI)) {
    const uri = match[1];
    const scheme_id = match[2].toLowerCase();
    const code = normalizeClassificationCode(match[3]);
    if (!code) continue;
    const key = `${scheme_id}\t${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({ scheme_id, code, uri });
  }
  return records;
}

export function applyClassificationOverlay(catalog, overlay) {
  const classifications = Array.isArray(overlay?.records) ? overlay.records : [];
  const classification_schemes = Array.isArray(overlay?.classification_schemes)
    ? overlay.classification_schemes
    : [];
  const ndc10_main_classes = Array.isArray(overlay?.ndc10_main_classes)
    ? overlay.ndc10_main_classes
    : [];

  const classifiedWorks = new Set(classifications.map((row) => row.work_id).filter(Boolean));
  const ndc10Works = new Set(
    classifications.filter((row) => row.scheme_id === 'ndc10').map((row) => row.work_id).filter(Boolean),
  );

  return {
    ...catalog,
    stats: {
      ...catalog.stats,
      classification_record_count: classifications.length,
      classified_work_count: classifiedWorks.size,
      ndc10_classified_work_count: ndc10Works.size,
    },
    classifications,
    classification_schemes,
    ndc10_main_classes,
  };
}

export function ndc10MainClass(code, mainClasses = []) {
  const normalized = normalizeClassificationCode(code);
  if (!normalized || !/^\d/.test(normalized)) return null;
  const mainCode = normalized[0];
  return mainClasses.find((entry) => entry.code === mainCode) ?? { code: mainCode, label: null, label_en: null };
}
