# KAFKA BOOKS

個人の読書記録を、**作品（Work）**・**版（Edition）**・**所蔵（Holding）**・**取得履歴（Acquisition）**を分離して管理する静的本棚データベースです。

- 公開UI: https://kafka2306.github.io/books/
- 公開API: https://kafka2306.github.io/books/api/v1/collections.json
- リポジトリ: https://github.com/KAFKA2306/books

## 現在のデータ

`npm run check` とAPI artifactで検証した現在値です。

| 指標 | 件数 |
|---|---:|
| Work | 859 |
| Edition | 965 |
| Holding | 904 |
| Kindle正規化レコード | 685 |
| Kindle item / 識別子 | 680 |
| Kindle取得イベント | 685 |
| Kindle照合監査 | 490 |
| Kindle Purchase | 455 |
| Kindle Sample | 204 |
| Kindle Prime | 10 |
| Kindle Dictionary | 1 |
| Kindle origin不明 | 15 |
| Kindle XMLから新規作成したWork | 410 |
| 旧KindleスクリーンショットHoldingをXML Purchaseへ置換 | 2 |
| ISBN確認済み | 61 |
| 価格登録分の合計 | 166,395円 |

Kindle入力は元XMLの690 `meta_data` 行から、**内容が完全一致する5行だけを除去して685レコード**へ正規化しています。同じ識別子に `Sample` と `Purchase` が共存する場合など、取得意味が異なる履歴は別イベントとして保持します。

## 正準データ

- 基本カタログ: `data/catalog.json`
- Issue #1取込: `data/issue-1-books.json`
- Kindle正規化データ: `data/kindle/manifest.json` + `data/kindle/records-*.ndjson`
- ISBN拡充overlay: `data/isbn-enrichments.json`

旧 `base64+gzip` 分割データは互換fallbackのみです。正準データはGitHub上で検索・レビューできる可読形式を優先します。

## 公開API

Base URL:

```text
https://kafka2306.github.io/books/api/v1/
```

全リストの正準入口:

```text
https://kafka2306.github.io/books/api/v1/collections.json
```

現在の主要コレクション:

- `works`
- `editions`
- `holdings`
- `kindle_records`
- `kindle_items`
- `acquisitions`
- `kindle_match_audit`
- `issue_records`
- `issue_resolutions`
- `isbn_enrichments`
- `isbn_enrichment_attempts`
- `isbn_enrichment_results`

各コレクションはJSON/CSVの両方を配信します。正準 `catalog.json` のトップレベル配列は自動的にAPIコレクションになるため、「DBには存在するがAPIから全件取得できない」状態をCIで失敗扱いにします。

API全体の生成元、件数、byte数、SHA-256は `api/v1/manifest.json` で監査できます。詳細は [`docs/api.md`](docs/api.md) を参照してください。

## Kindle XMLを正準入力にする

Kindle for PC のローカルメタデータ `KindleSyncMetadataCache.xml` を、Kindle由来情報の機械的な一次入力として扱います。

Windows既定パス:

```text
%LOCALAPPDATA%\Amazon\Kindle\Cache\KindleSyncMetadataCache.xml
```

同期・検証:

```powershell
npm run kindle:sync
```

明示指定:

```powershell
npm run kindle:sync -- "C:\Users\front\AppData\Local\Amazon\Kindle\Cache\KindleSyncMetadataCache.xml"
```

raw XMLはGitHubへ保存しません。同期日時・ソフトウェアバージョン・入力XMLのSHA-256と、必要な書誌/取得情報だけを可読NDJSONへ正規化します。各分割ファイルは件数・byte数・SHA-256をmanifestで検証します。

### Kindleの意味論

- `purchase`: 所有。ASIN EditionとHoldingを作成
- `sample`: 非所有。Acquisition履歴のみ
- `prime`: 非所有。Acquisition履歴のみ
- `kindle_dictionary`: 非所有。履歴のみ
- `unknown`: 非所有。履歴のみ

SampleやPrimeを蔵書数へ混入させません。同一識別子のSample→Purchaseは両イベントを残し、HoldingはPurchaseに基づく1件だけです。

### 既存手入力との照合

今回の照合監査490件:

| action | 件数 |
|---|---:|
| `created_work` | 410 |
| `matched_work` | 45 |
| `replaced_by_xml_purchase` | 2 |
| `kept_unmatched` | 33 |

既存の `Kindleスクリーンショット` HoldingとXML Purchaseが同じ正規化Workへ一致した2件だけ、ASINベースのHoldingへ置換しました。一致しない33件は自動削除せず温存しています。

詳細は [`docs/kindle-import.md`](docs/kindle-import.md) を参照してください。

## データモデル

### Work

UIで1枚のカードとして表示する作品です。巻・上下・版などを統合した作品単位を表します。

- `work_id`: `wrk_` + 正規化書名キーのSHA-256先頭12桁
- `title`: 統一表示名
- `title_key`: 重複判定キー
- `status`: `read | reading | unread | untracked`

### Edition

版・形式・言語ごとの出版物です。

- 紙/通常出版物: 確認済みISBN-13を優先識別子にする
- Kindle: `edition_id = asin:<ASIN>` を優先
- Kindle XML由来の電子版へ紙版ISBNを推測で付与しない

ISBNは作品内容そのものではなく特定の版・形式を識別するため、WorkとEditionを分離しています。

### Holding

購入・所蔵として本棚に存在するものです。KindleではPurchaseだけをHoldingへ変換します。

### Acquisition

取得イベントです。KindleではPurchase / Sample / Prime / KindleDictionary / unknownを別々に保持します。所有状態とアクセス履歴を混同しません。

### Kindle item / record / match audit

- `kindle_records`: 正規化された元メタデータ行
- `kindle_items`: Kindle識別子単位の統合ビュー
- `kindle_match_audit`: 既存Work/Holdingとの照合判断の監査証跡

## Issue #1取込

Kindle蔵書スクリーンショット由来の60件はprecheckを通し、既存所蔵との二重登録を回避しています。

- 処理: 60
- 既存所蔵として追加停止: 24
- 新規に追加した所蔵入力: 36
- 新規Work: 35

XMLで一致した既存スクリーンショット由来Holdingは、上記の照合監査を経て段階的にASINベースへ置換します。

## 正規化ポリシー

作品表示では、意味のある数字を消さず、巻・版・号を示す構造だけを除去します。

除去例:

- `上巻` / `下巻` / `上下巻`
- `第2巻` / `2巻`
- `第2版` / `新版` / `新訂` / `新装改訂版`
- 雑誌年月号

保持例:

- `1984年`
- `1Q84`
- `22世紀の民主主義`
- `13歳からの地政学`

## Precheck

```bash
npm run catalog:precheck -- data/import.template.json
```

主な判定:

1. ISBN-10をISBN-13へ変換
2. ISBNチェックディジット検証
3. 既存ISBN完全一致を停止
4. 同一バッチISBN重複を停止
5. ISBNなしの正規化書名一致を停止
6. 新ISBN + 既存作品名は既存WorkへのEdition追加として扱う
7. 類似度86%以上は警告

## 検証

依存パッケージはありません。Node.js 22以上で実行します。

```bash
npm run check
```

CIでは少なくとも以下を検証します。

- Work / Edition / HoldingのID一意性
- ISBNチェックディジットとISBN重複
- ASIN Editionの一意性
- Edition / Holding / Acquisitionの孤児参照
- PurchaseだけがAmazon Kindle Holdingを作ること
- Sample / PrimeがHoldingへ混入しないこと
- Kindle manifestの件数・origin件数
- Kindle分割データの件数・byte数・SHA-256
- 完全重複除去が取得意味の異なるイベントを消さないこと
- `collections.json` が全リストを列挙すること
- 全APIコレクションにJSON/CSVが存在すること
- API件数がmanifestと一致すること
- raw Kindle XMLやdebug sourceがcommitされていないこと

## ISBN定期拡充

`.github/workflows/isbn-enrichment.yml` を毎日02:17 UTC（日本時間11:17）に実行します。

- 国立国会図書館サーチ、openBD、Google Booksから候補取得
- ISBNチェックディジットと高い書名一致を必須化
- 異なる提供元2つ以上が同じISBNを返した場合だけ採用
- 合意候補が複数なら `ambiguous` として登録しない
- Kindle・電子版へ紙版ISBNを自動接続しない
- `npm run check` 成功後だけmainへ反映

詳細は [`docs/isbn-enrichment.md`](docs/isbn-enrichment.md) を参照してください。

## GitHub Pages

`main` へのpushで、検証成功後にGitHub Pagesへ配信します。
