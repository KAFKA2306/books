# KAFKA BOOKS

個人の読書記録を、**作品（Work）**・**版（Edition）**・**所蔵（Holding）**・**取得履歴（Acquisition）**を分離して管理する静的本棚データベースです。

- 公開UI: https://kafka2306.github.io/books/
- 公開API: https://kafka2306.github.io/books/api/v1/collections.json
- リポジトリ: https://github.com/KAFKA2306/books

## 現在のデータ

| 指標 | 件数 |
|---|---:|
| 有効な所蔵入力 | 491 |
| 統合後の作品 | 449 |
| 巻・版として統合 | 42 |
| ISBN確認済み | 61 |
| 価格登録分の合計 | 166,395円 |

正準カタログは `data/catalog.json`、Issue #1由来の構造化取込は `data/issue-1-books.json` として可読JSONで保持します。旧 `base64+gzip` 分割データは互換fallbackのみです。

Kindleについては、手入力やスクリーンショットより **Kindle for PCの `KindleSyncMetadataCache.xml` を機械的な正準入力として優先**します。生XMLは保存せず、検索可能なNDJSONとSHA-256 manifestへ変換します。ISBNは推測で補完せず、一次情報で確認できた版だけを `isbn13` に登録します。

## Kindle XML同期

Windowsでは次だけで同期・検証できます。

```powershell
npm run kindle:sync
```

既定では次を自動検出します。

```text
%LOCALAPPDATA%\Amazon\Kindle\Cache\KindleSyncMetadataCache.xml
```

別パスを使う場合:

```powershell
npm run kindle:sync -- "C:\path\to\KindleSyncMetadataCache.xml"
```

生成物:

```text
data/kindle/
  manifest.json
  records-01.ndjson
  records-02.ndjson
  ...
```

`manifest.json` には入力XMLのSHA-256、同期日時、元レコード数、一意ASIN数、Purchase / Sample / Prime等の件数、各分割ファイルのbyte数とSHA-256を記録します。詳細は [`docs/kindle-import.md`](docs/kindle-import.md) を参照してください。

## 公開API

API v1のBase URL:

```text
https://kafka2306.github.io/books/api/v1/
```

全リストの正準入口:

```text
https://kafka2306.github.io/books/api/v1/collections.json
```

`collections.json` から公開中の全コレクション名・件数・JSON/CSVファイルを列挙できます。現在の基礎コレクションは次です。

- `works`
- `editions`
- `holdings`
- `issue_resolutions`
- `issue_records`
- `isbn_enrichments`
- `isbn_enrichment_attempts`
- `isbn_enrichment_results`

Kindle XMLが正準データへ取り込まれると、次も自動追加されます。

- `kindle_records`: XMLの全取得レコード
- `kindle_items`: ASIN単位の統合一覧
- `acquisitions`: Purchase / Sample / Prime等の取得イベント
- `kindle_match_audit`: 既存手入力Kindle所蔵との照合・置換監査

正準catalogに新しいトップレベル配列が増えると、APIビルドが同名のJSON/CSVを自動生成します。API全体の生成元、件数、byte数、SHA-256は `api/v1/manifest.json` で監査できます。詳細は [`docs/api.md`](docs/api.md) を参照してください。

## Kindleデータの扱い

同一ASINにSampleとPurchaseが両方ある場合でも、イベントは両方保存します。

- `purchase`: 所有。`asin:<ASIN>` EditionとHoldingを作成
- `sample`: 非所有。Acquisition履歴のみ
- `prime`: 非所有。Acquisition履歴のみ
- `unknown`: 非所有。Acquisition履歴のみ
- `kindle_dictionary`: 非所有。Acquisition履歴のみ

既存の `Kindleスクリーンショット` HoldingとXMLのPurchaseが同じ正規化Workへ一致した場合、スクリーンショットHoldingをASINベースのHoldingへ置換します。一致しない手入力レコードは自動削除せず、`kindle_match_audit` に残します。

## Issue #1 取込結果

Kindle蔵書スクリーンショット由来の60件をprecheckへ通し、既存所蔵との二重登録を回避しました。これらはKindle XMLとの照合対象として残します。

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
- Kindle XMLのASIN重複・取得種別の機械正規化
- 全公開リストのJSON/CSV API配信
- GitHub Pagesへの自動配信

## データモデル

### `works`

UIで1枚のカードとして表示する作品です。

- `work_id`: `wrk_` + 正規化書名キーのSHA-256先頭12桁
- `title`: 巻・版・上下・雑誌号を除いた表示名
- `title_key`: 空白・記号・大小文字差を除いた重複判定キー
- `status`: `read | reading | unread | untracked`
- `item_count`: 実所蔵数

### `editions`

版・形式・言語ごとの出版物です。

- 紙・出版物の確認済み識別子: `isbn13`
- Kindle版の識別子: `asin`
- Kindle Edition ID: `asin:<ASIN>`
- `verification`: `verified | verified_without_isbn | unverified | rejected`

ISBNとASINを同じキーとして扱わず、WorkとEditionを分離します。

### `holdings`

実際に所有・所蔵している単位です。KindleではXMLの `Purchase` だけをHoldingにします。SampleとPrimeを所蔵数へ加えません。

### `acquisitions`

所有とは別に、Amazon Kindleで観測された取得イベントを保持します。これによりSample→Purchaseの遷移も失わず記録できます。

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
6. 新しいISBN + 既存作品名は既存WorkへEdition追加として許可
7. 類似度86%以上は確認警告

## 検証

依存パッケージはありません。Node.js 22以上で実行します。

```bash
npm run check
```

検証内容:

- Work ID / title key / Edition ID / Holding IDの一意性
- ISBN-13チェックディジットとISBN重複
- ASIN Editionの一意性・形式・provenance
- Edition / Holding / Acquisitionの孤児参照
- Kindle Purchase ASINとHoldingの1対1対応
- Sample / PrimeがHoldingへ混入しないこと
- Kindle manifestの件数・byte数・SHA-256
- Issue #1の60件・重複停止数・新規Work数
- 正規化・Precheck・Kindle XML parserのユニットテスト
- 自動採用ISBNの複数提供元証跡
- 正準catalogの全配列がAPIコレクションとして公開されること
- 全APIコレクションにJSON/CSVが存在し、manifest件数と一致すること

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

`main` へのpushでCI検証後にPagesへ配信します。GitHub PagesのSourceが未設定の場合、検証は成功させたまま配信をスキップし、Actionsログへ警告を出します。
