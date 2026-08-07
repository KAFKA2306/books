# ISBN定期拡充

ISBN未確認の所蔵を、機械的かつ監査可能に再照合する運用です。

## 実行周期

`.github/workflows/isbn-enrichment.yml` を毎日 `02:17 UTC`（日本時間11:17）に実行します。手動実行では1回の対象件数を1〜100件で指定できます。通常は25件です。

## 情報源

候補発見と相互照合に次の公開APIを使用します。

- 国立国会図書館サーチ OpenSearch API
  - https://ndlsearch.ndl.go.jp/help/api/specifications
- openBD 書誌API
  - https://openbd.jp/
- Google Books API
  - https://developers.google.com/books/docs/v1/using

Google Books APIキーは任意です。リポジトリSecret `GOOGLE_BOOKS_API_KEY` が設定されている場合だけ使用します。

## 自動採用条件

次の全条件を満たしたISBNだけを `verified` として反映します。

1. ISBN-13のチェックディジットが正しい
2. 既存作品タイトルとのDice類似度が95%以上
3. 異なる提供元2つ以上が同じISBNを返す
4. 上記を満たすISBNがその作品について1件だけ
5. 未確認Editionが1件だけで、Kindle・電子版ではない
6. 既存ISBN、Edition ID、Workとの重複・参照整合性を全検証する

複数のISBNが合意条件を満たす場合は `ambiguous` として採用しません。候補なしは30日後、曖昧候補は90日後、提供元障害は翌日に再試行します。

## 監査ファイル

- `data/isbn-enrichments.json`: 採用済みISBNと照合元
- `data/isbn-enrichment-state.json`: 作品別の試行結果と次回試行日
- `data/isbn-enrichment-report.json`: 直近バッチの件数・判断・エラー

入力原文やAPIレスポンス全体は保存しません。採用したISBN、必要な書誌項目、出典URL、判定結果だけを保持します。

## 反映と障害検知

自動実行は `npm run check` が成功した場合だけ監査ファイルをmainへpushします。GitHubの `GITHUB_TOKEN` によるpushは別ワークフローを自動起動しないため、Pages用ワークフローを `workflow_dispatch` で明示起動します。

失敗時は `ISBN enrichment automation failed` Issueを作成し、既に開いている場合は同じIssueへ実行URLを追記します。

## 手動確認

```bash
npm run isbn:enrich -- --limit 25 --dry-run
npm run isbn:enrich -- --limit 25
npm run check
```
