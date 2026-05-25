import uuid
import psycopg
import random
from datetime import datetime, timezone, timedelta

DATABASE_URL = "postgresql://sentinel:sentinel123@localhost:5434/sentineldb"

# Realistic employees
EMPLOYEES = [
    ("emp_001", "sarah.chen"),
    ("emp_002", "james.okonkwo"),
    ("emp_003", "priya.sharma"),
    ("emp_004", "tom.bradley"),
    ("emp_005", "elena.vasquez"),
    ("emp_006", "david.kim"),
    ("emp_007", "marcus.webb"),      # our fraudster
    ("emp_008", "lisa.hoffman"),
    ("emp_009", "raj.patel"),
    ("emp_010", "anna.kowalski"),
]

CHANNELS = ["general", "finance-ops", "engineering", "hr-announcements", "direct-cfo", "vendor-mgmt"]

# Normal chatter per channel
NORMAL_MESSAGES = {
    "general": [
        "Anyone up for lunch today?",
        "Don't forget the all-hands at 3pm",
        "Great job on the Q1 report everyone",
        "Office is closed Friday for the holiday",
        "New coffee machine is in the break room",
        "Happy birthday {name}!",
        "Team outing next Thursday, sign up in the sheet",
        "IT reminder: update your passwords this week",
    ],
    "finance-ops": [
        "Q2 budget review is scheduled for next Monday",
        "Reminder to submit expense reports by EOW",
        "Invoice batch processed, 47 vendors paid",
        "Audit prep docs are in the shared drive",
        "FX rates updated for this month",
        "AP reconciliation complete for March",
        "New vendor onboarding checklist posted",
        "Finance standup moved to 10am tomorrow",
    ],
    "engineering": [
        "Deployment to prod scheduled for tonight 11pm",
        "PR reviews needed on the auth module",
        "DB migration script ready for review",
        "Staging environment is back up",
        "New API docs published",
        "Sprint planning at 9am tomorrow",
        "Anyone else seeing latency issues on the dashboard?",
        "Bug bash Friday afternoon, all hands on deck",
    ],
    "hr-announcements": [
        "New benefits enrollment opens Monday",
        "Performance review season starts next month",
        "Reminder: mandatory compliance training due by end of month",
        "Welcome to the team, new joiners!",
        "Updated PTO policy posted on the intranet",
        "Mental health day reminder — take care of yourselves",
    ],
    "direct-cfo": [
        "Board deck ready for your review",
        "Investor call prep materials sent to your email",
        "Q3 projections look strong",
        "Sign-off needed on the capital allocation memo",
        "Treasury report attached",
    ],
    "vendor-mgmt": [
        "Vendor renewal due next quarter for 3 contracts",
        "New vendor submitted W-9, pending approval",
        "Reminder: all vendors need insurance certificates on file",
        "Vendor performance review scheduled for next week",
        "Contract template updated, use new version",
    ],
}

# Fraud-related messages from marcus.webb
FRAUD_MESSAGES = [
    ("finance-ops",  "Approved the Zenith transfer, keep it off the books",                   "2024-03-01 10:15:00"),
    ("finance-ops",  "Zenith invoice looks legit, just push it through",                       "2024-03-05 14:00:00"),
    ("direct-cfo",   "The Panama account is set up, Zenith will route through there",          "2024-03-12 09:20:00"),
    ("vendor-mgmt",  "Zenith LLC is a trusted partner, no need for the usual due diligence",   "2024-03-18 16:00:00"),
    ("finance-ops",  "Can someone delete the Zenith wire confirmation from the audit folder?", "2024-03-22 11:30:00"),
    ("direct-cfo",   "The Cayman account is cleaner, switching Zenith routing there",          "2024-04-02 08:45:00"),
    ("vendor-mgmt",  "Zenith contract is being backdated, ignore the date discrepancy",        "2024-04-09 13:15:00"),
    ("finance-ops",  "Last Zenith transfer done. $95k. Do not flag this one.",                 "2024-04-15 17:30:00"),
]

def random_timestamp(start: datetime, end: datetime) -> datetime:
    delta = end - start
    return start + timedelta(seconds=random.randint(0, int(delta.total_seconds())))

def seed_slack():
    print("Seeding synthetic Slack logs...")

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT message_id FROM slack_logs")
            existing = {r[0] for r in cur.fetchall()}

        batch = []
        inserted = 0
        start = datetime(2024, 1, 1, tzinfo=timezone.utc)
        end   = datetime(2024, 4, 30, tzinfo=timezone.utc)

        # Generate 2000 normal messages
        for _ in range(2000):
            channel = random.choice(CHANNELS)
            user_id, user_name = random.choice(EMPLOYEES)
            messages = NORMAL_MESSAGES.get(channel, NORMAL_MESSAGES["general"])
            message = random.choice(messages).replace("{name}", user_name.split(".")[0].title())
            ts = random_timestamp(start, end)
            mid = str(uuid.uuid4())

            if mid in existing:
                continue

            batch.append((mid, user_id, user_name, channel, message, ts))

        # Insert fraud messages (fixed IDs so re-runs skip them)
        for i, (channel, message, ts_str) in enumerate(FRAUD_MESSAGES):
            mid = f"SLACK-FRAUD-{i+1:03d}"
            if mid in existing:
                continue
            ts = datetime.fromisoformat(ts_str).replace(tzinfo=timezone.utc)
            batch.append((mid, "emp_007", "marcus.webb", channel, message, ts))

        # Batch insert
        BATCH_SIZE = 500
        for i in range(0, len(batch), BATCH_SIZE):
            chunk = batch[i:i+BATCH_SIZE]
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO slack_logs (message_id, user_id, user_name, channel, message, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (message_id) DO NOTHING
                    """,
                    chunk,
                )
            conn.commit()
            inserted += len(chunk)

    print(f"Done! Inserted {inserted} Slack messages (2000 normal + {len(FRAUD_MESSAGES)} fraud)")

if __name__ == "__main__":
    seed_slack()