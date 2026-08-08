# カテゴリ自動付与

KAFKA BOOKS の `category` は、未分類の Work に対して機械的に補完する。
人手や LLM の自由分類は定期処理に使わない。

## 正準データ源

分類コードの取得元は国立国会図書館サーチ（NDL Search）の OpenSearch API とする。

- API: https://ndlsearch.ndl.go.jp/api/opensearch
- API仕様: https://ndlsearch.ndl.go.jp/help/api/specifications
- DC-NDL RDF仕様: https://ndlsearch.ndl.go.jp/renkei/dcndl/version3
- NDC分類基準: https://www.ndl.go.jp/data/catstandards/classification_subject

NDL Search の DC-NDL メタデータに含まれる NDC10 / NDC9 / NDC の分類コードだけを分類根拠として採用する。
検索結果中の自由キーワードや生成AIの推測は根拠にしない。

## 決定ロジック

1. `category === "未分類"` の Work だけを対象にする。
2. 検証済み ISBN-13 がある場合は ISBN 検索を優先する。
3. ISBN 検索で結果が得られない場合だけ書名検索へフォールバックする。
4. ISBN がない Work は書名検索を行い、正規化書名の Dice 類似度が 0.97 以上のレコードだけを候補にする。
5. NDCコードを `src/category-enrichment.mjs` の固定表 `categoryForNdc()` で KAFKA BOOKS のカテゴリへ変換する。
6. 候補が複数あり、変換後カテゴリが一致しない場合は `ambiguous` として不採用にする。
7. NDCがない、候補がない、APIエラーの場合は未分類のまま保持し、状態台帳に次回試行日を記録する。
8. 採用結果は `data/category-enrichments.json` に保存し、`loadCatalog()` で正準カタログへオーバーレイする。
9. 既に手動または既存ルールで `未分類` 以外になっている Work は上書きしない。

## 固定カテゴリ表

詳細な対応はコードを正準とする。主な例:

| NDC | KAFKA BOOKS category |
| --- | --- |
| 007 | コンピュータ・AI |
| 141 | 心理・行動 |
| 159 | 自己啓発・生き方 |
| 319 | 国際関係・地政学 |
| 336 | 経営・会計 |
| 338 | 投資・金融 |
| 410 | 数学 |
| 490 | 医学・健康 |
| 547 | 情報通信・ネットワーク |
| 548 | 情報工学・制御 |
| 726 | 漫画・コミック |
| 790 | ゲーム・娯楽 |
| 8xx | 語学・言語 |
| 9xx | 文学・小説 |

この表の変更は `CATEGORY_RULE_VERSION` を更新してテストを追加してから行う。

## 実行

```bash
npm run category:enrich -- --limit 100
npm run check
```

GitHub Actions `Enrich book categories` は以下で起動する。

- main の本棚入力・Kindle・ISBN台帳が更新されたとき
- 6時間ごとの定期実行
- workflow_dispatch

1回の処理は逐次アクセスで実行し、NDL Search APIへ多重アクセスしない。

## 監査ファイル

- `data/category-enrichments.json`: 採用済みカテゴリの永続台帳
- `data/category-enrichment-state.json`: 成否、再試行日、APIエラー
- `data/category-enrichment-report.json`: 直近バッチの結果とポリシー

各採用レコードには NDCコード、NDC体系、NDL Searchの書誌URL、照合方式、ルールバージョン、検証日時を保持する。
