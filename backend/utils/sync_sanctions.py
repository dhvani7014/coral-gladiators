"""
sync_sanctions.py
-----------------
Downloads the latest OpenSanctions "default" dataset targets CSV and appends
any new entries to coral/data/sanctions.jsonl, skipping rows whose entity_name
already exists in the file.
"""

import csv
import json
import os

import httpx

OPENSANCTIONS_URL = (
    "https://data.opensanctions.org/datasets/latest/default/targets.simple.csv"
)

JSONL_PATH = os.path.join(os.path.dirname(__file__), "../../coral/data/sanctions.jsonl")


# ---------------------------------------------------------------------------
# Field parsers  (mirror the logic in scripts/seed_sanctions.py)
# ---------------------------------------------------------------------------


def _parse_first(val: str, default: str = "") -> str:
    """Return the first token from a semicolon-delimited field."""
    if not val:
        return default
    return val.split(";")[0].strip()


def _parse_date(val: str):
    """Extract the first date from a field like '1970-01-01;1971-05-02'."""
    from datetime import datetime

    first = _parse_first(val)
    if not first:
        return None
    for fmt in ("%Y-%m-%d", "%Y"):
        try:
            return datetime.strptime(first, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _parse_sanction_type(sanctions_field: str) -> str:
    result = _parse_first(sanctions_field, "Unknown")
    return result[:200] if result else "Unknown"


def _parse_country(countries_field: str):
    result = _parse_first(countries_field)
    return result.upper() if result else None


# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------


def sync_sanctions() -> dict:
    """Download latest OpenSanctions data and append new entries to sanctions.jsonl."""

    # 1. Load existing entity names to avoid duplicates
    existing_names: set[str] = set()
    if os.path.exists(JSONL_PATH):
        with open(JSONL_PATH, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    name = obj.get("entity_name", "")
                    if name:
                        existing_names.add(name)
                except json.JSONDecodeError:
                    continue

    # 2. Download the CSV (streamed so we don't hold the whole file in memory)
    print(f"Downloading OpenSanctions CSV from {OPENSANCTIONS_URL} ...")
    with httpx.Client(follow_redirects=True, timeout=120) as client:
        response = client.get(OPENSANCTIONS_URL)
        response.raise_for_status()
        content = response.text

    # 3. Parse and append new rows
    inserted = 0
    os.makedirs(os.path.dirname(os.path.abspath(JSONL_PATH)), exist_ok=True)

    with open(JSONL_PATH, "a", encoding="utf-8") as out_fh:
        reader = csv.DictReader(content.splitlines())
        for row in reader:
            name = row.get("name", "").strip()
            if not name or name in existing_names:
                continue

            record = {
                "entity_name": name,
                "country": _parse_country(row.get("countries", "")),
                "sanction_type": _parse_sanction_type(row.get("sanctions", "")),
                "listed_date": _parse_date(row.get("first_seen", "")),
                "source": "OpenSanctions",
            }

            out_fh.write(json.dumps(record) + "\n")
            existing_names.add(name)
            inserted += 1

    print(f"Done. Inserted {inserted} new sanctions records.")
    return {"inserted": inserted, "status": "ok"}


if __name__ == "__main__":
    result = sync_sanctions()
    print(result)
