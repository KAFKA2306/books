# Data Quality

KAFKA BOOKSの品質契約は、Work / Edition / Holding / Acquisitionを別概念として保持し、未確認情報を事実へ昇格させないことです。

## Fail-close rules

- Work / Edition / HoldingのID一意性を検証する
- Edition / Holding / Acquisitionの参照整合性を検証する
- ISBNチェックディジットと重複を検証する
- Kindleでは `purchase` だけをHoldingへ変換する
- `sample` / `prime` / `kindle_dictionary` / `unknown` を所有として扱わない
- raw Kindle XMLをGitHubやMCPへ公開しない
- 公開APIのcollection件数・bytes・SHA-256をmanifestで検証する
- MCPはmaterialized `api/v1` を読み、公開APIと別の計算・DBを持たない
- 公開read modelに存在しないcollectionを0件と断定せず、`null_reason`を返す

## Automated checks

通常の `npm run check` に加えて、`.github/workflows/mcp-contract.yml` が以下を検証します。

- MCP tool catalog discovery
- Work / Edition / HoldingのAPI/MCP parity
- ISBN evidence parity
- Kindle auditからraw XML path/contentが除外されていること
- `api/v1/manifest.json` のSHA-256を実ファイルから再計算した一致
- `edinetdb_mode=not_applicable`

## Related

- [API](api.md)
- [Ingestion rules](ingestion-rules.md)
- [Kindle import](kindle-import.md)
- [ISBN enrichment](isbn-enrichment.md)
- [MCP](mcp.md)
