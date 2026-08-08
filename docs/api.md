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
- `issue_resolutions.json` / `issue_resolutions.csv`

`data/catalog.json` に将来新しいトップレベル配列を追加した場合、その配列も自動的に同名の JSON / CSV APIへ追加されます。したがって Kindle XML 取込で `acquisitions` 等を追加した場合もAPIビルド側の個別修正は不要です。

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
6. Work / Edition / Holding の主キーが一意であること

このため「DBには存在するがAPIから全件取得できないリスト」をCIで検出します。
