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

## 保存形式

生のXMLはリポジトリへ保存しません。`scripts/import-kindle-xml.mjs` が次の可読・監査可能な形式へ変換します。

```text
data/kindle/
  manifest.json
  records-01.ndjson
  records-02.ndjson
  ...
```

`manifest.json` は以下を保持します。

- 入力ファイル名
- 入力XMLのSHA-256
- Kindle同期日時
- Kindleソフトウェアバージョン
- 元レコード件数
- 一意ASIN件数
- Purchase / Sample / Prime / unknown等の件数
- 各NDJSON分割の件数、byte数、SHA-256

CIとローダーは分割ファイルの件数・byte数・SHA-256を検証し、一致しないデータを拒否します。

## データモデル

XMLの各 `meta_data` は `kindle_records` として保持します。ASIN単位の重複をまとめた一覧は `kindle_items` です。

取得イベントは `acquisitions` として分離します。

- `purchase`: 所有扱い。ASIN EditionとHoldingを作成
- `sample`: 非所有。履歴のみ
- `prime`: 非所有。履歴のみ
- `unknown`: 非所有。履歴のみ
- `kindle_dictionary`: 非所有。履歴のみ

同じASINにSampleとPurchaseの両方が存在する場合、取得イベントは両方残し、所蔵はPurchaseに基づく1件だけ作ります。

## 既存の手入力Kindleデータ

既存の `Kindleスクリーンショット` Holdingと、XMLのPurchaseが同じ正規化Workへ一致した場合、スクリーンショットHoldingを削除してASINベースの `Amazon Kindle XML` Holdingへ置換します。

一致しない手入力レコードは自動削除しません。`kindle_match_audit` に `kept_unmatched` として残し、誤削除を防ぎます。

## API

Kindleデータが存在すると、既存の全リストAPI契約により次も自動公開されます。

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

変更を反映する場合は `data/kindle/` の差分をレビューし、通常の `npm run check` とPages CIを通してからmainへ反映します。
