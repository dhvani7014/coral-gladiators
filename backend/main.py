import subprocess
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="SentinelAI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    sql: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "SentinelAI Backend"}

@app.post("/query")
def run_query(request: QueryRequest):
    """Execute a Coral federated SQL query and return results as JSON."""
    try:
        result = subprocess.run(
            ["coral", "sql", "--format", "json", request.sql],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=400,
                detail=f"Coral query failed: {result.stderr.strip()}"
            )

        # Coral JSON output is one JSON object per line (NDJSON)
        rows = []
        for line in result.stdout.strip().splitlines():
            line = line.strip()
            if line:
                try:
                    parsed = json.loads(line)
                    # Coral wraps all rows in a single array
                    if isinstance(parsed, list):
                        rows.extend(parsed)
                    else:
                        rows.append(parsed)
                except json.JSONDecodeError:
                    continue

        return {
            "success": True,
            "rows": rows,
            "count": len(rows),
            "sql": request.sql,
        }

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Query timed out after 30 seconds")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))