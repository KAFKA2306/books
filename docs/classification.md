# 日本の図書館分類コード

KAFKA BOOKSでは、日本の図書館で広く使われる **日本十進分類法（NDC）** を主分類として扱います。

## 採用する分類体系

| scheme_id | 位置づけ | 用途 |
|---|---|---|
| `ndc10` | 主分類 | 日本十進分類法 新訂10版。UIの分類表示・絞り込みの基準 |
| `ndc9` | 旧版の出典値 | NDL書誌がNDC9のみ返した場合、その値をそのまま保持 |
| `ndlc` | 補助分類 | 国立国会図書館分類表。NDL書誌から取得できた場合に併記 |

NDC9からNDC10への推測変換は行いません。分類は版ごとの書誌情報として `Edition` に紐付け、UIではWork単位へ集約して利用します。

## NDC10 第1次区分

| code | 分野 |
|---:|---|
| 0 | 総記 |
| 1 | 哲学 |
| 2 | 歴史 |
| 3 | 社会科学 |
| 4 | 自然科学 |
| 5 | 技術 |
| 6 | 産業 |
| 7 | 芸術 |
| 8 | 言語 |
| 9 | 文学 |

第1次区分はUIの大分類ファセットに使います。実際の書誌分類は `007.35`、`489.56` のような、NDL Searchが返したより細かい分類記号を保存します。

## 自動付与

`npm run classification:enrich` は、確認済みISBNを持つEditionだけを対象に、国立国会図書館サーチ OpenSearch APIをISBNで検索します。

採用条件:

1. ISBNがEditionに確認済みで存在する
2. NDL SearchのISBN検索結果から分類URIが返る
3. `http://id.ndl.go.jp/class/ndc10/`、`ndc9/`、`ndlc/` の値だけを採用
4. 返却されたコードを変換せず保存
5. 検索URL・取得日時を証跡として保存

分類が返らないEditionは90日後、API障害は翌日に再試行します。

## 正準データ

`data/classifications.json` に次を保持します。

- `classification_schemes`
- `ndc10_main_classes`
- `records`

各recordには以下を保存します。

- `work_id`
- `edition_id`
- `scheme_id`
- `code`
- `uri`
- `main_class_code` / `main_class_label`（NDC10のみ）
- `source_provider`
- `source_isbn13`
- `source_url`
- `verified_at`

## API

正準配列はすべてAPIへ自動公開します。

```text
/api/v1/classifications.json
/api/v1/classifications.csv
/api/v1/classification_schemes.json
/api/v1/classification_schemes.csv
/api/v1/ndc10_main_classes.json
/api/v1/ndc10_main_classes.csv
```

運用監査も公開します。

```text
/api/v1/classification_attempts.json
/api/v1/classification_results.json
```

## 一次情報

- 日本図書館協会「日本十進分類法（NDC）」: https://www.jla.or.jp/ndc/
- 日本図書館協会 分類委員会: https://www.jla.or.jp/committees/bunrui/
- 国立国会図書館「分類、件名、ジャンル・形式用語」: https://www.ndl.go.jp/data/catstandards/classification_subject
- NDL Search API仕様: https://ndlsearch.ndl.go.jp/help/api/specifications
- DC-NDL（RDF）ver.3.0: https://ndlsearch.ndl.go.jp/renkei/dcndl/version3
