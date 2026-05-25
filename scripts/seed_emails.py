import csv
import os
import uuid
import psycopg
from email import message_from_string
from datetime import datetime, timezone
import re
import sys

csv.field_size_limit(sys.maxsize)

DATABASE_URL = "postgresql://sentinel:sentinel123@localhost:5434/sentineldb"
CSV_PATH = os.path.join(os.path.dirname(__file__), "../data/raw/emails.csv")
LIMIT = 50000  # 500k rows is too large, 50k is plenty

def parse_date(date_str: str):
    if not date_str:
        return datetime.now(timezone.utc)
    # Enron dates look like: "Mon, 14 May 2001 16:39:00 -0700 (PDT)"
    # Strip the timezone name in parens which Python can't parse
    clean = re.sub(r'\s*\([^)]*\)\s*$', '', date_str.strip())
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %z",
        "%d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S",
    ):
        try:
            dt = datetime.strptime(clean, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return datetime.now(timezone.utc)

def extract_employee_id(filepath: str) -> str:
    """Derive employee ID from file path like 'allen-p/_sent_mail/1.'"""
    parts = filepath.split("/")
    if parts:
        return parts[0][:50]
    return "unknown"

def seed_emails():
    print("Seeding Enron emails...")

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT email_id FROM emails")
            existing = {r[0] for r in cur.fetchall()}

        inserted = 0
        skipped = 0
        batch = []
        BATCH_SIZE = 500

        with open(CSV_PATH, newline="", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                if inserted >= LIMIT:
                    break

                raw_message = row.get("message", "")
                filepath = row.get("file", "")

                try:
                    msg = message_from_string(raw_message)
                except Exception:
                    skipped += 1
                    continue

                email_id = str(uuid.uuid4())
                sender = (msg.get("From") or "").strip()[:200]
                receiver = (msg.get("To") or "").strip()[:500]
                subject = (msg.get("Subject") or "").strip()[:500]
                timestamp = parse_date(msg.get("Date") or "")
                employee_id = extract_employee_id(filepath)

                # Get plain text body
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_type() == "text/plain":
                            body = part.get_payload(decode=True) or ""
                            if isinstance(body, bytes):
                                body = body.decode("utf-8", errors="replace")
                            break
                else:
                    body = msg.get_payload(decode=True) or ""
                    if isinstance(body, bytes):
                        body = body.decode("utf-8", errors="replace")
                    elif isinstance(body, str):
                        pass
                    else:
                        body = str(body)

                body = body.strip()[:5000]  # cap at 5000 chars

                if not sender:
                    skipped += 1
                    continue

                batch.append((email_id, sender, receiver, subject, body, timestamp, employee_id))

                if len(batch) >= BATCH_SIZE:
                    _insert_batch(conn, batch)
                    inserted += len(batch)
                    batch = []
                    print(f"  Inserted {inserted} rows...", end="\r")

        if batch:
            _insert_batch(conn, batch)
            inserted += len(batch)

    print(f"\nDone! Inserted {inserted} emails, skipped {skipped}")

def _insert_batch(conn, batch):
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO emails
                (email_id, sender, receiver, subject, body, timestamp, employee_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            batch,
        )
    conn.commit()

if __name__ == "__main__":
    seed_emails()