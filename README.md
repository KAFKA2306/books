# KAFKA BOOKS

個人の読書記録を、**作品（Work）** と **版（Edition）** を分離して管理する静的本棚データベースです。

- 公開UI: https://kafka2306.github.io/books/
- 公開API: https://kafka2306.github.io/books/api/v1/collections.json
- リポジトリ: https://github.com/KAFKA2306/books

## 現在のデータ

| 指標 | 件数 |
|---|---:|
| 有効な所蔵入力 | 913 |
| 統合後の作品 | 784 |
| Edition | 974 |
| Kindle ASIN | 680 |
| Kindle取得イベント | 669 |
| ISBN確認済み | 61 |
| 価格登録分の合計 | 166,395円 |

正準カタログは `data/catalog.json`、Issue #1由来の構造化取込は `data/issue-1-books.json` として可読JSONで保持します。旧 `base64+gzip` 分割データは互換fallbackのみです。ISBNは推測で補完せず、書誌情報を一次情報で確認できた版だけを `isbn13` に登録します。

## 公開API

API v1のBase URL:

```text
https://kafka2306.github.io/books/api/v1/
```

全リストの正準入口:

```text
https://kafka2306.github.io/books/api/v1/collections.json
```

`collections.json` から、公開中の全コレクション名・件数・JSON/CSVファイルを列挙できます。現在は次を公開します。

- `works`
- `editions`
- `holdings`
- `acquisitions`
- `kindle_items`
- `kindle_records`
- `issue_resolutions`
- `issue_records`
- `isbn_enrichments`
- `isbn_enrichment_attempts`
- `isbn_enrichment_results`

正準 `catalog.json` の全トップレベル配列は自動的にJSON/CSV APIへ追加されます。Kindle XML由来の `acquisitions`、`kindle_items`、`kindle_records` も同じ契約で全件配信します。

API全体の生成元、件数、byte数、SHA-256は `api/v1/manifest.json` で監査できます。詳細は [`docs/api.md`](docs/api.md) を参照してください。

## Kindle XML取込

Kindle for PCが生成する `KindleSyncMetadataCache.xml` をローカルで正規化して取り込みます。raw XML自体はGitへ追加しません。

```bash
npm run kindle:import -- "/path/to/KindleSyncMetadataCache.xml"
npm run check
```

現在取り込んだスナップショットは、690 metadata行から完全重複を除いて685レコード、680 ASINです。取得イベントはPurchase 455、Prime 10、Sample 204で、Purchase/Primeを持つ465 ASINだけを本棚のEdition/Holdingへ反映します。Sample-onlyは `acquisitions` / `kindle_items` / `kindle_records` APIには残しますが、本棚所蔵数には含めません。

## Issue #1 取込結果

Kindle蔵書スクリーンショット由来の60件をprecheckへ通し、既存所蔵との二重登録を回避しました。

| 判定 | 件数 |
|---|---:|
| 処理した構造化レコード | 60 |
| 既存所蔵として追加停止 | 24 |
| 新規に追加した所蔵入力 | 36 |
| 新規Work | 35 |
| 検証済みISBN | 61 |

- 同一作品の上下巻は1枚のWorkカードへ統合
- 版・巻はEditionへ保持
- Kindle所蔵を紙版ISBNへ直接結び付けない
- OCR由来の誤記は出版社・国立国会図書館等の書誌と照合して正式名称へ修正
- 一意に確認できない電子版はISBNを空欄のまま保持
- 入力原文は保存しない

## 機能

- 書名・カテゴリの全文検索
- 読了・読書中・未読・未登録の絞り込み
- カテゴリ・登録元の絞り込み
- 購入日・評価・価格・書名・読書状態で並べ替え
- グリッド / リスト表示
- URLへ検索条件を保持
- 表示中データのCSV出力
- 追加前のISBN・正規化書名重複チェック
- 全公開リストのJSON/CSV API配信
- GitHub Pagesへの自動配信

## データモデル

### `works`

UIで1枚のカードとして表示する作品です。

- `work_id`: `wrk_` + 正規化書名キーのSHA-256先頭12桁
- `title`: 巻・版・上下・雑誌号を除いた表示名
- `title_key`: 空白・記号・大小文字差を除いた重複判定キー
- `status`: `read | reading | unread | untracked`
- `item_count`: 何件の入力を統合したか

### `editions`

版・形式・言語ごとの出版物です。

- `isbn13`: **確認済みの場合の優先キー**
- `edition_id`: ISBN未登録時は `pending:<hash>`
- `verification`: `verified | verified_without_isbn | source_metadata | unverified | rejected`
- Kindle版は `edition_id = asin:<ASIN>`、`id_kind = asin` とし、紙版ISBNを推測で付与しない

国際ISBN機関は、ISBNを特定のタイトル・版・形式を識別するプロダクト識別子と定義しています。作品内容そのものと、版・形式を同じIDで扱わないため、WorkとEditionを分離しています。

- International ISBN Agency: https://www.isbn-international.org/content/what-isbn
- ISO 2108:2017: https://www.iso.org/standard/65483.html

### `holdings`

購入・所蔵として本棚へ表示する権利です。Kindleでは `purchase` と `prime` のみHoldingへ反映し、`sample` はHoldingへ入れません。

### `acquisitions`

Amazon Kindleの取得イベントです。`purchase | prime | sample` を区別し、同一ASINにSampleとPurchaseの両方が存在しても別イベントとして保持します。

### `kindle_items` / `kindle_records`

`kindle_items` はASIN単位の統合ビュー、`kindle_records` はローカルKindleメタデータから抽出した監査レコードです。raw `KindleSyncMetadataCache.xml` は同期情報を含むためGitHubへ保存せず、必要な書誌・取得情報だけを `data/kindle/*.ndjson` に正規化して保存します。

## 正規化ポリシー

除去対象:

- `上巻`、`下巻`、`上下巻`、`上中下`
- `第2巻`、`2巻`、`: 2`
- `第2版`、`新版`、`新訂`、`新装改訂版`
- 雑誌の年月号
- 末尾の出版社・レーベル表記

保持対象:

- `1984年`
- `1Q84`
- `22世紀の民主主義`
- `13歳からの地政学`

数値を一律に削除せず、版・巻・号を示す構造だけを除去します。

## Precheck

ブラウザの「追加前チェック」、またはCLIで実行できます。

```bash
npm run catalog:precheck -- data/import.template.json
```

判定順:

1. ISBN-10をISBN-13へ変換
2. ISBNチェックディジット検証
3. 既存ISBNとの完全一致をブロック
4. 同一バッチ内ISBN重複をブロック
5. ISBNなしの正規化書名一致をブロック
6. 新しいISBN + 既存作品名は、既存WorkへEdition追加として許可
7. 類似度86%以上は確認警告

## 検証

依存パッケージはありません。Node.js 22以上で実行します。

```bash
npm run check
```

検証内容:

- Work ID / title keyの一意性
- Issue #1の60件・重複停止数・新規Work数
- 原文フィールドの不在
- ISBN-13チェックディジット
- ISBN重複
- Edition / Holdingの孤児参照
- 集計値整合
- 正規化とPrecheckのユニットテスト
- 自動採用ISBNの複数提供元証跡
- ASIN Edition / Acquisition / Kindle item / Kindle record の一意性と参照整合
- SampleがHoldingへ混入しないこと
- 正準catalogの全配列がAPIコレクションとして公開されること
- 全APIコレクションにJSON/CSVが存在し、manifest件数と一致すること

## 書誌情報の追加方針

ISBN検索は、ISBNそのものが判明している場合に最も確実です。国立国会図書館サーチとOpen LibraryはいずれもISBN検索を提供しています。

- NDLサーチ ISBN検索: https://ndlsearch.ndl.go.jp/bib/help/isbn
- NDLサーチ API: https://ndlsearch.ndl.go.jp/help/api/specifications
- Open Library検索: https://openlibrary.org/about/helpSearch

タイトル検索だけで得たISBNは自動採用しません。候補が一意で、書名・著者・出版者・版・形式を照合できた場合のみ `verified` として登録します。

## ISBN定期拡充

`.github/workflows/isbn-enrichment.yml` を毎日02:17 UTC（日本時間11:17）に実行し、通常25作品ずつ再照合します。

- 国立国会図書館サーチ、openBD、Google Booksから候補を取得
- ISBNチェックディジット、タイトル類似度95%以上を必須化
- 異なる提供元2つ以上が同じISBNを返した場合だけ採用
- 合意候補が複数ある作品は `ambiguous` として登録しない
- Kindle・電子版へ紙版ISBNを自動接続しない
- 候補なしは30日後、曖昧候補は90日後、提供元障害は翌日に再試行
- `npm run check` 成功後だけmainへ反映し、Pagesを再配信
- 失敗時は `ISBN enrichment automation failed` Issueへ記録

監査仕様と手動実行方法は [`docs/isbn-enrichment.md`](docs/isbn-enrichment.md) を参照してください。

## GitHub Pages

`main` へのpushでCI検証後にPagesへ配信します。GitHub PagesのSourceが未設定の場合、検証は成功させたまま配信をスキップし、Actionsログへ警告を出します。初回のみSourceを **GitHub Actions** に設定してください。

- https://docs.github.com/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://github.com/actions/deploy-pages
