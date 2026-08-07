# カタログAPI v1

GitHub Pages配下の `/api/v1/` で、ブラウザUIと同じ正準カタログを機械可読形式で配布します。

## エンドポイント

- `manifest.json`: 件数、SHA-256、バイト数、キャッシュ方針
- `catalog.json`: Work、Edition、Holdingを含む全体スナップショット
- `works.json` / `works.csv`: 作品単位
- `editions.json` / `editions.csv`: ISBN・版・形式単位
- `holdings.json` / `holdings.csv`: 所蔵・取得元単位

公開URL例:

```text
https://kafka2306.github.io/books/api/v1/manifest.json
https://kafka2306.github.io/books/api/v1/works.json
```

## 取得例

```bash
curl -fsS https://kafka2306.github.io/books/api/v1/manifest.json
curl -fsS https://kafka2306.github.io/books/api/v1/works.csv -o works.csv
```

```python
import requests

base = "https://kafka2306.github.io/books/api/v1"
works = requests.get(f"{base}/works.json", timeout=30).json()
reading = [row for row in works if row["status"] == "reading"]
```

## 増分取得

`manifest.json` の各 `files[].sha256` を前回値と比較してください。値が同じファイルは再取得不要です。APIはスナップショット配布であり、削除・変更を含む完全同期には `catalog.json` を使用します。

## バージョニング

- v1内では既存フィールドを削除しません。
- フィールド追加は後方互換変更として扱います。
- 破壊的変更は `/api/v2/` へ分離します。
- `source_generated_at` は正準カタログの生成日時で、APIビルド時刻ではありません。

## 欠損値

確認できないISBN、著者、出版社、出版年などは `null` です。推測値は補完しません。`verification` と `isbn_status` を品質フラグとして利用してください。

## 出典と利用条件

個人所蔵記録を基礎とし、書誌情報はREADME記載の国立国会図書館サーチ、出版社、ISBN関連一次情報などで確認します。再利用時はリポジトリのライセンスと各外部出典の利用条件を確認してください。
