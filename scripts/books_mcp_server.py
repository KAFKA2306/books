from __future__ import annotations

from typing import Any

from mcp.server import MCPServer

import books_read_model as read_model

MCP_SCHEMA_VERSION = "kafka.books.mcp.v1"

mcp = MCPServer(
    "KAFKA BOOKS",
    version="1.0.0",
    instructions=(
        "Read-only access to the same materialized api/v1 read model used for public JSON/CSV distribution. "
        "Do not infer missing ISBN, acquisition, holding, or provenance fields."
    ),
)


def _collection(name: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema_version": MCP_SCHEMA_VERSION,
        "collection": name,
        "count": len(items),
        "items": items,
        "provenance": read_model.collection_provenance(name),
    }


@mcp.tool()
def search_works(query: str | None = None, limit: int = 20) -> dict[str, Any]:
    """Search canonical works by title, author, category or work ID."""
    return _collection("works", read_model.search_works(query=query, limit=limit))


@mcp.tool()
def get_work(work_id: str) -> dict[str, Any]:
    """Get one canonical Work by deterministic work_id."""
    item = read_model.by_id("works", "work_id", work_id)
    return {
        "schema_version": MCP_SCHEMA_VERSION,
        "found": item is not None,
        "work": item,
        "provenance": read_model.collection_provenance("works"),
    }


@mcp.tool()
def get_edition(edition_id: str) -> dict[str, Any]:
    """Get one Edition without turning an unverified ISBN into a verified fact."""
    item = read_model.by_id("editions", "edition_id", edition_id)
    return {
        "schema_version": MCP_SCHEMA_VERSION,
        "found": item is not None,
        "edition": item,
        "provenance": read_model.collection_provenance("editions"),
    }


@mcp.tool()
def get_holdings(
    work_id: str | None = None,
    edition_id: str | None = None,
) -> dict[str, Any]:
    """List holdings filtered by Work and/or Edition identifiers."""
    return _collection(
        "holdings",
        read_model.holdings(work_id=work_id, edition_id=edition_id),
    )


@mcp.tool()
def get_acquisitions(limit: int = 100) -> dict[str, Any]:
    """Return explicit acquisition records when materialized; never synthesize them from holdings."""
    items, null_reason = read_model.acquisitions(limit=limit)
    return {
        "schema_version": MCP_SCHEMA_VERSION,
        "collection": "acquisitions",
        "available": null_reason is None,
        "null_reason": null_reason,
        "count": len(items),
        "items": items,
        "provenance": read_model.collection_provenance("acquisitions"),
    }


@mcp.tool()
def get_isbn_evidence(
    work_id: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """Return ISBN enrichment evidence and audit status without promoting guesses to facts."""
    return _collection(
        "isbn_enrichments",
        read_model.isbn_evidence(work_id=work_id, limit=limit),
    )


@mcp.tool()
def get_kindle_match_audit() -> dict[str, Any]:
    """Return the sanitized Kindle import manifest and acquisition-type counts, not raw XML."""
    return {
        "schema_version": MCP_SCHEMA_VERSION,
        "audit": read_model.kindle_match_audit(),
    }


@mcp.tool()
def get_manifest() -> dict[str, Any]:
    """Return the public API distribution manifest with counts, bytes and SHA-256 values."""
    return {
        "schema_version": MCP_SCHEMA_VERSION,
        "manifest": read_model.manifest(),
    }


@mcp.tool()
def get_data_health() -> dict[str, Any]:
    """Verify materialized API artifact hashes and report record-count health."""
    return read_model.data_health()


def main() -> None:
    """Run the read-only MCP server on localhost."""
    mcp.run("streamable-http", host="127.0.0.1", port=8010)


if __name__ == "__main__":
    main()
