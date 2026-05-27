import subprocess
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents.planner     import plan_investigation
from agents.sql_agent   import execute_plan
from agents.graph_agent import populate_graph
from agents.fraud_agent import analyze_fraud

app = FastAPI(title="SentinelAI", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    sql: str

class InvestigateRequest(BaseModel):
    request: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "SentinelAI Backend", "version": "2.0.0"}

@app.post("/query")
def run_query(request: QueryRequest):
    try:
        result = subprocess.run(
            ["coral", "sql", "--format", "json", request.sql],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=f"Coral query failed: {result.stderr.strip()}")

        rows = []
        for line in result.stdout.strip().splitlines():
            line = line.strip()
            if line:
                try:
                    parsed = json.loads(line)
                    if isinstance(parsed, list):
                        rows.extend(parsed)
                    else:
                        rows.append(parsed)
                except json.JSONDecodeError:
                    continue

        return {"success": True, "rows": rows, "count": len(rows), "sql": request.sql}

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Query timed out after 30 seconds")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/investigate")
def investigate(request: InvestigateRequest):
    pipeline_errors = []

    try:
        plan = plan_investigation(request.request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Planner agent failed: {exc}")

    try:
        sql_results = execute_plan(plan)
    except Exception as exc:
        pipeline_errors.append(f"SQL agent error: {exc}")
        sql_results = {
            "target":        plan.get("target", "Unknown"),
            "summary":       plan.get("summary", ""),
            "query_results": [],
            "total_rows":    0,
            "errors":        [str(exc)],
        }

    try:
        graph_results = populate_graph(sql_results)
    except Exception as exc:
        pipeline_errors.append(f"Graph agent error: {exc}")
        graph_results = {"target": sql_results.get("target", "Unknown"), "success": False, "error": str(exc)}

    try:
        fraud_result = analyze_fraud(sql_results)
    except Exception as exc:
        pipeline_errors.append(f"Fraud agent error: {exc}")
        fraud_result = {"target": sql_results.get("target", "Unknown"), "success": False, "error": str(exc)}

    return {
        "request":          request.request,
        "target":           plan.get("target"),
        "pipeline_errors":  pipeline_errors,
        "plan":             plan,
        "sql_results":      sql_results,
        "graph_results":    graph_results,
        "fraud_assessment": fraud_result,
        "risk_score":       fraud_result.get("assessment", {}).get("score"),
        "risk_level":       fraud_result.get("assessment", {}).get("risk_level"),
        "recommendation":   fraud_result.get("assessment", {}).get("recommendation"),
        "summary":          fraud_result.get("assessment", {}).get("summary"),
    }