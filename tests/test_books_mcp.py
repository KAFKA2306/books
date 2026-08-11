from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

READ_MODEL_SPEC = importlib.util.spec_from_file_location(
    "books_read_model", SCRIPTS / "books_read_model.py"
)
assert READ_MODEL_SPEC and READ_MODEL_SPEC.loader
read_model = importlib.util.module_from_spec(READ_MODEL_SPEC)
sys.modules[READ_MODEL_SPEC.name] = read_model
READ_MODEL_SPEC.loader.exec_module(read_model)

SERVER_SPEC = importlib.util.spec_from_file_location(
    "books_mcp_server", SCRIPTS / "books_mcp_server.py"
)
assert SERVER_SPEC and SERVER_SPEC.loader
server = importlib.util.module_from_spec(SERVER_SPEC)
sys.modules[SERVER_SPEC.name] = server
SERVER_SPEC.loader.exec_module(server)


def api_json(name: str):
    return json.loads((ROOT / "api" / "v1" / name).read_text(encoding="utf-8"))


def test_mcp_tool_catalog_is_discoverable() -> None:
    tools = asyncio.run(server.mcp.list_tools())
    names = {tool.name for tool in tools}
    assert names == {
        "search_works",
        "get_work",
        "get_edition",
        "get_holdings",
        "get_acquisitions",
        "get_isbn_evidence",
        "get_kindle_match_audit",
        "get_manifest",
        "get_data_health",
    }


def test_search_works_reads_same_materialized_api_collection() -> None:
    works = api_json("works.json")
    result = read_model.search_works(limit=1)
    assert result == works[:1]


def test_work_edition_holding_ids_preserve_public_api_semantics() -> None:
    work = api_json("works.json")[0]
    edition = next(row for row in api_json("editions.json") if row["work_id"] == work["work_id"])
    holdings = [row for row in api_json("holdings.json") if row["work_id"] == work["work_id"]]
    assert read_model.by_id("works", "work_id", work["work_id"]) == work
    assert read_model.by_id("editions", "edition_id", edition["edition_id"]) == edition
    assert read_model.holdings(work_id=work["work_id"]) == holdings


def test_collection_provenance_is_hash_bound_and_complete() -> None:
    manifest = api_json("manifest.json")
    provenance = read_model.collection_provenance("works")
    required = {
        "canonical_id",
        "schema_version",
        "data_as_of",
        "generated_at",
        "source_type",
        "source_id",
        "source_hash",
        "freshness",
        "null_reason",
        "derivation_method",
    }
    assert required <= provenance.keys()
    assert provenance["canonical_id"] == "kafka.books.api.v1:works"
    assert provenance["schema_version"] == manifest["source_schema_version"]
    assert provenance["data_as_of"] == manifest["data_as_of"]
    assert provenance["generated_at"] == manifest["generated_at"]
    assert provenance["source_type"] == "materialized_api_json"
    assert provenance["source_id"] == "works.json"
    works_file = next(row for row in manifest["files"] if row["name"] == "works.json")
    assert provenance["source_hash"] == works_file["sha256"]
    assert provenance["freshness"] == "snapshot"
    assert provenance["null_reason"] is None
    assert provenance["derivation_method"] == "deterministic_materialization"

    tool_result = server.search_works(limit=1)
    assert tool_result["provenance"] == provenance


def test_missing_acquisition_collection_is_not_synthesized() -> None:
    items, null_reason = read_model.acquisitions(limit=10)
    acquisition_path = ROOT / "api" / "v1" / "acquisitions.json"
    provenance = read_model.collection_provenance("acquisitions")
    if acquisition_path.exists():
        assert null_reason is None
        assert items == api_json("acquisitions.json")[:10]
        assert provenance["null_reason"] is None
        assert provenance["freshness"] == "snapshot"
    else:
        assert items == []
        assert null_reason == "collection_not_materialized"
        assert provenance["source_hash"] is None
        assert provenance["freshness"] == "unavailable"
        assert provenance["null_reason"] == "collection_not_materialized"


def test_kindle_audit_is_sanitized_and_keeps_acquisition_type_counts() -> None:
    audit = read_model.kindle_match_audit()
    assert "source_file" not in audit
    assert "raw_xml" not in audit
    assert isinstance(audit["origin_counts"], dict)
    assert set(audit["origin_counts"]) >= {"purchase", "sample", "prime", "unknown"}
    assert all(len(part["sha256"]) == 64 for part in audit["parts"])


def test_manifest_hashes_and_edinetdb_boundary_are_healthy() -> None:
    health = read_model.data_health()
    manifest = api_json("manifest.json")
    assert health["artifact_hashes_valid"] is True
    assert health["edinetdb_mode"] == "not_applicable"
    assert health["data_as_of"] == manifest["data_as_of"]
    assert health["generated_at"] == manifest["generated_at"]
    assert health["record_counts"]["works"] == len(api_json("works.json"))
    assert health["record_counts"]["editions"] == len(api_json("editions.json"))
    assert health["record_counts"]["holdings"] == len(api_json("holdings.json"))


def test_isbn_evidence_matches_public_collection() -> None:
    expected = api_json("isbn_enrichments.json")
    assert read_model.isbn_evidence(limit=100) == expected[:100]
