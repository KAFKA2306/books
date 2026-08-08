# カテゴリ自動付与

KAFKA BOOKS の `category` は、未分類の Work に対して機械的に補完する。
人手や LLM の自由分類は定期処理に使わない。

## 正準データ源

分類コードの取得元は国立国会図書館サーチ（NDL Search）の OpenSearch API とする。

- API: https://ndlsearch.ndl.go.jp/api/opensearch
- API仕様: https://ndlsearch.ndl.go.jp/help/api/specifications
- DC-NDL RDF仕様: https://ndlsearch.ndl.go.jp/renkei/dcndl/version3
- NDC分類基準: https://www.ndl.go.jp/data/catstandards/classification_subject

NDL Search のメタデータに含まれる NDC10 / NDC9 / NDC8 / 版不明NDC の分類コードだけを分類根拠として採用する。
検索結果中の自由キーワードや生成AIの推測は根拠にしない。

## 決定ロジック

1. 標準NDC証跡が未取得の Work を取得対象にする。表示カテゴリの自動変更は `category === "未分類"` の Work にだけ適用する。
2. 検証済み ISBN-13 がある場合は ISBN 検索を優先する。
3. ISBN 検索で結果が得られない場合だけ書名検索へフォールバックする。
4. ISBN がない Work は書名検索を行い、正規化書名の Dice 類似度が 0.97 以上のレコードだけを候補にする。
5. 採用した NDCコードを `data/category-enrichments.json` に証跡として保存する。
6. 表示カテゴリは保存済みのカテゴリ文字列を正とせず、ロード時に NDCコードを `src/category-enrichment.mjs` の固定表 `categoryForNdc()` へ通して毎回再導出する。
7. 候補が複数あり、変換後カテゴリが一致しない場合は `ambiguous` として不採用にする。
8. NDCがない、候補がない、APIエラーの場合は表示カテゴリを変更せず、状態台帳に次回試行日を記録する。
9. 既に手動または既存ルールで `未分類` 以外になっている Work は上書きしない。ただし標準NDC証跡は別レイヤーとして取得できる。
10. NDCの版は推測変換しない。NDC10、NDC9、NDC8、版不明NDCを取得元どおり保持する。

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
| 448 | 地図・測地 |
| 490 | 医学・健康 |
| 547 | 情報通信・ネットワーク |
| 548 | 情報工学・制御 |
| 726 | 漫画・コミック |
| 790 | ゲーム・娯楽 |
| 8xx | 語学・言語 |
| 9xx | 文学・小説 |

表示カテゴリ表の変更はテストを追加し、Git履歴で追跡する。NDCコードとNDL書誌URLは変更せず証跡として保持するため、表示カテゴリの修正は過去の取得結果にも決定論的に反映される。

## 実行

```bash
npm run category:enrich -- --limit 25
npm run check
```

GitHub Actions `Enrich book categories and classifications` は以下で起動する。

- main の本棚入力・Kindle・ISBN台帳が更新されたとき
- 6時間ごとの定期実行
- workflow_dispatch

通常バッチは25件。1回の処理は逐次アクセスで実行し、NDL Search APIへ多重アクセスしない。進行中バッチは別のmain更新でキャンセルしない。

## 監査ファイル

- `data/category-enrichments.json`: 採用済みNDC証跡と当時の表示カテゴリの永続台帳
- `data/category-enrichment-state.json`: 成否、再試行日、APIエラー
- `data/category-enrichment-report.json`: 直近バッチの結果とポリシー

各採用レコードには NDCコード、NDC体系、NDL Searchの書誌URL、照合方式、ルールバージョン、検証日時を保持する。
