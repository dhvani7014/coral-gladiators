import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import psycopg2
import psycopg2.extras
import os

from dotenv import load_dotenv
load_dotenv()

from agents.planner import plan_investigation
from agents.sql_agent import execute_plan
from agents.graph_agent import populate_graph
from agents.fraud_agent import analyze_fraud
from agents.graph_intelligence_agent import run_graph_intelligence
from agents.report_agent import generate_report

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


def get_db():
    return psycopg2.connect(os.getenv("DATABASE_URL", "postgresql://sentinel:sentinel123@localhost:5433/sentineldb"))


def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ── routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/query")
def query(req: QueryRequest):
    import subprocess
    result = subprocess.run(
        ["coral", "sql", "--format", "json", req.sql],
        capture_output=True, text=True
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
        yield sse_event("agent_start", {
            "agent": "Planner",
            "message": "Querying data sources — building investigation plan..."
        })
        await asyncio.sleep(0)
        try:
            plan = await asyncio.to_thread(plan_investigation, req.request)
            target = plan["target"]
            yield sse_event("agent_done", {
                "agent": "Planner",
                "target": target,
                "query_count": len(plan.get("queries", [])),
                "summary": plan.get("summary", ""),
            })
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event("agent_error", {
                "agent": "Planner",
                "error": str(e),
                "message": "Investigation planning failed. Check Groq API key and connectivity."
            })
            yield sse_event("pipeline_done", {
                "error": "Pipeline aborted at Planner",
                "pipeline_errors": pipeline_errors
            })
            return

        # ── Stage 2: SQL ──────────────────────────────────────────────────────
        yield sse_event("agent_start", {
            "agent": "SQL",
            "message": "Querying Coral federated database — transactions, emails, slack, sanctions..."
        })
        await asyncio.sleep(0)
        try:
            sql_results = await asyncio.to_thread(execute_plan, plan)
            yield sse_event("agent_done", {
                "agent": "SQL",
                "total_rows": sql_results.get("total_rows", 0),
                "queries": [
                    {"name": q["name"], "count": q["count"], "success": q["success"]}
                    for q in sql_results.get("query_results", [])
                ],
            })
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event("agent_error", {
                "agent": "SQL",
                "error": str(e),
                "message": "SQL execution failed. Coral may be unavailable — check coral CLI."
            })
            # Non-fatal: continue with empty results

        # ── Stage 3: Graph ────────────────────────────────────────────────────
        yield sse_event("agent_start", {
            "agent": "Graph",
            "message": "Populating Neo4j knowledge graph — building entity relationships..."
        })
        await asyncio.sleep(0)
        try:
            graph_results = await asyncio.to_thread(populate_graph, sql_results)
            yield sse_event("agent_done", {
                "agent": "Graph",
                "nodes": graph_results.get("nodes", {}),
                "relationships": graph_results.get("relationships", {}),
            })
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event("agent_error", {
                "agent": "Graph",
                "error": str(e),
                "message": "Graph population failed. Check Neo4j is running on port 7687."
            })

        # ── Stage 4: Fraud ────────────────────────────────────────────────────
        yield sse_event("agent_start", {
            "agent": "Fraud",
            "message": "Running fraud scoring rules — cross-referencing sanctions list..."
        })
        await asyncio.sleep(0)
        try:
            fraud_assessment = await asyncio.to_thread(analyze_fraud, sql_results)
            assessment = fraud_assessment.get("assessment", {})
            yield sse_event("agent_done", {
                "agent": "Fraud",
                "rule_score": fraud_assessment.get("rule_score", 0),
                "llm_score": assessment.get("score", 0),
                "risk_level": assessment.get("risk_level", "UNKNOWN"),
                "rule_findings": fraud_assessment.get("rule_findings", []),
            })
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event("agent_error", {
                "agent": "Fraud",
                "error": str(e),
                "message": "Fraud analysis failed. Check Neo4j connectivity and Groq API."
            })

        # ── Stage 5: Graph Intelligence ───────────────────────────────────────
        yield sse_event("agent_start", {
            "agent": "GraphIntelligence",
            "message": "Expanding entity network — mapping co-senders and sanctioned neighbors..."
        })
        await asyncio.sleep(0)
        try:
            graph_intelligence = await asyncio.to_thread(run_graph_intelligence, target)
            yield sse_event("agent_done", {
                "agent": "GraphIntelligence",
                "findings": graph_intelligence.get("findings", []),
                "network_size": graph_intelligence.get("network_size", 0),
                "sanctioned_neighbors": graph_intelligence.get("sanctioned_neighbors", []),
            })
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event("agent_error", {
                "agent": "GraphIntelligence",
                "error": str(e),
                "message": "Network analysis failed. Graph may be empty — run Graph stage first."
            })

        # ── Stage 6: Report ───────────────────────────────────────────────────
        yield sse_event("agent_start", {
            "agent": "Report",
            "message": "Generating compliance report — synthesizing all evidence..."
        })
        await asyncio.sleep(0)
        try:
            report = await asyncio.to_thread(
                generate_report, target, sql_results, fraud_assessment, graph_intelligence
            )
            yield sse_event("agent_done", {
                "agent": "Report",
                "risk_score": report.get("risk_score", 0),
                "risk_level": report.get("risk_level", "UNKNOWN"),
                "recommended_action": report.get("recommended_action", ""),
                "executive_summary": report.get("executive_summary", ""),
            })
        except Exception as e:
            pipeline_errors.append(str(e))
            yield sse_event("agent_error", {
                "agent": "Report",
                "error": str(e),
                "message": "Report generation failed. Check Groq API key and rate limits."
            })

        # ── Pipeline complete ─────────────────────────────────────────────────
        yield sse_event("pipeline_done", {
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
        })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/evidence/{entity_name}")
def get_evidence_timeline(entity_name: str):
    """
    Returns a unified chronological timeline of all evidence involving entity_name.
    Merges transactions, emails, slack_logs, and sanctions — sorted by timestamp ASC.
    """
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    events = []

    # 1. Transactions
    try:
        cur.execute("""
            SELECT
                transaction_id AS id,
                sender,
                receiver,
                amount,
                timestamp,
                location,
                risk_score,
                flags
            FROM transactions
            WHERE sender ILIKE %s OR receiver ILIKE %s
            ORDER BY timestamp ASC
        """, (f"%{entity_name}%", f"%{entity_name}%"))
        for row in cur.fetchall():
            flags = row["flags"] or []
            if isinstance(flags, str):
                try:
                    flags = json.loads(flags)
                except Exception:
                    flags = [flags] if flags else []
            events.append({
                "type": "transaction",
                "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                "title": f"Transaction: {row['sender']} → {row['receiver']}",
                "summary": f"${float(row['amount'] or 0):,.2f} transferred from {row['sender']} to {row['receiver']} — risk score {row['risk_score']}",
                "detail": {
                    "id": row["id"],
                    "sender": row["sender"],
                    "receiver": row["receiver"],
                    "amount": float(row["amount"] or 0),
                    "location": row["location"],
                    "risk_score": int(row["risk_score"] or 0),
                    "flags": flags,
                }
            })
    except Exception as e:
        print(f"[evidence] transaction query error: {e}")

    # 2. Emails — filter to employee senders only (avoids cruise spam)
    try:
        cur.execute("""
            SELECT
                email_id AS id,
                sender,
                receiver,
                subject,
                body,
                timestamp,
                employee_id
            FROM emails
            WHERE (body ILIKE %s OR subject ILIKE %s)
              AND employee_id LIKE 'emp_%%'
            ORDER BY timestamp ASC
        """, (f"%{entity_name}%", f"%{entity_name}%"))
        for row in cur.fetchall():
            events.append({
                "type": "email",
                "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                "title": f"Email: {row['subject']}",
                "summary": f"From {row['sender']} to {row['receiver']}: {row['subject']}",
                "detail": {
                    "id": row["id"],
                    "sender": row["sender"],
                    "receiver": row["receiver"],
                    "subject": row["subject"],
                    "body": row["body"],
                    "employee_id": row["employee_id"],
                }
            })
    except Exception as e:
        print(f"[evidence] email query error: {e}")

    # 3. Slack messages — broaden to first word of entity name (matches Planner's _patch_plan logic)
    try:
        entity_first_word = entity_name.split()[0]
        cur.execute("""
            SELECT
                message_id AS id,
                user_id,
                user_name,
                channel,
                message,
                timestamp
            FROM slack_logs
            WHERE message ILIKE %s
            ORDER BY timestamp ASC
        """, (f"%{entity_first_word}%",))
        for row in cur.fetchall():
            preview = row["message"][:120] + ("..." if len(row["message"]) > 120 else "")
            events.append({
                "type": "slack",
                "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                "title": f"Slack #{row['channel']}",
                "summary": f"{row['user_name']}: {preview}",
                "detail": {
                    "id": row["id"],
                    "user_id": row["user_id"],
                    "user_name": row["user_name"],
                    "channel": row["channel"],
                    "message": row["message"],
                }
            })
    except Exception as e:
        print(f"[evidence] slack query error: {e}")

    # 4. Sanctions
    try:
        cur.execute("""
            SELECT
                id,
                entity_name,
                country,
                sanction_type,
                listed_date,
                source
            FROM sanctions
            WHERE entity_name ILIKE %s
            ORDER BY listed_date ASC
        """, (f"%{entity_name}%",))
        for row in cur.fetchall():
            events.append({
                "type": "sanction",
                "timestamp": row["listed_date"].isoformat() if row["listed_date"] else None,
                "title": f"Sanctions Hit: {row['entity_name']}",
                "summary": f"{row['entity_name']} listed on {row['source']} ({row['sanction_type']}) — {row['country']}",
                "detail": {
                    "id": row["id"],
                    "entity_name": row["entity_name"],
                    "country": row["country"],
                    "sanction_type": row["sanction_type"],
                    "listed_date": row["listed_date"].isoformat() if row["listed_date"] else None,
                    "source": row["source"],
                }
            })
    except Exception as e:
        print(f"[evidence] sanctions query error: {e}")

    cur.close()
    conn.close()

    # Sort all events chronologically — nulls go to end
    events.sort(key=lambda x: x["timestamp"] or "9999")

    return {
        "entity": entity_name,
        "total_events": len(events),
        "events": events,
    }


@app.get("/traces")
async def get_traces(limit: int = 50, offset: int = 0):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM coral_traces")
        total = cur.fetchone()[0]
        cur.execute("""
            SELECT id, query_text, sources_hit, execution_ms, cache_hit, timestamp
            FROM coral_traces
            ORDER BY timestamp DESC
            LIMIT %s OFFSET %s
        """, (limit, offset))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        traces = []
        for row in rows:
            trace_id, query_text, sources_hit, execution_ms, cache_hit, timestamp = row
            traces.append({
                "id": trace_id,
                "query_text": query_text,
                "sources_hit": sources_hit,
                "execution_ms": execution_ms,
                "cache_hit": cache_hit,
                "created_at": timestamp.isoformat() if timestamp else None,
            })
        return {"traces": traces, "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch traces: {str(e)}")


@app.delete("/traces")
async def clear_traces():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM coral_traces")
        conn.commit()
        deleted = cur.rowcount
        cur.close()
        conn.close()
        return {"deleted": deleted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/transactions/flagged")
def get_flagged_transactions():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT transaction_id, sender, receiver, amount, timestamp,
               location, risk_score, flags
        FROM transactions
        WHERE risk_score >= 40
        ORDER BY risk_score DESC, timestamp DESC
        LIMIT 50
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    transactions = []
    for row in rows:
        r = dict(row)
        flags = r.get("flags", [])
        if isinstance(flags, str):
            try:
                flags = json.loads(flags)
            except Exception:
                flags = [flags] if flags else []
        r["flags"]      = flags
        r["amount"]     = float(r["amount"] or 0)
        r["risk_score"] = int(r["risk_score"] or 0)
        r["timestamp"]  = str(r["timestamp"] or "")
        transactions.append(r)

    return {"transactions": transactions, "total": len(transactions)}


@app.get("/stats")
def get_stats():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Transaction stats
    cur.execute("""
        SELECT
            COUNT(*)                                                 AS total,
            COUNT(*) FILTER (WHERE risk_score >= 40)                AS flagged,
            COUNT(*) FILTER (WHERE risk_score >= 70)                AS critical,
            COUNT(*) FILTER (WHERE risk_score >= 40
                               AND risk_score < 70)                 AS high,
            COALESCE(SUM(amount) FILTER (WHERE risk_score >= 40), 0) AS total_exposure
        FROM transactions
    """)
    tx = dict(cur.fetchone())

    # Top vendors by risk
    cur.execute("""
        SELECT
            receiver            AS name,
            COUNT(*)            AS tx_count,
            MAX(risk_score)     AS max_risk,
            SUM(amount)         AS total_amount
        FROM transactions
        WHERE risk_score >= 40
        GROUP BY receiver
        ORDER BY max_risk DESC, tx_count DESC
        LIMIT 5
    """)
    top_vendors = [dict(r) for r in cur.fetchall()]

    # Recent flagged transactions
    cur.execute("""
        SELECT transaction_id, sender, receiver, amount, risk_score, flags, timestamp
        FROM transactions
        WHERE risk_score >= 40
        ORDER BY timestamp DESC
        LIMIT 6
    """)
    recent = []
    for row in cur.fetchall():
        r = dict(row)
        flags = r.get("flags", [])
        if isinstance(flags, str):
            try:
                flags = json.loads(flags)
            except Exception:
                flags = [flags] if flags else []
        r["flags"]      = flags
        r["amount"]     = float(r["amount"] or 0)
        r["risk_score"] = int(r["risk_score"] or 0)
        r["timestamp"]  = str(r["timestamp"] or "")
        recent.append(r)

    # Trace stats
    cur.execute("""
        SELECT
            COUNT(*)                                          AS total_queries,
            COALESCE(AVG(execution_ms), 0)                   AS avg_latency_ms,
            COUNT(*) FILTER (WHERE cache_hit = true)         AS cache_hits
        FROM coral_traces
    """)
    traces = dict(cur.fetchone())

    cur.close()
    conn.close()

    return {
        "transactions": {
            "total":          int(tx["total"]),
            "flagged":        int(tx["flagged"]),
            "critical":       int(tx["critical"]),
            "high":           int(tx["high"]),
            "total_exposure": float(tx["total_exposure"]),
        },
        "traces": {
            "total_queries":  int(traces["total_queries"]),
            "avg_latency_ms": round(float(traces["avg_latency_ms"]), 1),
            "cache_hits":     int(traces["cache_hits"]),
        },
        "top_vendors": [
            {
                "name":         r["name"],
                "tx_count":     int(r["tx_count"]),
                "max_risk":     int(r["max_risk"]),
                "total_amount": float(r["total_amount"]),
            }
            for r in top_vendors
        ],
        "recent_flagged": recent,
    }