import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import psycopg2
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


# ── helpers ──────────────────────────────────────────────────────────────────

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

        # ── 1. Planner ────────────────────────────────────────────────────
        yield sse_event("agent_start", {"agent": "Planner", "message": "Generating investigation plan..."})
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
            yield sse_event("agent_error", {"agent": "Planner", "error": str(e)})
            yield sse_event("pipeline_done", {"error": "Pipeline aborted at Planner", "pipeline_errors": pipeline_errors})
            return

        # ── 2. SQL Agent ──────────────────────────────────────────────────
        yield sse_event("agent_start", {"agent": "SQL", "message": "Querying Coral federated database..."})
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
            yield sse_event("agent_error", {"agent": "SQL", "error": str(e)})
            sql_results = {"query_results": [], "total_rows": 0}

        # ── 3. Graph Population Agent ─────────────────────────────────────
        yield sse_event("agent_start", {"agent": "Graph", "message": "Populating Neo4j knowledge graph..."})
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
            yield sse_event("agent_error", {"agent": "Graph", "error": str(e)})
            graph_results = {}

        # ── 4. Fraud Agent ────────────────────────────────────────────────
        yield sse_event("agent_start", {"agent": "Fraud", "message": "Running fraud scoring rules..."})
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
            yield sse_event("agent_error", {"agent": "Fraud", "error": str(e)})
            fraud_assessment = {}

        # ── 5. Graph Intelligence Agent ───────────────────────────────────
        yield sse_event("agent_start", {"agent": "GraphIntelligence", "message": "Mapping network relationships..."})
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
            yield sse_event("agent_error", {"agent": "GraphIntelligence", "error": str(e)})
            graph_intelligence = {}

        # ── 6. Report Agent ───────────────────────────────────────────────
        yield sse_event("agent_start", {"agent": "Report", "message": "Generating investigation report..."})
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
            yield sse_event("agent_error", {"agent": "Report", "error": str(e)})
            report = {}

        # ── Final event ───────────────────────────────────────────────────
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


@app.get("/traces")
async def get_traces(limit: int = 50, offset: int = 0):
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgresql://sentinel:sentinel123@localhost:5434/sentineldb"))
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM coral_traces")
        total = cur.fetchone()[0]

        cur.execute("""
            SELECT
                id,
                query_text,
                sources_hit,
                execution_ms,
                cache_hit,
                timestamp
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
        conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgresql://sentinel:sentinel123@localhost:5434/sentineldb"))
        cur = conn.cursor()
        cur.execute("DELETE FROM coral_traces")
        conn.commit()
        deleted = cur.rowcount
        cur.close()
        conn.close()
        return {"deleted": deleted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))