import psycopg
import json
import os
from datetime import datetime, date
from decimal import Decimal

DATABASE_URL = "postgresql://sentinel:sentinel123@localhost:5434/sentineldb"

EXPORT_DIR = os.path.join(os.path.dirname(__file__), "../coral/data")

def serialize(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, list):
        return obj
    return str(obj)

def export_table(cursor, table: str, filename: str):
    cursor.execute(f"SELECT * FROM {table}")
    cols = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    path = os.path.join(EXPORT_DIR, filename)
    with open(path, "w") as f:
        for row in rows:
            record = {cols[i]: serialize(row[i]) for i in range(len(cols))}
            f.write(json.dumps(record) + "\n")
    print(f"Exported {len(rows)} rows → {filename}")

os.makedirs(EXPORT_DIR, exist_ok=True)

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        export_table(cur, "transactions", "transactions.jsonl")
        export_table(cur, "sanctions", "sanctions.jsonl")
        export_table(cur, "emails", "emails.jsonl")
        export_table(cur, "slack_logs", "slack_logs.jsonl")

print("Done. Run: coral source add --file coral/sources/sentineldb.yaml")