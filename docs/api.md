# KAFKA BOOKS API v1

KAFKA BOOKS の公開データは GitHub Pages 上の静的 API として配信します。

Base URL:

```text
https://kafka2306.github.io/books/api/v1/
```

## 入口

全コレクションを列挙する正準入口は次です。

```text
https://kafka2306.github.io/books/api/v1/collections.json
```

各要素は `name`, `kind`, `count`, `json`, `csv` を持ちます。クライアントはこの一覧を取得すれば、公開中の全リストを列挙して全件取得できます。

API全体の生成元・件数・SHA-256は次で確認できます。

```text
https://kafka2306.github.io/books/api/v1/manifest.json
```

## 公開コレクション

### 正準カタログ

- `works.json` / `works.csv`
- `editions.json` / `editions.csv`
- `holdings.json` / `holdings.csv`
- `acquisitions.json` / `acquisitions.csv`
- `kindle_items.json` / `kindle_items.csv`
- `kindle_records.json` / `kindle_records.csv`
- `issue_resolutions.json` / `issue_resolutions.csv`

`data/catalog.json` のトップレベル配列は自動的に同名のJSON/CSV APIへ追加されます。Kindle XML取込による `acquisitions`、`kindle_items`、`kindle_records` もこの仕組みで配信します。

### 補助・監査リスト

- `issue_records.json` / `issue_records.csv`
- `isbn_enrichments.json` / `isbn_enrichments.csv`
- `isbn_enrichment_attempts.json` / `isbn_enrichment_attempts.csv`
- `isbn_enrichment_results.json` / `isbn_enrichment_results.csv`

補助・監査リストは正準Work/Edition/Holdingそのものではありませんが、取り込み・ISBN照合の経緯を機械取得できるよう公開します。

## 全カタログ

正準カタログ全体を1レスポンスで取得する場合:

```text
https://kafka2306.github.io/books/api/v1/catalog.json
```

## 完全性保証

CIは以下を必須条件とします。

1. `collections.json` に公開コレクションが列挙されること
2. 正準 `catalog.json` の全トップレベル配列が `collections.json` に含まれること
3. 各コレクションに JSON と CSV の両方が存在すること
4. JSON件数が `collections.json` と `manifest.json` の件数に一致すること
5. 配信ファイルのbyte数とSHA-256が `manifest.json` に一致すること
6. Work / Edition / Holding / Acquisition / Kindle item / Kindle record の主キーが一意であること
7. SampleがHoldingとして登録されないこと
8. ASIN EditionがASIN単位で一意であること

このため「DBには存在するがAPIから全件取得できないリスト」をCIで検出します。
