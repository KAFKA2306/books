import { diagnoseMigration, parseMigrationInput, renderDiagnosisHtml } from './src/migration-diagnosis.mjs';

const fileInput = document.querySelector('#migrationFile');
const diagnoseButton = document.querySelector('#diagnoseButton');
const sampleButton = document.querySelector('#sampleButton');
const statusNode = document.querySelector('#diagnosisStatus');
const resultSection = document.querySelector('#diagnosisResult');
const metricsNode = document.querySelector('#diagnosisMetrics');
const rowsNode = document.querySelector('#diagnosisRows');
const downloadJson = document.querySelector('#downloadJson');
const downloadHtml = document.querySelector('#downloadHtml');
const caseStudyMetrics = document.querySelector('#caseStudyMetrics');
const caseStudyNote = document.querySelector('#caseStudyNote');

let currentReport = null;

fileInput.addEventListener('change', () => {
  currentReport = null;
  resultSection.hidden = true;
  diagnoseButton.disabled = fileInput.files.length !== 1;
  statusNode.textContent = fileInput.files.length === 1 ? `${fileInput.files[0].name} を選択しました。` : '';
});

function inputFormat(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') return 'csv';
  if (name.endsWith('.json') || file.type === 'application/json') return 'json';
  if (name.endsWith('.txt') || file.type === 'text/plain') return 'isbn-list';
  throw new Error('対応形式はCSV、JSON、1行1ISBNのテキストです。');
}

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

async function fetchCatalog() {
  const response = await fetch('./api/v1/catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`catalog取得失敗: HTTP ${response.status}`);
  return response.json();
}

async function renderObservedCaseStudy() {
  if (!caseStudyMetrics || !caseStudyNote) return;
  try {
    const response = await fetch('./api/v1/migration_issue_1_benchmark.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`benchmark取得失敗: HTTP ${response.status}`);
    const [benchmark] = await response.json();
    if (!benchmark) throw new Error('benchmarkが空です。');
    const cohort = benchmark.cohort;
    const outcome = benchmark.observed_outcome;
    const metrics = benchmark.derived_metrics;
    caseStudyMetrics.replaceChildren(
      metric('入力', cohort.input_records),
      metric('既存所蔵を停止', outcome.existing_holdings_stopped_by_precheck),
      metric('追加', outcome.holdings_added),
      metric('重複防止率', `${Math.round(metrics.existing_holding_stop_rate * 100)}%`),
    );
    caseStudyNote.textContent = 'Kindle蔵書60件の実処理結果です。人手レビュー時間は当時未計測のため、速度・人件費はこの実績から推定していません。';
  } catch (error) {
    caseStudyMetrics.replaceChildren();
    caseStudyNote.textContent = `実績benchmarkを表示できませんでした: ${error.message}`;
  }
}

diagnoseButton.addEventListener('click', async () => {
  if (fileInput.files.length !== 1) return;
  diagnoseButton.disabled = true;
  sampleButton.disabled = true;
  statusNode.textContent = '診断中…';
  try {
    const file = fileInput.files[0];
    const [text, catalog] = await Promise.all([
      file.text(),
      fetchCatalog(),
    ]);
    const rows = parseMigrationInput(text, inputFormat(file));
    if (!rows.length) throw new Error('診断対象の行がありません。');
    currentReport = diagnoseMigration(rows, catalog);
    render(currentReport);
    statusNode.textContent = `診断完了: ${currentReport.summary.total}件。catalogは変更していません。`;
  } catch (error) {
    currentReport = null;
    resultSection.hidden = true;
    statusNode.textContent = `診断できませんでした: ${error.message}`;
  } finally {
    diagnoseButton.disabled = false;
    sampleButton.disabled = false;
  }
});

sampleButton.addEventListener('click', async () => {
  diagnoseButton.disabled = true;
  sampleButton.disabled = true;
  statusNode.textContent = 'サンプル診断中…';
  try {
    const catalog = await fetchCatalog();
    const rows = [
      { title: 'サンプル蔵書・未登録作品', isbn: '' },
      { title: 'サンプルISBNエラー', isbn: '1234' },
    ];
    currentReport = diagnoseMigration(rows, catalog);
    render(currentReport);
    statusNode.textContent = '架空データ2件のサンプル診断を表示しています。catalogは変更していません。';
  } catch (error) {
    currentReport = null;
    resultSection.hidden = true;
    statusNode.textContent = `サンプル診断できませんでした: ${error.message}`;
  } finally {
    diagnoseButton.disabled = fileInput.files.length !== 1;
    sampleButton.disabled = false;
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

renderObservedCaseStudy();
