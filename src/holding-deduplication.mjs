const LEGACY_SOURCE = 'Kindle購入履歴';
const XML_SOURCE = 'Amazon Kindle XML';

function acquisitionDay(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/u);
  return match?.[1] ?? null;
}

function isSingleUnit(holding) {
  return Number(holding?.quantity) === 1;
}

function copyLegacyMetadata(target, legacy) {
  const preserved = [];
  for (const field of ['price_yen', 'progress', 'rating']) {
    if ((target[field] === null || target[field] === undefined) && legacy[field] !== null && legacy[field] !== undefined) {
      target[field] = legacy[field];
      preserved.push(field);
    }
  }
  return preserved;
}

export function consolidateLegacyKindleHoldings(catalog) {
  const works = (catalog.works ?? []).map((work) => ({
    ...work,
    sources: [...(work.sources ?? [])],
    formats: [...(work.formats ?? [])],
  }));
  let editions = (catalog.editions ?? []).map((edition) => ({ ...edition }));
  let holdings = (catalog.holdings ?? []).map((holding) => ({ ...holding }));

  const groups = new Map();
  for (const holding of holdings) {
    const day = acquisitionDay(holding.acquired_at);
    if (!holding.work_id || !day || holding.format !== 'Kindle') continue;
    const key = `${holding.work_id}\u0000${day}`;
    const rows = groups.get(key) ?? [];
    rows.push(holding);
    groups.set(key, rows);
  }

  const removedHoldingIds = new Set();
  const audit = [];

  for (const rows of groups.values()) {
    if (rows.length !== 2) continue;
    const legacyRows = rows.filter((row) => row.source === LEGACY_SOURCE);
    const xmlRows = rows.filter((row) => row.source === XML_SOURCE);
    if (legacyRows.length !== 1 || xmlRows.length !== 1) continue;

    const legacy = legacyRows[0];
    const xml = xmlRows[0];
    if (!isSingleUnit(legacy) || !isSingleUnit(xml)) continue;
    if (!String(legacy.edition_id ?? '').startsWith('pending:')) continue;
    if (!String(xml.edition_id ?? '').startsWith('asin:')) continue;

    const preserved_fields = copyLegacyMetadata(xml, legacy);
    removedHoldingIds.add(legacy.holding_id);
    audit.push({
      work_id: legacy.work_id,
      acquisition_date: acquisitionDay(legacy.acquired_at),
      removed_holding_id: legacy.holding_id,
      removed_edition_id: legacy.edition_id,
      retained_holding_id: xml.holding_id,
      retained_edition_id: xml.edition_id,
      retained_asin: xml.edition_id.slice('asin:'.length),
      preserved_fields,
      evidence: [
        'same_work',
        'same_acquisition_date',
        'one_legacy_purchase_history_holding',
        'one_asin_backed_amazon_xml_holding',
        'unit_quantity_on_both_holdings',
      ],
    });
  }

  if (!removedHoldingIds.size) {
    return {
      ...catalog,
      works,
      editions,
      holdings,
      holding_deduplication_audit: [],
    };
  }

  holdings = holdings.filter((holding) => !removedHoldingIds.has(holding.holding_id));

  const referencedEditionIds = new Set(holdings.map((holding) => holding.edition_id).filter(Boolean));
  const removableEditionIds = new Set(
    audit.map((row) => row.removed_edition_id).filter(Boolean),
  );
  editions = editions.filter((edition) => !(
    removableEditionIds.has(edition.edition_id)
    && !referencedEditionIds.has(edition.edition_id)
    && edition.id_kind === 'pending_title_key'
    && edition.verification === 'unverified'
  ));

  const holdingsByWork = new Map();
  for (const holding of holdings) {
    const rows = holdingsByWork.get(holding.work_id) ?? [];
    rows.push(holding);
    holdingsByWork.set(holding.work_id, rows);
  }
  for (const work of works) {
    const rows = holdingsByWork.get(work.work_id) ?? [];
    work.item_count = rows.reduce((sum, holding) => sum + Number(holding.quantity ?? 0), 0);
    work.sources = [...new Set(rows.map((holding) => holding.source).filter(Boolean))];
    work.formats = [...new Set(rows.map((holding) => holding.format).filter(Boolean))];
  }

  const inputCount = holdings.reduce((sum, holding) => sum + Number(holding.quantity ?? 0), 0);
  const stats = {
    ...catalog.stats,
    input_count: inputCount,
    edition_count: editions.length,
    holding_count: holdings.length,
    merged_input_count: inputCount - works.length,
    kindle_deduplicated_legacy_holding_count: audit.length,
  };

  audit.sort((a, b) => a.work_id.localeCompare(b.work_id) || a.acquisition_date.localeCompare(b.acquisition_date));
  return {
    ...catalog,
    stats,
    works,
    editions,
    holdings,
    holding_deduplication_audit: audit,
  };
}
