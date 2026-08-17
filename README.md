# KAFKA BOOKS

[![Validate and deploy Pages](https://github.com/KAFKA2306/books/actions/workflows/ci-pages.yml/badge.svg)](https://github.com/KAFKA2306/books/actions/workflows/ci-pages.yml)
[![Books MCP contract](https://github.com/KAFKA2306/books/actions/workflows/mcp-contract.yml/badge.svg)](https://github.com/KAFKA2306/books/actions/workflows/mcp-contract.yml)

**本が増えるほど、「持っているか」「読んだか」「どの版か」が一つの答えではなくなる。**

KAFKA BOOKS は、個人の蔵書を **作品（Work）・版（Edition）・所蔵（Holding）・取得履歴（Acquisition）** に分け、曖昧な読書記録を「後から確認できる本棚」へ変える静的ライブラリDBです。

- 公開UI: https://kafka2306.github.io/books/
- 公開API: https://kafka2306.github.io/books/api/v1/collections.json

## Vision

蔵書管理を「タイトル一覧」から、**自分が何を、どの版で、どの経路から、本当に所有しているかを説明できる記録**へ変えます。

利用者が知りたいのは単なる冊数ではありません。

- この作品は持っているか
- Kindle Sample を購入済みと数えていないか
- 同じ作品の紙版・Kindle版・改訂版をどう区別したか
- 後からISBNやASINが分かったとき、既存記録を壊さず更新できるか

KAFKA BOOKS は、これらを一つの `title` フィールドへ押し込めず、意味の違いをデータモデルとして残します。

## Design philosophy

- **作品と版と所有を混ぜない。** Work / Edition / Holding / Acquisition を別責務にする。
- **所有を推測しない。** Kindle `Purchase` だけをHoldingへ昇格し、Sample / Prime / Dictionary / unknownは取得履歴として残す。
- **書き込む前に診断する。** ISBN・重複・既存Workとの関係をprecheckし、曖昧な行を自動確定しない。
- **正準データは人間にも読める形で置く。** JSON / NDJSONを優先し、raw Kindle XMLやdebug sourceを公開repoへ保存しない。
- **UIとAPIで別の真実を作らない。** `catalog.json` とmanifestから公開artifactを生成し、件数・byte数・SHA-256を検証する。
- **分からないものを消さない。** 自動照合できないrecordは温存し、後から根拠を追加できる状態にする。

## Why / 差別化

一般的な読書管理では、タイトル・ISBN・購入状態を一つの「本」レコードとして扱いがちです。しかし実際には、同じ作品に複数版があり、KindleではSampleとPurchaseが同じ識別子に共存し、後から正規ISBNやASINが分かることもあります。

KAFKA BOOKS の差別化はschemaの多さではなく、**「なぜこの本を所有と数えたのか」「なぜ同じ作品として統合したのか」を元データと監査結果まで遡って説明できること**です。

## 現在のデータ

`npm run check` と公開APIで検証する主な正準集合:

- Work: 作品単位
- Edition: ISBN / ASIN 等で識別する版・形式
- Holding: 実際の所蔵
- Acquisition: Purchase / Sample / Prime 等の取得イベント
- Kindle records / items / match audit
- ISBN enrichment / attempts / results

現行の件数・価格集計は公開APIと `api/v1/manifest.json` を正準確認先とします。READMEの固定数値より、生成artifactの現在値を優先します。

## 正準データ

- `data/catalog.json` — 基本カタログ
- `data/issue-1-books.json` — Issue取込記録
- `data/kindle/manifest.json` + `data/kindle/records-*.ndjson` — Kindle正規化データ
- `data/isbn-enrichments.json` — ISBN拡充overlay

`catalog.json` と `issue-1-books.json` は読み取り可能なJSONを唯一の入力経路とし、旧 `base64+gzip` 分割データへのfallbackは持ちません。

## Kindle XML → 所蔵までの境界

Kindle for PC の `KindleSyncMetadataCache.xml` を、Kindle由来情報の機械的な一次入力として扱います。

```text
Kindle XML
  → normalize
  → acquisition event
  → existing Work / Edition と照合
  → PurchaseだけHoldingへ昇格
  → manifest / audit
```

Windows既定パス:

```text
%LOCALAPPDATA%\Amazon\Kindle\Cache\KindleSyncMetadataCache.xml
```

同期:

```powershell
npm run kindle:sync
```

raw XMLはGitHubへ保存しません。入力hash、必要な書誌情報、取得意味だけを正規化して残します。

### Kindleの意味論

| origin | Holdingを作るか | 扱い |
|---|---:|---|
| `purchase` | Yes | 所有 |
| `sample` | No | 取得履歴のみ |
| `prime` | No | 取得履歴のみ |
| `kindle_dictionary` | No | 取得履歴のみ |
| `unknown` | No | 取得履歴のみ |

Sample→Purchaseは両イベントを残し、HoldingはPurchaseに基づく1件だけです。

## Precheck — 書き込む前に意味を決める

```bash
npm run catalog:precheck -- data/import.template.json
```

主な判定:

1. ISBN-10 → ISBN-13変換
2. ISBNチェックディジット検証
3. 既存ISBN完全一致を停止
4. 同一バッチISBN重複を停止
5. ISBNなしの正規化書名一致を停止
6. 新ISBN + 既存作品名は既存WorkへのEdition追加候補
7. 類似度86%以上は警告

「CSVを読めた」ことと「安全に登録できる」ことを同一視しません。

## 公開API

Base URL:

```text
https://kafka2306.github.io/books/api/v1/
```

正準入口:

```text
https://kafka2306.github.io/books/api/v1/collections.json
```

各collectionはJSON/CSVを配信し、`api/v1/manifest.json` で生成元、件数、byte数、SHA-256を監査できます。

詳細: [docs/api.md](docs/api.md)

## 正規化ポリシー

表示名では「意味のある数字」を消さず、巻・版・号などの構造だけを分離します。

除去対象例:
- `上巻` / `下巻`
- `第2巻` / `2巻`
- `第2版` / `新版` / `新装改訂版`
- 雑誌年月号

保持例:
- `1984年`
- `1Q84`
- `22世紀の民主主義`
- `13歳からの地政学`

## ISBN定期拡充

`.github/workflows/isbn-enrichment.yml` で候補を取得し、チェックディジット・書名一致・複数provider合意を通ったものだけ採用します。

- 合意候補が複数なら `ambiguous`
- Kindle / 電子版へ紙版ISBNを推測接続しない
- `npm run check` 成功後だけmainへ反映

詳細: [docs/isbn-enrichment.md](docs/isbn-enrichment.md)

## 検証

Node.js 22以上。追加依存なし。

```bash
npm run check
```

CIでは少なくとも次を検証します。

- Work / Edition / Holding ID一意性
- ISBN / ASINの妥当性と重複
- orphan reference
- PurchaseだけがKindle Holdingを作ること
- Sample / PrimeがHoldingへ混入しないこと
- manifest件数・byte数・SHA-256
- API collection parity
- raw Kindle XML / debug sourceがcommitされていないこと

## Repository map

```text
data/        canonical catalog / Kindle / enrichment data
api/v1/      generated public API
scripts/     import / normalize / validate / build
src/         canonical domain / normalization logic
docs/        API / import / operating contracts
tests/       deterministic contracts
index.html   static bookshelf UI entry point
```

## Done

このrepositoryの完成条件は「本をたくさん登録する」ことではありません。

**新しい記録が増えても、何を作品・版・所有・取得と判断したかを後から説明できること**を維持できている状態をDoneとします。
