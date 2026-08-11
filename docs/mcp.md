# Read-only MCP

KAFKA BOOKSのMCPは、既存の公開APIと別のデータベースを持ちません。`npm run api:build` が生成した `api/v1/*.json` を、そのままread modelとして読みます。

## 境界

- read-only
- `KAFKA2306/books` は EDINET DB consumer ではない
- raw Kindle XMLをMCPへ返さない
- 未materializeのAcquisitionをHoldingから推測生成しない
- ISBN enrichmentの曖昧候補をverified ISBNとして返さない
- Work / Edition / Holding / Acquisition の意味を混同しない

中央EDINET DB policy: https://github.com/KAFKA2306/semiconductor-earnings-model/blob/main/docs/edinetdb-consumer-registry.md

## Protocol / SDK

実装基準は正式MCP `2026-07-28` とMCP Python SDK v2です。v2の `from mcp.server import MCPServer` を使用し、旧 `initialize` / `initialized` handshakeや `Mcp-Session-Id` を前提にしません。

- MCP specification: https://modelcontextprotocol.io/specification/2026-07-28
- MCP Python SDK v2: https://py.sdk.modelcontextprotocol.io/

## 起動

```bash
npm run api:build
python -m pip install 'mcp>=2,<3'
python scripts/books_mcp_server.py
```

既定は `127.0.0.1:8010` のStreamable HTTPです。

## Tools

- `search_works`
- `get_work`
- `get_edition`
- `get_holdings`
- `get_acquisitions`
- `get_isbn_evidence`
- `get_kindle_match_audit`
- `get_manifest`
- `get_data_health`

MCP Python SDK v2の `MCPServer` を使うため、tool catalogはMCPの標準discovery/list pathから取得できます。

## Provenance

collectionを返すtoolは `provenance` objectを持ち、対応する公開JSON artifactについて次を必須で返します。

- `canonical_id`: `kafka.books.api.v1:<collection>`
- `schema_version`: 正準catalogのschema version
- `data_as_of`: 正準snapshotの基準時点
- `generated_at`: 再現可能なsnapshot生成時点
- `source_type`: `materialized_api_json`
- `source_id`: `works.json` 等のmaterialized artifact名
- `source_hash`: manifestに固定されたSHA-256。未materialize時は `null`
- `freshness`: `snapshot` または `unavailable`
- `null_reason`: 利用可能時は `null`、未materialize時は理由コード
- `derivation_method`: `deterministic_materialization`

互換性のため `collection`, `source_schema_version`, `source_generated_at`, `artifact`, `bytes`, `sha256` も保持します。`get_data_health` はmaterialize済みAPI artifactを再hashし、`api/v1/manifest.json` と一致するか検証します。

`data_as_of` / `generated_at` はbuild実行時刻を勝手に注入せず、正準catalogの `generated_at` から決定します。これにより同じsnapshotから同じprovenance metadataを再生成できます。

## Acquisitionのfail-close

`acquisitions.json` が公開read modelにmaterializeされていない場合、`get_acquisitions` は空配列を「取得履歴0件」という事実として返しません。

```json
{
  "available": false,
  "null_reason": "collection_not_materialized",
  "items": []
}
```

provenance側でも `source_hash=null`, `freshness=unavailable`, `null_reason=collection_not_materialized` とし、HoldingからAcquisitionを逆推定しません。

## CI

`.github/workflows/mcp-contract.yml` は次を実行します。

1. `npm run api:build`
2. MCP v2をinstall
3. Python syntax check
4. `mcp.list_tools()` によるtool discovery検証
5. Work / Edition / Holding / ISBN evidenceが公開API JSONと一致することを検証
6. provenance必須キーとartifact SHA-256の一致を検証
7. Kindle auditにraw XML path/contentを返さないことを検証
8. manifest全artifactのSHA-256を再計算して一致を検証
9. 生成した `api/v1` を除去した後、checkoutがcleanであることを検証

workflowのpath filterは `build-api.mjs` が読むcatalog / issue records / Kindle / ISBN enrichment / category enrichmentと `src/source-groups.mjs` をすべて監視します。
