import { precheckCandidates } from './catalog.mjs';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? '').trim()])));
}

function reasonCodes(result) {
  const codes = [];
  const joined = result.errors.join('\n');
  if (joined.includes('ISBNの形式またはチェックディジットが不正')) codes.push('invalid_isbn');
  if (joined.includes('既に登録済み')) codes.push('existing_holding');
  if (joined.includes('同じ入力内でISBN') || joined.includes('同じ入力内で正規化書名')) codes.push('duplicate_in_batch');
  if (joined.includes('書名が空')) codes.push('insufficient_metadata');
  if (joined.includes('ISBN未指定かつ正規化書名が既存作品と一致')) codes.push('existing_work_without_isbn');
  if (result.warnings.some((warning) => warning.startsWith('類似作品候補:'))) codes.push('review_similar_title');
  if (!codes.length && result.action === 'create_work') codes.push('safe_new_work');
  if (!codes.length && result.action === 'add_edition') codes.push('safe_new_edition');
  return codes;
}

export function normalizeMigrationRows(rows) {
  return rows.map((row) => ({
    title: row.title ?? '',
    isbn: row.isbn ?? row.isbn13 ?? row.isbn10 ?? '',
    source: row.source || null,
    status: row.status || null,
    price: row.price === '' || row.price == null ? null : Number(row.price),
    purchase_date: row.purchase_date || null,
  }));
}

export function diagnoseMigration(rows, catalog) {
  const candidates = normalizeMigrationRows(rows);
  const precheck = precheckCandidates(candidates, catalog);
  const results = precheck.results.map((result) => ({
    index: result.index,
    input: result.input,
    normalized_title: result.normalized_title,
    isbn13: result.isbn13,
    action: result.action,
    matched_work_id: result.matched_work_id,
    matched_title: result.matched_title,
    reason_codes: reasonCodes(result),
    errors: result.errors,
    warnings: result.warnings,
  }));
  const counts = {};
  for (const result of results) {
    for (const code of result.reason_codes) counts[code] = (counts[code] ?? 0) + 1;
  }
  return {
    schema_version: 1,
    mode: 'dry-run',
    catalog_mutated: false,
    summary: { ...precheck.summary, reason_counts: counts },
    results,
  };
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function renderDiagnosisHtml(report) {
  const rows = report.results.map((result) => `
    <tr>
      <td>${result.index + 1}</td>
      <td>${escapeHtml(result.input.title)}</td>
      <td>${escapeHtml(result.isbn13 ?? result.input.isbn ?? '')}</td>
      <td>${escapeHtml(result.reason_codes.join(', '))}</td>
      <td>${escapeHtml([...result.errors, ...result.warnings].join(' / '))}</td>
    </tr>`).join('');
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>蔵書移行診断</title>
<style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:auto;padding:24px;line-height:1.6}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left;vertical-align:top}.notice{padding:12px;background:#f4f4f4}</style></head>
<body><h1>蔵書移行診断</h1><p class="notice">dry-run: この診断は正準catalogを書き換えません。</p>
<p>入力 ${report.summary.total}件 / 自動処理可能 ${report.summary.allowed}件 / 要確認 ${report.summary.blocked}件</p>
<table><thead><tr><th>#</th><th>書名</th><th>ISBN-13</th><th>判定</th><th>理由</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}
