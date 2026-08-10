# Methodology

## Canonical flow

```text
source inputs
  -> deterministic normalization / precheck
  -> Work / Edition / Holding / Acquisition model
  -> overlays with explicit evidence
  -> materialized api/v1 JSON + CSV + manifest
  -> UI and read-only MCP
```

MCPは最終段のadapterであり、独自の書誌統合・ISBN推測・所有判定を行いません。

## Identity

- Work: 正規化書名を基礎にしたdeterministic ID
- Edition: verified ISBN-13を優先し、KindleはASINを優先
- Holding: 所有・所蔵の実体
- Acquisition: Purchase / Sample / Prime / Kindle Dictionary / unknown等の取得イベント

WorkとEditionを分離し、ISBNを作品そのもののIDとして扱いません。

## Kindle

`KindleSyncMetadataCache.xml` はローカル入力として処理し、raw XMLはGitHubへ保存しません。必要なfieldだけを正規化し、manifestにinput SHA-256、record count、part bytes/hashを保持します。

`purchase`だけをHoldingに変換します。その他の取得種別はAcquisitionとして保持し、所有へ変換しません。

## ISBN

ISBN enrichmentはチェックディジットと書名一致を必須にし、複数sourceの合意条件を満たした候補だけを採用します。曖昧候補は登録しません。Kindle Editionへ紙版ISBNを推測接続しません。

## Distribution parity

`npm run api:build` は正本をmaterializeして `api/v1` を生成します。MCPはそのmaterialized JSONを直接読むため、UI/APIと別のデータ解釈経路を持ちません。

## EDINET DB boundary

このrepositoryは書籍データを扱うため、現在のcontractではEDINET DBをdata sourceとして使用しません。中央quota-owner registryでは `not_applicable` とし、上場企業財務が明示的に必要になるまで外部quota依存を追加しません。

## Related

- [Ingestion rules](ingestion-rules.md)
- [Kindle import](kindle-import.md)
- [ISBN enrichment](isbn-enrichment.md)
- [Data Quality](data-quality.md)
- [MCP](mcp.md)
