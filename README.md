# KAFKA BOOKS

個人の読書記録を、**作品（Work）** と **版（Edition）** を分離して管理する静的本棚データベースです。

- 公開UI: https://kafka2306.github.io/books/
- リポジトリ: https://github.com/KAFKA2306/books

## 現在のデータ

| 指標 | 件数 |
|---|---:|
| 入力レコード | 455 |
| 統合後の作品 | 414 |
| 巻・版・重複として統合 | 41 |
| ISBN確認済み | 0 |
| 価格登録分の合計 | 166,395円 |

ISBNは推測で補完していません。書誌情報を一次情報で確認できた版だけを `isbn13` に登録する方針です。

## 機能

- 書名・カテゴリの全文検索
- 読了・読書中・未読・未登録の絞り込み
- カテゴリ・登録元の絞り込み
- 購入日・評価・価格・書名・読書状態で並べ替え
- グリッド / リスト表示
- URLへ検索条件を保持
- 表示中データのCSV出力
- 追加前のISBN・正規化書名重複チェック
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
- `verification`: `verified | unverified | rejected`

国際ISBN機関は、ISBNを特定のタイトル・版・形式を識別するプロダクト識別子と定義しています。作品内容そのものと、版・形式を同じIDで扱わないため、WorkとEditionを分離しています。

- International ISBN Agency: https://www.isbn-international.org/content/what-isbn
- ISO 2108:2017: https://www.iso.org/standard/65483.html

### `holdings`

Kindle購入、蔵書メモ、図書館履歴など、個人側の登録元です。同一作品・同一登録元は `quantity` へ集約し、入力原文は保存しません。

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
- ISBN-13チェックディジット
- ISBN重複
- Edition / Holdingの孤児参照
- 集計値整合
- 正規化とPrecheckのユニットテスト

## 書誌情報の追加方針

ISBN検索は、ISBNそのものが判明している場合に最も確実です。国立国会図書館サーチとOpen LibraryはいずれもISBN検索を提供しています。

- NDLサーチ ISBN検索: https://ndlsearch.ndl.go.jp/bib/help/isbn
- NDLサーチ API: https://ndlsearch.ndl.go.jp/help/api/specifications
- Open Library検索: https://openlibrary.org/about/helpSearch

タイトル検索だけで得たISBNは自動採用しません。候補が一意で、書名・著者・出版者・版・形式を照合できた場合のみ `verified` として登録します。

## GitHub Pages

`main` へのpushでCI検証後にPagesへ配信します。GitHub PagesのSourceは **GitHub Actions** に設定してください。

- https://docs.github.com/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://github.com/actions/deploy-pages
