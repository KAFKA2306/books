# Kindle XML 取込

KAFKA BOOKS では Amazon Kindle for PC のローカルメタデータを、Kindle由来情報の機械的な正準入力として扱います。

## 入力

Windows版 Kindle の既定入力:

```text
%LOCALAPPDATA%\Amazon\Kindle\Cache\KindleSyncMetadataCache.xml
```

`npm run kindle:sync` は Windows ではこのパスを自動検出します。別パスを使う場合は、第一引数または `KINDLE_XML_PATH` で指定します。

```powershell
npm run kindle:sync
```

明示指定:

```powershell
npm run kindle:sync -- "C:\Users\front\AppData\Local\Amazon\Kindle\Cache\KindleSyncMetadataCache.xml"
```

## 現在のスナップショット

2026-06-06同期XMLを今回取り込んだ結果:

| 指標 | 件数 |
|---|---:|
| raw `meta_data` | 690 |
| 完全重複除去後 | 685 |
| Kindle item / 識別子 | 680 |
| Purchase | 455 |
| Sample | 204 |
| Prime | 10 |
| KindleDictionary | 1 |
| origin不明 | 15 |

680識別子のうち679件は通常の `B` で始まるKindle ASINで、1件はPersonal Document系の識別子です。後者は取得履歴として保持しますが、Amazon Kindle Edition/Holdingへは自動昇格させません。

## 完全重複の扱い

XMLには内容が完全一致する5行が存在しました。`scripts/import-kindle-xml.mjs` は次の意味情報がすべて一致する行だけを同一イベントとして除去します。

- ASIN/識別子
- title
- authors / publishers
- publication_date
- acquired_at
- origin_type
- cde_contenttype / content_type / textbook_type

`ordinal` や内部 `record_id` の違いは重複判定に使いません。

一方、同じASINでも `Sample` と `Purchase`、取得日時、origin等が異なる行は別イベントとして保持します。これにより、Sample→Purchaseの履歴を消さず、同一Purchaseの二重計上だけを防ぎます。

## 保存形式

生のXMLはリポジトリへ保存しません。必要な情報だけを可読・監査可能な形式へ変換します。

```text
data/kindle/
  manifest.json
  records-01.ndjson
  records-02.ndjson
  ...
  records-14.ndjson
```

現在のsnapshotは、列名をmanifestへ一度だけ持たせる `compact-ndjson-array` 形式です。Base64/gzipではなく、GitHub上で差分確認・検索可能なテキストとして保持します。

`manifest.json` は以下を保持します。

- 入力ファイル名
- 入力XMLのSHA-256
- Kindle同期日時
- Kindleソフトウェアバージョン
- raw件数 / 重複除去後件数
- 一意識別子件数
- Purchase / Sample / Prime / KindleDictionary / unknown件数
- compact NDJSONのfields
- 各分割の件数、byte数、SHA-256

ローダーは分割ファイルの件数・byte数・SHA-256と総件数を検証し、一致しないデータを拒否します。以前のobject-NDJSON形式も後方互換で読み取れます。

## データモデル

各正規化行は `kindle_records` として保持します。識別子単位の統合一覧は `kindle_items`、取得イベントは `acquisitions` です。

- `purchase`: 所有扱い。ASIN EditionとHoldingを作成
- `sample`: 非所有。履歴のみ
- `prime`: 非所有。履歴のみ
- `unknown`: 非所有。履歴のみ
- `kindle_dictionary`: 非所有。履歴のみ

同じASINにSampleとPurchaseの両方が存在する場合、取得イベントは両方残し、所蔵はPurchaseに基づく1件だけ作ります。

## 既存の手入力Kindleデータ

既存の `Kindleスクリーンショット` Holdingと、XMLのPurchaseが同じ正規化Workへ一致した場合、スクリーンショットHoldingを削除してASINベースの `Amazon Kindle XML` Holdingへ置換します。

今回の照合監査490件:

- `created_work`: 410
- `matched_work`: 45
- `replaced_by_xml_purchase`: 2
- `kept_unmatched`: 33

一致しない手入力レコードは自動削除せず、`kindle_match_audit` に `kept_unmatched` として残します。

## API

Kindleデータは既存の全リストAPI契約により自動公開されます。

```text
/api/v1/kindle_records.json
/api/v1/kindle_records.csv
/api/v1/kindle_items.json
/api/v1/kindle_items.csv
/api/v1/acquisitions.json
/api/v1/acquisitions.csv
/api/v1/kindle_match_audit.json
/api/v1/kindle_match_audit.csv
```

`collections.json` に自動登録されるため、APIクライアント側のハードコード追加は不要です。

## 更新運用

Kindle for PCを同期した後に `npm run kindle:sync` を再実行します。同じXMLからは決定論的に同じ正規化データが生成されます。

変更を反映する場合は `data/kindle/` の差分をレビューし、`npm run check` とPages CIを通してからmainへ反映します。