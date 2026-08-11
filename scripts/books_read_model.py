from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "api" / "v1"
KINDLE_MANIFEST = ROOT / "data" / "kindle" / "manifest.json"
MAX_LIMIT = 100


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _require_api() -> None:
    if not (API_ROOT / "manifest.json").is_file():
        raise RuntimeError("api/v1 is not materialized; run `npm run api:build` first")


def manifest() -> dict[str, Any]:
    _require_api()
    return _load_json(API_ROOT / "manifest.json")


def _collection_file(name: str) -> Path:
    _require_api()
    return API_ROOT / f"{name}.json"


def collection(name: str) -> list[dict[str, Any]]:
    path = _collection_file(name)
    if not path.is_file():
        raise KeyError(f"collection is not materialized: {name}")
    payload = _load_json(path)
    if not isinstance(payload, list):
        raise TypeError(f"collection {name} must be a list")
    return [row for row in payload if isinstance(row, dict)]


def optional_collection(name: str) -> tuple[list[dict[str, Any]], str | None]:
    path = _collection_file(name)
    if not path.is_file():
        return [], "collection_not_materialized"
    return collection(name), None


def _validate_limit(limit: int) -> None:
    if not 1 <= limit <= MAX_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_LIMIT}")


def search_works(query: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    _validate_limit(limit)
    rows = collection("works")
    if query:
        needle = query.casefold().strip()
        rows = [
            row
            for row in rows
            if needle
            in " ".join(
                str(row.get(key) or "")
                for key in ("title", "author", "category", "work_id")
            ).casefold()
        ]
    return rows[:limit]


def by_id(collection_name: str, field: str, value: str) -> dict[str, Any] | None:
    return next((row for row in collection(collection_name) if row.get(field) == value), None)


def holdings(work_id: str | None = None, edition_id: str | None = None) -> list[dict[str, Any]]:
    rows = collection("holdings")
    if work_id is not None:
        rows = [row for row in rows if row.get("work_id") == work_id]
    if edition_id is not None:
        rows = [row for row in rows if row.get("edition_id") == edition_id]
    return rows


def acquisitions(limit: int = 100) -> tuple[list[dict[str, Any]], str | None]:
    _validate_limit(limit)
    rows, null_reason = optional_collection("acquisitions")
    return rows[:limit], null_reason


def isbn_evidence(work_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    _validate_limit(limit)
    rows = collection("isbn_enrichments")
    if work_id:
        rows = [row for row in rows if row.get("work_id") == work_id]
    return rows[:limit]


def kindle_match_audit() -> dict[str, Any]:
    payload = _load_json(KINDLE_MANIFEST)
    return {
        "schema": payload.get("schema"),
        "source_sha256": payload.get("source_sha256"),
        "sync_time": payload.get("sync_time"),
        "raw_record_count": payload.get("raw_record_count"),
        "record_count": payload.get("record_count"),
        "unique_asin_count": payload.get("unique_asin_count"),
        "origin_counts": payload.get("origin_counts"),
        "storage": payload.get("storage"),
        "parts": [
            {
                "name": part.get("name"),
                "records": part.get("records"),
                "bytes": part.get("bytes"),
                "sha256": part.get("sha256"),
            }
            for part in payload.get("parts", [])
        ],
    }


def collection_provenance(name: str) -> dict[str, Any]:
    info = manifest()
    file_name = f"{name}.json"
    item = next((row for row in info.get("files", []) if row.get("name") == file_name), None)
    available = item is not None
    generated_at = info.get("generated_at") or info.get("source_generated_at")
    data_as_of = info.get("data_as_of") or info.get("source_generated_at")
    return {
        "canonical_id": f"kafka.books.api.v1:{name}",
        "schema_version": info.get("source_schema_version"),
        "data_as_of": data_as_of,
        "generated_at": generated_at,
        "source_type": "materialized_api_json",
        "source_id": file_name,
        "source_hash": item.get("sha256") if item else None,
        "freshness": "snapshot" if available else "unavailable",
        "null_reason": None if available else "collection_not_materialized",
        "derivation_method": "deterministic_materialization",
        "collection": name,
        "source_schema_version": info.get("source_schema_version"),
        "source_generated_at": info.get("source_generated_at"),
        "artifact": file_name if available else None,
        "bytes": item.get("bytes") if item else None,
        "sha256": item.get("sha256") if item else None,
    }


def data_health() -> dict[str, Any]:
    info = manifest()
    files = info.get("files", [])
    hashes_valid = True
    for item in files:
        path = API_ROOT / str(item.get("name"))
        if not path.is_file():
            hashes_valid = False
            break
        if hashlib.sha256(path.read_bytes()).hexdigest() != item.get("sha256"):
            hashes_valid = False
            break
    return {
        "schema_version": "kafka.books.data-health.v1",
        "api_version": info.get("api_version"),
        "source_schema_version": info.get("source_schema_version"),
        "source_generated_at": info.get("source_generated_at"),
        "data_as_of": info.get("data_as_of") or info.get("source_generated_at"),
        "generated_at": info.get("generated_at") or info.get("source_generated_at"),
        "record_counts": info.get("record_counts"),
        "file_count": len(files),
        "artifact_hashes_valid": hashes_valid,
        "edinetdb_mode": "not_applicable",
    }
