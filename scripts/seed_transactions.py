import csv
import uuid
import psycopg
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import os
import random

DATABASE_URL = "postgresql://sentinel:sentinel123@localhost:5434/sentineldb"

BASE_TIME = datetime(2024, 1, 1, tzinfo=timezone.utc)
LOCATIONS = [
    "New York, US", "Panama City, PA", "London, UK", "Dubai, UAE",
    "Singapore, SG", "Cayman Islands", "Zurich, CH", "Hong Kong, HK",
]

def seed_transactions():
    csv_path = os.path.join(os.path.dirname(__file__), "../data/raw/transactions.csv")
    
    conn = psycopg.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    print("Connected to database...")
    
    inserted = 0
    skipped = 0
    limit = 10000
    
    with open(csv_path, newline='') as csvfile:
        reader = csv.DictReader(csvfile)
        
        for i, row in enumerate(reader):
            if i >= limit:
                break
            
            transaction_id = str(uuid.uuid4())
            sender = row['nameOrig']
            receiver = row['nameDest']
            amount = Decimal(row['amount'])
            timestamp = BASE_TIME + timedelta(hours=int(row['step']))
            location = random.choice(LOCATIONS)
            is_fraud = row['isFraud'] == '1'
            is_flagged = row.get('isFlaggedFraud', '0') == '1'
            risk_score = min(
                (60 if is_fraud else 0) +
                (20 if is_flagged else 0) +
                (10 if row['type'] in ('TRANSFER', 'CASH_OUT') else 0),
                100
            )
            flags = []
            if is_fraud:     flags.append('FRAUD')
            if is_flagged:   flags.append('FLAGGED')
            if row['type'] in ('TRANSFER', 'CASH_OUT'): flags.append(row['type'])

            cursor.execute("""
                INSERT INTO transactions 
                (transaction_id, sender, receiver, amount, timestamp, location, risk_score, flags)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (transaction_id, sender, receiver, amount, timestamp, location, risk_score, flags))
            
            inserted += 1
            
            if inserted % 1000 == 0:
                conn.commit()
                print(f"Inserted {inserted} rows...")
    
    conn.commit()

    # Plant Zenith LLC demo scenario
    print("Planting Zenith LLC demo data...")
    zenith_txns = [
        ("ZENITH-001", "emp_007", "Zenith LLC", Decimal("15000.00"),  datetime(2024, 3,  1, 10,  0, tzinfo=timezone.utc), "Panama City, PA", 85, ["FRAUD", "TRANSFER"]),
        ("ZENITH-002", "emp_007", "Zenith LLC", Decimal("32500.00"),  datetime(2024, 3,  5, 14, 30, tzinfo=timezone.utc), "Panama City, PA", 88, ["FRAUD", "TRANSFER"]),
        ("ZENITH-003", "emp_007", "Zenith LLC", Decimal("47800.00"),  datetime(2024, 3, 12,  9, 15, tzinfo=timezone.utc), "Cayman Islands",  90, ["FRAUD", "TRANSFER"]),
        ("ZENITH-004", "emp_007", "Zenith LLC", Decimal("23100.00"),  datetime(2024, 3, 18, 16, 45, tzinfo=timezone.utc), "Panama City, PA", 82, ["FRAUD", "TRANSFER"]),
        ("ZENITH-005", "emp_007", "Zenith LLC", Decimal("58900.00"),  datetime(2024, 3, 22, 11,  0, tzinfo=timezone.utc), "Panama City, PA", 92, ["FRAUD", "TRANSFER"]),
        ("ZENITH-006", "emp_007", "Zenith LLC", Decimal("71200.00"),  datetime(2024, 4,  2,  8, 30, tzinfo=timezone.utc), "Cayman Islands",  93, ["FRAUD", "TRANSFER"]),
        ("ZENITH-007", "emp_007", "Zenith LLC", Decimal("44600.00"),  datetime(2024, 4,  9, 13,  0, tzinfo=timezone.utc), "Panama City, PA", 87, ["FRAUD", "TRANSFER"]),
        ("ZENITH-008", "emp_007", "Zenith LLC", Decimal("95000.00"),  datetime(2024, 4, 15, 17, 20, tzinfo=timezone.utc), "Cayman Islands",  97, ["FRAUD", "TRANSFER", "HIGH_VALUE"]),
    ]
    for txn in zenith_txns:
        cursor.execute("""
            INSERT INTO transactions
            (transaction_id, sender, receiver, amount, timestamp, location, risk_score, flags)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (transaction_id) DO NOTHING
        """, txn)
    conn.commit()

    cursor.close()
    conn.close()
    
    print(f"Done! Inserted {inserted} rows + 8 Zenith demo rows")

if __name__ == "__main__":
    seed_transactions()