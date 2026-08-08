# カタログ保存形式

## 方針

`data/catalog.json` と `data/issue-1-books.json` を、人間とGitHubが直接読めるカタログ入力として扱います。

従来の `catalog.part*.b64` / `issue-1-books.part*.b64` は `base64+gzip` のため、通常のGitHubコード検索、レビュー差分、外部エージェントからの書名検索が効きません。移行後はこれらを旧形式の互換入力としてのみ残し、新しい処理は可読JSONを優先します。

## 移行

```bash
npm run catalog:materialize
npm run check
```

`catalog:materialize` は現行の圧縮分割データを一度だけ展開し、次を生成します。

- `data/catalog.json`
- `data/issue-1-books.json`

`loadCatalog()` は可読JSONが存在すればそちらを読み、まだ生成されていない環境だけ旧 `base64+gzip` をfallbackとして読みます。

## Kindleとの関係

Kindle由来の版・取得事実は、今後Amazon Kindleのローカル同期メタデータから取り込みます。ASIN、タイトル、著者、出版社、出版日、取得日時、Purchase / Prime / Sampleの区別はAmazon側の機械記録を優先し、Workの統合名、カテゴリ、読書状態、評価などの利用者側メタデータはKAFKA BOOKS側で保持します。

Kindle版へ紙版ISBNを推測接続しません。ISBNは既存の書誌照合ルールに従って別途検証します。
