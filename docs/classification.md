# 日本の図書館分類コード

KAFKA BOOKSでは **日本十進分類法（NDC）** を標準分類として保持します。独自の表示カテゴリ（例: 投資・金融、コンピュータ・AI）とは別のフィールドです。

## 正準方針

- `NDC10`（日本十進分類法 新訂10版）を主分類として扱う
- NDL Searchが `NDC9` を返した場合はNDC9として保持し、NDC10へ推測変換しない
- 既存の独自カテゴリはNDCから決定論的に導出できる場合だけ自動補完する
- すでに人手でカテゴリが付いているWorkでも、NDCコードは別途取得する
- ISBN確認済みEditionではISBN一致を優先し、ISBNがない場合だけ厳格な書名一致を使う
- NDL SearchのURL、照合方式、取得日時を証跡として保持する

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

UIではこの1桁を大分類ファセットとして使い、詳細画面/APIでは `338.18` のようなフルコードを保持します。

## データフロー

```text
NDL Search OpenSearch
  -> category-enrichments.json（取得証跡の唯一の正準台帳）
      -> 独自表示カテゴリ
      -> classifications（標準NDC API、決定論的派生）
```

分類を別の取得Workflowや二重台帳に保存しません。

## API

正準catalogから次を自動配信します。

```text
/api/v1/classifications.json
/api/v1/classifications.csv
/api/v1/classification_schemes.json
/api/v1/classification_schemes.csv
/api/v1/ndc10_main_classes.json
/api/v1/ndc10_main_classes.csv
```

取得運用の監査リストもAPIで取得できます。

```text
/api/v1/category_enrichments.json
/api/v1/category_enrichment_attempts.json
/api/v1/category_enrichment_results.json
```

## 一次情報

- 日本図書館協会「日本十進分類法（NDC）」: https://www.jla.or.jp/ndc/
- 日本図書館協会 分類委員会: https://www.jla.or.jp/committees/bunrui/
- 国立国会図書館「分類、件名、ジャンル・形式用語」: https://www.ndl.go.jp/data/catstandards/classification_subject
- NDL Search API仕様: https://ndlsearch.ndl.go.jp/help/api/specifications
- DC-NDL（RDF）ver.3.0: https://ndlsearch.ndl.go.jp/renkei/dcndl/version3
