import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class SlackEventInner(BaseModel):
    user: Optional[str] = None
    text: Optional[str] = None
    channel: Optional[str] = None
    ts: Optional[str] = None
    type: Optional[str] = None


class SlackWebhookPayload(BaseModel):
    token: Optional[str] = None
    type: str
    challenge: Optional[str] = None
    event: Optional[SlackEventInner] = None


class EmailWebhookPayload(BaseModel):
    # SendGrid Inbound Parse field names
    from_field: str = Field(alias="from")  # "from" is reserved in Python
    to: Optional[str] = None
    subject: Optional[str] = None
    text: Optional[str] = None
    html: Optional[str] = None
    date: Optional[str] = None

    model_config = {"populate_by_name": True}


class TransactionWebhookPayload(BaseModel):
    sender: str
    receiver: str
    amount: float
    location: Optional[str] = "Unknown"
    timestamp: Optional[str] = None


# ---------------------------------------------------------------------------
# Parser functions
# ---------------------------------------------------------------------------


def _slack_ts_to_iso(ts: Optional[str]) -> str:
    """Convert Slack's Unix epoch float string (e.g. '1780175544.573549') to ISO 8601."""
    if not ts:
        return datetime.now(timezone.utc).isoformat()
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except (ValueError, OSError):
        return datetime.now(timezone.utc).isoformat()


def parse_slack_to_row(payload: SlackWebhookPayload) -> dict:
    """Convert a Slack webhook event into a slack_logs .jsonl row."""
    event = payload.event or SlackEventInner()
    user_id = event.user or "unknown"
    # user_name will be resolved to a real name later if Slack user.profile is available;
    # for now store the user_id — it's more useful than a raw ID in the name field
    display_name = (
        getattr(event, "username", None)
        or getattr(event, "display_name", None)
        or user_id
    )
    return {
        "message_id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_name": display_name,
        "channel": event.channel or "unknown",
        "message": event.text or "",
        "timestamp": _slack_ts_to_iso(event.ts),
    }


def parse_email_to_row(payload: EmailWebhookPayload) -> dict:
    """Convert an inbound email webhook payload into an emails .jsonl row."""
    now = datetime.now(timezone.utc).isoformat()
    body = payload.text or payload.html or ""
    return {
        "email_id": str(uuid.uuid4()),
        "sender": payload.from_field,
        "receiver": payload.to or "",
        "subject": payload.subject or "",
        "body": body[:5000],
        "timestamp": payload.date or now,
        "employee_id": "",
    }


def calculate_risk_score(
    sender: str, receiver: str, amount: float, location: str
) -> tuple[int, list[str]]:
    """Rule-based risk scoring for incoming transactions."""
    score = 0
    flags = []

    HIGH_RISK_LOCATIONS = {"panama", "cayman", "dubai", "offshore"}
    if any(loc in location.lower() for loc in HIGH_RISK_LOCATIONS):
        score += 30
        flags.append("HIGH_RISK_LOCATION")

    if amount > 50000:
        score += 40
        flags.append("HIGH_VALUE")
    elif amount > 10000:
        score += 15
        flags.append("ELEVATED_VALUE")

    if amount > 90000:
        score += 20
        flags.append("NEAR_REPORTING_THRESHOLD")

    return min(score, 100), flags


def parse_transaction_to_row(payload: TransactionWebhookPayload) -> dict:
    """Convert a transaction webhook payload into a transactions .jsonl row."""
    import json as _json

    now = datetime.now(timezone.utc).isoformat()
    ts = payload.timestamp or now
    risk_score, flags = calculate_risk_score(
        payload.sender, payload.receiver, payload.amount, payload.location or ""
    )
    return {
        "transaction_id": str(uuid.uuid4()),
        "sender": payload.sender,
        "receiver": payload.receiver,
        "amount": payload.amount,
        "timestamp": ts,
        "location": payload.location or "Unknown",
        "risk_score": risk_score,
        "flags": _json.dumps(flags),
    }
