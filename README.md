https://kafka2306.github.io/books/

# KAFKA BOOKS

[![Validate and deploy Pages](https://github.com/KAFKA2306/books/actions/workflows/ci-pages.yml/badge.svg)](https://github.com/KAFKA2306/books/actions/workflows/ci-pages.yml)
[![Books MCP contract](https://github.com/KAFKA2306/books/actions/workflows/mcp-contract.yml/badge.svg)](https://github.com/KAFKA2306/books/actions/workflows/mcp-contract.yml)

**本が増えるほど、「持っているか」「読んだか」「どの版か」が一つの答えではなくなる。**

KAFKA BOOKS は、個人の蔵書を **作品（Work）・版（Edition）・所蔵（Holding）・取得履歴（Acquisition）** に分け、曖昧な読書記録を「後から確認できる本棚」へ変える静的ライブラリDBです。

- 公開UI: https://kafka2306.github.io/books/
- 公開API: https://kafka2306.github.io/books/api/v1/collections.json

## できること

- 所蔵本を作品・版・所蔵単位で検索・閲覧
- ISBN / ASIN / NDL書誌情報による版の識別
- Kindleと紙書籍を同一Workへ統合
- 読書状態、取得元、取得日、価格を保持
- 国立国会図書館分類（NDC）に基づくカテゴリ付与
- migration診断で既存所蔵、重複、曖昧なWork identityを事前検出
- JSON/CSV APIとして再利用可能な書誌データを配布

## データモデル

```text
Work
  ├─ Edition
  │    └─ Holding
  └─ Classification

Holding
  └─ Acquisition
```

- **Work**: 作品としての同一性
- **Edition**: ISBN/ASIN、出版社、刊行年、媒体など特定版
- **Holding**: 実際に所有している1件
- **Acquisition**: 取得元・取得日・価格等

WorkとEditionを分離することで、同じ作品の紙・Kindle・新版・旧版を誤って別作品または同一版として扱うことを避けます。

## 正準データ

主要データは `data/` 以下で管理します。

- `data/catalog.json`: 基本catalog
- `data/issue-1-books.json`: Kindle移行で確認した追加書誌
- `data/kindle/`: Kindle取得データ
- `data/isbn-enrichments.json`: 自動ISBN補完結果
- `data/isbn-primary-verifications/`: 一次情報で確認したISBN
- `data/title-normalizations/`: 根拠付きタイトル正規化
- `data/work-merges/`: 同一Work統合
- `data/work-identities/`: Work type・翻案関係等
- `data/category-enrichments.json`: NDC由来カテゴリ
- `data/category-primary-verifications/`: 一次情報で確認した分類

生成APIや監査結果をデータauthorityとして逆輸入しません。

## 検証

```bash
npm run check
```

主な検証:

- catalog schema / identity integrity
- Work / Edition / Holding参照整合性
- title-key collision
- category / NDC consistency
- ISBN enrichment / primary verification
- migration diagnosis
- title anomaly / batch review
- API distribution

## 書誌調査

書誌情報は、出版社公式、国立国会図書館サーチ、JPRO等の一次・公的情報を優先します。

タイトルやISBNを推測で確定せず、証拠が不足する場合は未確認のまま保持します。

### タイトル異常候補

```bash
npm run title:audit
npm run title:review-batch
```

`title:audit` は全Workから販売注記・巻号・レーベル等の候補を列挙します。`title:review-batch` は同一作品候補をまとめ、一次情報調査の単位を減らします。自動修正は行いません。

### ISBN例外

```bash
npm run isbn:exception-audit
```

過去のISBN補完で解決できなかった候補について、現在のprimary verificationとの差分から未解決queueを再計算します。ISBNを持たない可能性や版・巻の不足情報は推測で埋めません。

## 蔵書移行診断

ブラウザ版:

https://kafka2306.github.io/books/migration.html

CLI:

```bash
npm run migration:diagnose -- path/to/input.csv
```

入力は既存catalogを変更しないdry-runです。ISBN、Work identity、重複、価格などを検証し、機械可読なreason codeを返します。

書誌レビュー対象の実測時間を記録する場合:

```bash
npm run migration:measure-review -- report.json observations.json
```

未計測時間は補完せず `null` のまま扱います。

## API

公開API:

https://kafka2306.github.io/books/api/v1/collections.json

API build:

```bash
npm run build:api
```

配布artifactはcatalogから生成し、manifestとSHA-256で内容を検証します。raw source/debug dataはPages artifactへ含めません。

## MCP

ローカルMCP server:

```bash
python scripts/books_mcp_server.py
```

MCPは公開API/read modelを読むための薄いinterfaceです。書誌data authorityはrepository側に残します。

## 開発

Node.js標準機能を中心に使用します。

```bash
npm test
npm run check
```

GitHub ActionsでPRのexact headを検証し、main merge後にGitHub Pagesへdeployします。

## データ利用

公開APIは、検索・照合・個人蔵書分析等の再利用を想定しています。各書誌recordのsource/provenanceを保持し、外部利用時も由来を追跡できるようにします。
