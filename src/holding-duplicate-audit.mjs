export const HOLDING_DUPLICATE_AUDIT_SCHEMA = 'kafka.books.holding-duplicate-audit.v1';

function acquisitionDay(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/u);
  return match?.[1] ?? null;
}

function isKindleHolding(holding) {
  return holding?.format === 'Kindle' || /kindle/iu.test(String(holding?.source ?? ''));
}

function isAmazonXmlHolding(holding) {
  return holding?.source === 'Amazon Kindle XML';
}

function isLegacyKindleHolding(holding) {
  return isKindleHolding(holding) && !isAmazonXmlHolding(holding);
}

export function auditHoldingDuplicates(holdings = []) {
  const groups = new Map();
  for (const holding of holdings) {
    if (!isKindleHolding(holding)) continue;
    const day = acquisitionDay(holding.acquired_at);
    if (!holding.work_id || !day) continue;
    const key = `${holding.work_id}\u0000${day}`;
    const rows = groups.get(key) ?? [];
    rows.push(holding);
    groups.set(key, rows);
  }

  const candidates = [];
  for (const rows of groups.values()) {
    const xmlRows = rows.filter(isAmazonXmlHolding);
    const legacyRows = rows.filter(isLegacyKindleHolding);
    if (!xmlRows.length || !legacyRows.length) continue;

    const acquiredAt = acquisitionDay(rows[0].acquired_at);
    const holdingIds = rows.map((row) => row.holding_id).filter(Boolean).sort();
    const editionIds = [...new Set(rows.map((row) => row.edition_id).filter(Boolean))].sort();
    const sources = [...new Set(rows.map((row) => row.source).filter(Boolean))].sort();
    const quantity = rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);

    candidates.push({
      work_id: rows[0].work_id,
      acquired_at: acquiredAt,
      holding_ids: holdingIds,
      edition_ids: editionIds,
      sources,
      holding_count: rows.length,
      quantity,
      amazon_xml_holding_count: xmlRows.length,
      legacy_kindle_holding_count: legacyRows.length,
      asin_backed_xml: xmlRows.every((row) => String(row.edition_id ?? '').startsWith('asin:')),
      reasons: [
        'same_work',
        'same_acquisition_date',
        'cross_source_kindle_holdings',
      ],
    });
  }

  candidates.sort((a, b) => a.work_id.localeCompare(b.work_id) || a.acquired_at.localeCompare(b.acquired_at));
  return {
    schema: HOLDING_DUPLICATE_AUDIT_SCHEMA,
    summary: {
      candidate_group_count: candidates.length,
      candidate_holding_count: candidates.reduce((sum, row) => sum + row.holding_count, 0),
      candidate_quantity: candidates.reduce((sum, row) => sum + row.quantity, 0),
      asin_backed_group_count: candidates.filter((row) => row.asin_backed_xml).length,
    },
    candidates,
  };
}
