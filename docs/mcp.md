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

collectionを返すtoolは、対応する公開JSON artifactについて可能な範囲で次を返します。

- source schema version
- source generated timestamp
- artifact filename
- byte count
- SHA-256
- `null_reason`

`get_data_health` はmaterialize済みAPI artifactを再hashし、`api/v1/manifest.json` と一致するか検証します。

## Acquisitionのfail-close

`acquisitions.json` が公開read modelにmaterializeされていない場合、`get_acquisitions` は空配列を「取得履歴0件」という事実として返しません。

```json
{
  "available": false,
  "null_reason": "collection_not_materialized",
  "items": []
}
```

これにより、HoldingからAcquisitionを逆推定して所有と取得履歴を混同することを防ぎます。

## CI

`.github/workflows/mcp-contract.yml` は次を実行します。

1. `npm run api:build`
2. MCP v2をinstall
3. Python syntax check
4. `mcp.list_tools()` によるtool discovery検証
5. Work / Edition / Holding / ISBN evidenceが公開API JSONと一致することを検証
6. Kindle auditにraw XML path/contentを返さないことを検証
7. manifestのSHA-256を再計算して一致を検証
