import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

from agents.fraud_agent import analyze_fraud
from agents.graph_agent import populate_graph
from agents.graph_intelligence_agent import run_graph_intelligence
from agents.planner import plan_investigation
from agents.report_agent import generate_report
from agents.sql_agent import execute_plan
from utils.sync_sanctions import sync_sanctions
from utils.webhook_parsers import (
    EmailWebhookPayload,
    SlackWebhookPayload,
    parse_email_to_row,
    parse_slack_to_row,
)

app = FastAPI(title="SentinelAI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InvestigateRequest(BaseModel):
    request: str


class QueryRequest(BaseModel):
    sql: str


def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


CORAL_DATA_DIR = Path(__file__).parent.parent / "coral" / "data"


def append_jsonl(filename: str, row: dict):
    """Append a single JSON row to a .jsonl file in coral/data/."""
    path = CORAL_DATA_DIR / filename
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")


# ── routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok"}


# In-process cache: Slack user_id -> display_name (avoids re-fetching on every message)
_slack_user_cache: dict[str, str] = {}


async def _resolve_slack_username(user_id: str) -> str:
    """Look up a Slack user's display name via the Web API using SLACK_BOT_TOKEN."""
    if not user_id or user_id == "unknown":
        return user_id
    if user_id in _slack_user_cache:
        return _slack_user_cache[user_id]
    token = os.getenv("SLACK_BOT_TOKEN")
    if not token:
        return user_id  # no token configured, fall back to ID
    try:
        import httpx

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://slack.com/api/users.info",
                params={"user": user_id},
                headers={"Authorization": f"Bearer {token}"},
                timeout=5,
            )
            data = resp.json()
            if data.get("ok"):
                profile = data["user"]["profile"]
                name = (
                    profile.get("display_name") or profile.get("real_name") or user_id
                )
                _slack_user_cache[user_id] = name
                return name
    except Exception:
        pass
    return user_id


@app.post("/webhooks/slack")
async def webhook_slack(payload: SlackWebhookPayload):
    # Slack URL verification handshake
    if payload.type == "url_verification":
        return {"challenge": payload.challenge}
    # Only process message events
    if (
        payload.type == "event_callback"
        and payload.event
        and payload.event.type == "message"
    ):
        row = parse_slack_to_row(payload)
        # Resolve real display name from Slack API
        row["user_name"] = await _resolve_slack_username(row["user_id"])
        append_jsonl("slack_logs.jsonl", row)
        return {"status": "ok", "message_id": row["message_id"]}
    return {"status": "ignored", "type": payload.type}


@app.post("/webhooks/email")
async def webhook_email(payload: EmailWebhookPayload):
    row = parse_email_to_row(payload)
    append_jsonl("emails.jsonl", row)
    return {"status": "ok", "email_id": row["email_id"]}


@app.post("/admin/sync-sanctions")
async def admin_sync_sanctions(x_admin_key: str = Header(None)):
    ADMIN_KEY = os.getenv("ADMIN_KEY", "sentinel-admin")
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")
    result = await asyncio.to_thread(sync_sanctions)
    return result


@app.post("/query")
def query(req: QueryRequest):
    import subprocess

    result = subprocess.run(
        ["coral", "sql", "--format", "json", req.sql], capture_output=True, text=True
    )
    try:
        return json.loads(result.stdout)
    except Exception:
        return {"error": result.stderr}


@app.post("/investigate")
def investigate_sync(req: InvestigateRequest):
    plan = plan_investigation(req.request)
    sql_results = execute_plan(plan)
    graph_results = populate_graph(sql_results)
    fraud_assessment = analyze_fraud(sql_results)
    graph_intelligence = run_graph_intelligence(plan["target"])
    report = generate_report(
        plan["target"], sql_results, fraud_assessment, graph_intelligence
    )
    return {
        "request": req.request,
        "target": plan["target"],
        "plan": plan,
        "sql_results": sql_results,
        "graph_results": graph_results,
        "fraud_assessment": fraud_assessment,
        "graph_intelligence": graph_intelligence,
        "report": report,
        "risk_score": report["risk_score"],
        "risk_level": report["risk_level"],
        "recommendation": report["recommended_action"],
        "summary": report["executive_summary"],
    }


@app.post("/investigate/stream")
async def investigate_stream(req: InvestigateRequest):
    async def event_generator():
        pipeline_errors = []
        target = req.request
        plan = {}
        sql_results = {"query_results": [], "total_rows": 0}
        graph_results = {}
        fraud_assessment = {}
        graph_intelligence = {}
        report = {}

        # ── Stage 1: Planner ─────────────────────────────────────────────────
        yield sse_event(
            "agent_start",
            {
                "agent": "Planner",
                "message": "Querying data sources — building investigation plan...",
            },
        )
        await asyncio.sleep(0)
        try:
            plan = await asyncio.to_thread(plan_investigation, req.request)
            target = plan["target"]
            yield sse_event(
                "agent_done",
                {
                    "agent": "Planner",
                    "target": target,
                    "query_count": len(plan.get("queries", [])),
                    "summary": plan.get("summary", ""),
                },
            )
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event(
                "agent_error",
                {
                    "agent": "Planner",
                    "error": str(e),
                    "message": "Investigation planning failed. Check Groq API key and connectivity.",
                },
            )
            yield sse_event(
                "pipeline_done",
                {
                    "error": "Pipeline aborted at Planner",
                    "pipeline_errors": pipeline_errors,
                },
            )
            return

        # ── Stage 2: SQL ──────────────────────────────────────────────────────
        yield sse_event(
            "agent_start",
            {
                "agent": "SQL",
                "message": "Querying Coral — sanctions watchlist, emails, Slack intelligence...",
            },
        )
        await asyncio.sleep(0)
        try:
            sql_results = await asyncio.to_thread(execute_plan, plan)
            yield sse_event(
                "agent_done",
                {
                    "agent": "SQL",
                    "total_rows": sql_results.get("total_rows", 0),
                    "queries": [
                        {
                            "name": q["name"],
                            "count": q["count"],
                            "success": q["success"],
                        }
                        for q in sql_results.get("query_results", [])
                    ],
                },
            )
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event(
                "agent_error",
                {
                    "agent": "SQL",
                    "error": str(e),
                    "message": "SQL execution failed. Coral may be unavailable — check coral CLI.",
                },
            )
            # Non-fatal: continue with empty results

        # ── Stage 3: Graph ────────────────────────────────────────────────────
        yield sse_event(
            "agent_start",
            {
                "agent": "Graph",
                "message": "Populating Neo4j knowledge graph — building entity relationships...",
            },
        )
        await asyncio.sleep(0)
        try:
            graph_results = await asyncio.to_thread(populate_graph, sql_results)
            yield sse_event(
                "agent_done",
                {
                    "agent": "Graph",
                    "nodes": graph_results.get("nodes", {}),
                    "relationships": graph_results.get("relationships", {}),
                },
            )
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event(
                "agent_error",
                {
                    "agent": "Graph",
                    "error": str(e),
                    "message": "Graph population failed. Check Neo4j is running on port 7687.",
                },
            )

        # ── Stage 4: Fraud ────────────────────────────────────────────────────
        yield sse_event(
            "agent_start",
            {
                "agent": "Fraud",
                "message": "Running fraud scoring rules — cross-referencing sanctions list...",
            },
        )
        await asyncio.sleep(0)
        try:
            fraud_assessment = await asyncio.to_thread(analyze_fraud, sql_results)
            assessment = fraud_assessment.get("assessment", {})
            yield sse_event(
                "agent_done",
                {
                    "agent": "Fraud",
                    "rule_score": fraud_assessment.get("rule_score", 0),
                    "llm_score": assessment.get("score", 0),
                    "risk_level": assessment.get("risk_level", "UNKNOWN"),
                    "rule_findings": fraud_assessment.get("rule_findings", []),
                },
            )
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event(
                "agent_error",
                {
                    "agent": "Fraud",
                    "error": str(e),
                    "message": "Fraud analysis failed. Check Neo4j connectivity and Groq API.",
                },
            )

        # ── Stage 5: Graph Intelligence ───────────────────────────────────────
        yield sse_event(
            "agent_start",
            {
                "agent": "GraphIntelligence",
                "message": "Expanding entity network — mapping co-senders and sanctioned neighbors...",
            },
        )
        await asyncio.sleep(0)
        try:
            graph_intelligence = await asyncio.to_thread(run_graph_intelligence, target)
            yield sse_event(
                "agent_done",
                {
                    "agent": "GraphIntelligence",
                    "findings": graph_intelligence.get("findings", []),
                    "network_size": graph_intelligence.get("network_size", 0),
                    "sanctioned_neighbors": graph_intelligence.get(
                        "sanctioned_neighbors", []
                    ),
                },
            )
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event(
                "agent_error",
                {
                    "agent": "GraphIntelligence",
                    "error": str(e),
                    "message": "Network analysis failed. Graph may be empty — run Graph stage first.",
                },
            )

        # ── Stage 6: Report ───────────────────────────────────────────────────
        yield sse_event(
            "agent_start",
            {
                "agent": "Report",
                "message": "Generating compliance report — synthesizing all evidence...",
            },
        )
        await asyncio.sleep(0)
        try:
            report = await asyncio.to_thread(
                generate_report,
                target,
                sql_results,
                fraud_assessment,
                graph_intelligence,
            )
            yield sse_event(
                "agent_done",
                {
                    "agent": "Report",
                    "risk_score": report.get("risk_score", 0),
                    "risk_level": report.get("risk_level", "UNKNOWN"),
                    "recommended_action": report.get("recommended_action", ""),
                    "executive_summary": report.get("executive_summary", ""),
                },
            )
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event(
                "agent_error",
                {
                    "agent": "Report",
                    "error": str(e),
                    "message": "Report generation failed. Check Groq API key and rate limits.",
                },
            )

        # ── Pipeline complete ─────────────────────────────────────────────────
        yield sse_event(
            "pipeline_done",
            {
                "request": req.request,
                "target": target,
                "pipeline_errors": pipeline_errors,
                "plan": plan,
                "sql_results": sql_results,
                "graph_results": graph_results,
                "fraud_assessment": fraud_assessment,
                "graph_intelligence": graph_intelligence,
                "report": report,
                "risk_score": report.get("risk_score", 0),
                "risk_level": report.get("risk_level", "UNKNOWN"),
                "recommendation": report.get("recommended_action", ""),
                "summary": report.get("executive_summary", ""),
            },
        )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Coral-backed read routes ──────────────────────────────────────────────────


@app.get("/stats")
def get_stats():
    """Dashboard stats from all 3 live Coral sources."""
    # Sanctions counts
    sanction_rows = _coral_query("SELECT COUNT(*) as total FROM sanctions.sanctions")
    total_sanctions = int((sanction_rows[0].get("total") or 0) if sanction_rows else 0)

    # Sanctions by country top 5
    top_countries = _coral_query("""
        SELECT country, COUNT(*) as count
        FROM sanctions.sanctions
        WHERE country IS NOT NULL
        GROUP BY country
        ORDER BY count DESC
        LIMIT 5
    """)

    # Slack counts
    slack_rows = _coral_query("SELECT COUNT(*) as total FROM slack.slack_logs")
    total_slack = int((slack_rows[0].get("total") or 0) if slack_rows else 0)

    # Recent slack messages
    recent_slack = _coral_query("""
        SELECT user_name, channel, message, timestamp
        FROM slack.slack_logs
        ORDER BY timestamp DESC
        LIMIT 6
    """)

    # Email counts
    email_rows = _coral_query("SELECT COUNT(*) as total FROM emails.emails")
    total_emails = int((email_rows[0].get("total") or 0) if email_rows else 0)

    return {
        "sanctions": {
            "total": total_sanctions,
            "top_countries": [
                {"name": r.get("country", ""), "count": int(r.get("count") or 0)}
                for r in top_countries
            ],
        },
        "slack": {
            "total": total_slack,
            "recent": [
                {
                    "user_name": r.get("user_name", ""),
                    "channel": r.get("channel", ""),
                    "message": r.get("message", ""),
                    "timestamp": str(r.get("timestamp") or ""),
                }
                for r in recent_slack
            ],
        },
        "emails": {
            "total": total_emails,
        },
        "sources": 3,
    }


def _coral_query(sql: str) -> list[dict]:
    """Run a Coral SQL query and return rows as a list of dicts."""
    import subprocess

    result = subprocess.run(
        ["coral", "sql", "--format", "json", sql],
        capture_output=True,
        text=True,
        timeout=30,
    )
    rows = []
    for line in result.stdout.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
            if isinstance(parsed, list):
                rows.extend(parsed)
            else:
                rows.append(parsed)
        except json.JSONDecodeError:
            continue
    return rows


@app.get("/evidence/{entity_name}")
def get_evidence_timeline(entity_name: str):
    """Build a cross-source evidence timeline for an entity using Coral federated queries."""
    events = []

    # Sanctions check
    sanction_rows = _coral_query(f"""
        SELECT entity_name, country, sanction_type, listed_date, source
        FROM sanctions.sanctions
        WHERE entity_name = '{entity_name}'
        LIMIT 10
    """)
    for r in sanction_rows:
        events.append(
            {
                "type": "sanction",
                "timestamp": str(r.get("listed_date") or ""),
                "title": f"Sanctions hit: {r.get('sanction_type', '')}",
                "detail": f"Source: {r.get('source', '')}  Country: {r.get('country', '')}",
                "risk_score": 100,
                "flags": ["SANCTIONED"],
                "raw": r,
            }
        )

    # Emails mentioning entity
    safe = entity_name.replace("'", "''")
    email_rows = _coral_query(f"""
        SELECT email_id, sender, receiver, subject, timestamp
        FROM emails.emails
        WHERE sender LIKE '%{safe}%' OR receiver LIKE '%{safe}%' OR subject LIKE '%{safe}%'
        ORDER BY timestamp ASC
        LIMIT 50
    """)
    for r in email_rows:
        events.append(
            {
                "type": "email",
                "timestamp": str(r.get("timestamp") or ""),
                "title": r.get("subject") or "(no subject)",
                "detail": f"{r.get('sender', '')} → {r.get('receiver', '')}",
                "risk_score": 0,
                "flags": [],
                "raw": r,
            }
        )

    # Slack messages mentioning entity
    keyword = entity_name.split()[0].replace("'", "''")
    slack_rows = _coral_query(f"""
        SELECT message_id, user_name, channel, message, timestamp
        FROM slack.slack_logs
        WHERE message LIKE '%{keyword}%' OR user_name LIKE '%{safe}%'
        ORDER BY timestamp ASC
        LIMIT 50
    """)
    for r in slack_rows:
        events.append(
            {
                "type": "slack",
                "timestamp": str(r.get("timestamp") or ""),
                "title": f"#{r.get('channel', '')} — {r.get('user_name', '')}",
                "detail": r.get("message", ""),
                "risk_score": 0,
                "flags": [],
                "raw": r,
            }
        )

    events.sort(key=lambda e: e["timestamp"])
    return {"entity": entity_name, "events": events, "total": len(events)}


@app.get("/traces")
def get_traces(limit: int = 20, offset: int = 0):
    """Audit trace log — no persistent store in current architecture."""
    return {"traces": [], "total": 0}


@app.get("/feed/sanctions")
def feed_sanctions(limit: int = 50):
    """Return recently added sanctioned entities for the live feed."""
    rows = _coral_query(f"""
        SELECT entity_name, country, sanction_type, listed_date, source
        FROM sanctions.sanctions
        WHERE entity_name IS NOT NULL
        ORDER BY listed_date DESC
        LIMIT {limit}
    """)
    items = []
    for r in rows:
        items.append(
            {
                "entity_name": r.get("entity_name", ""),
                "country": r.get("country", "") or "Unknown",
                "sanction_type": r.get("sanction_type", "") or "Unknown",
                "listed_date": str(r.get("listed_date") or ""),
                "source": r.get("source", "") or "OpenSanctions",
            }
        )
    return {"items": items, "total": len(items)}


@app.get("/feed/slack")
def feed_slack(limit: int = 50):
    """Return recent Slack messages for the live intelligence feed."""
    rows = _coral_query(f"""
        SELECT message_id, user_name, channel, message, timestamp
        FROM slack.slack_logs
        ORDER BY timestamp DESC
        LIMIT {limit}
    """)
    items = []
    for r in rows:
        items.append(
            {
                "message_id": r.get("message_id", ""),
                "user_name": r.get("user_name", "unknown"),
                "channel": r.get("channel", ""),
                "message": r.get("message", ""),
                "timestamp": str(r.get("timestamp") or ""),
            }
        )
    return {"items": items, "total": len(items)}


@app.delete("/traces")
def clear_traces():
    """No-op: traces are not persisted in the new architecture."""
    return {"status": "ok", "deleted": 0}
