import { diagnoseMigration, parseCsv, renderDiagnosisHtml } from './src/migration-diagnosis.mjs';

const fileInput = document.querySelector('#migrationFile');
const diagnoseButton = document.querySelector('#diagnoseButton');
const statusNode = document.querySelector('#diagnosisStatus');
const resultSection = document.querySelector('#diagnosisResult');
const metricsNode = document.querySelector('#diagnosisMetrics');
const rowsNode = document.querySelector('#diagnosisRows');
const downloadJson = document.querySelector('#downloadJson');
const downloadHtml = document.querySelector('#downloadHtml');

let currentReport = null;

fileInput.addEventListener('change', () => {
  currentReport = null;
  resultSection.hidden = true;
  diagnoseButton.disabled = fileInput.files.length !== 1;
  statusNode.textContent = fileInput.files.length === 1 ? `${fileInput.files[0].name} を選択しました。` : '';
});

function download(name, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function render(report) {
  const summary = report.summary;
  metricsNode.replaceChildren(
    metric('入力', summary.total),
    metric('自動処理可能', summary.allowed),
    metric('要確認', summary.blocked),
    metric('新規Work候補', summary.create_work),
    metric('新規Edition候補', summary.add_edition),
  );
  rowsNode.replaceChildren(...report.results.map((result) => {
    const row = document.createElement('tr');
    for (const value of [
      result.index + 1,
      result.input.title,
      result.isbn13 ?? result.input.isbn ?? '',
      result.reason_codes.join(', '),
      [...result.errors, ...result.warnings].join(' / '),
    ]) {
      const cell = document.createElement('td');
      cell.textContent = String(value ?? '');
      row.append(cell);
    }
    return row;
  }));
  resultSection.hidden = false;
}

function metric(label, value) {
  const node = document.createElement('article');
  const labelNode = document.createElement('span');
  const valueNode = document.createElement('strong');
  labelNode.textContent = label;
  valueNode.textContent = String(value);
  node.append(labelNode, valueNode);
  return node;
}

diagnoseButton.addEventListener('click', async () => {
  if (fileInput.files.length !== 1) return;
  diagnoseButton.disabled = true;
  statusNode.textContent = '診断中…';
  try {
    const [text, response] = await Promise.all([
      fileInput.files[0].text(),
      fetch('./api/v1/catalog.json', { cache: 'no-store' }),
    ]);
    if (!response.ok) throw new Error(`catalog取得失敗: HTTP ${response.status}`);
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('CSVに診断対象の行がありません。');
    const catalog = await response.json();
    currentReport = diagnoseMigration(rows, catalog);
    render(currentReport);
    statusNode.textContent = `診断完了: ${currentReport.summary.total}件。catalogは変更していません。`;
  } catch (error) {
    currentReport = null;
    resultSection.hidden = true;
    statusNode.textContent = `診断できませんでした: ${error.message}`;
  } finally {
    diagnoseButton.disabled = false;
  }
});

downloadJson.addEventListener('click', () => {
  if (!currentReport) return;
  download('kafka-books-migration-report.json', 'application/json;charset=utf-8', `${JSON.stringify(currentReport, null, 2)}\n`);
});

downloadHtml.addEventListener('click', () => {
  if (!currentReport) return;
  download('kafka-books-migration-report.html', 'text/html;charset=utf-8', renderDiagnosisHtml(currentReport));
});
