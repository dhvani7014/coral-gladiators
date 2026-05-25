import csv
import os
import psycopg
import json
from datetime import datetime

DATABASE_URL = "postgresql://sentinel:sentinel123@localhost:5434/sentineldb"
CSV_PATH = os.path.join(os.path.dirname(__file__), "../data/raw/sanctions.csv")

def parse_date(val: str):
    """Extract first date from a field like '1970-01-01;1971-05-02'"""
    if not val:
        return None
    first = val.split(";")[0].strip()
    for fmt in ("%Y-%m-%d", "%Y"):
        try:
            return datetime.strptime(first, fmt).date()
        except ValueError:
            continue
    return None

def parse_sanction_type(sanctions_field: str) -> str:
    """Pull the first sanction program name as the type"""
    if not sanctions_field:
        return "Unknown"
    return sanctions_field.split(";")[0].strip()[:200]

def parse_country(countries_field: str) -> str:
    if not countries_field:
        return None
    return countries_field.split(";")[0].strip().upper()

def seed_sanctions():
    print("Seeding sanctions from OpenSanctions CSV...")

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            # Keep existing demo rows (Zenith LLC etc)
            cur.execute("SELECT entity_name FROM sanctions")
            existing = {r[0] for r in cur.fetchall()}

        inserted = 0
        skipped = 0
        batch = []
        BATCH_SIZE = 500

        with open(CSV_PATH, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("name", "").strip()
                if not name or name in existing:
                    skipped += 1
                    continue

                country = parse_country(row.get("countries", ""))
                sanction_type = parse_sanction_type(row.get("sanctions", ""))
                listed_date = parse_date(row.get("first_seen", ""))
                source = "OpenSanctions"

                batch.append((name, country, sanction_type, listed_date, source))
                existing.add(name)

                if len(batch) >= BATCH_SIZE:
                    _insert_batch(conn, batch)
                    inserted += len(batch)
                    batch = []
                    print(f"  Inserted {inserted} rows...", end="\r")

        if batch:
            _insert_batch(conn, batch)
            inserted += len(batch)

    print(f"\nDone! Inserted {inserted} sanctions, skipped {skipped}")

def _insert_batch(conn, batch):
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO sanctions (entity_name, country, sanction_type, listed_date, source)
            VALUES (%s, %s, %s, %s, %s)
            """,
            batch,
        )
    conn.commit()

if __name__ == "__main__":
    seed_sanctions()