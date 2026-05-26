import httpx
import json
import psycopg
import os
from dotenv import load_dotenv

load_dotenv()

QUERY_ENDPOINT = "http://localhost:8000/query"
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://sentinel:sentinel123@localhost:5434/sentineldb")


def run_query(sql: str) -> dict:
    """Execute a single SQL query via the Coral /query endpoint."""
    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(QUERY_ENDPOINT, json={"sql": sql})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        return {"success": False, "rows": [], "count": 0, "error": str(e)}


def execute_plan(plan: dict) -> dict:
    """
    Takes a query plan from the Planner and executes all queries.
    Returns a results dict with query outputs and a coral_trace entry.
    """
    results = {
        "target": plan.get("target"),
        "summary": plan.get("summary"),
        "query_results": [],
        "total_rows": 0,
        "errors": [],
    }

    sources_hit = set()

    for query in plan.get("queries", []):
        print(f"  Running [{query['id']}] {query['name']}...")

        result = run_query(query["sql"])

        query_result = {
            "id": query["id"],
            "name": query["name"],
            "purpose": query["purpose"],
            "sql": query["sql"],
            "rows": result.get("rows", []),
            "count": result.get("count", 0),
            "success": result.get("success", False),
            "error": result.get("error"),
        }

        results["query_results"].append(query_result)
        results["total_rows"] += query_result["count"]

        if not query_result["success"]:
            results["errors"].append(f"[{query['id']}] {query_result['error']}")

        # Track which tables were hit for coral_traces
        sql_lower = query["sql"].lower()
        for table in ["transactions", "sanctions", "emails", "slack_logs"]:
            if table in sql_lower:
                sources_hit.add(f"sentineldb.{table}")

    # Log to coral_traces
    _log_trace(plan, results, list(sources_hit))

    return results


def _log_trace(plan: dict, results: dict, sources_hit: list):
    """Log this investigation run to the coral_traces table."""
    try:
        query_summary = f"Investigation: {plan.get('target')} — {len(plan.get('queries', []))} queries"
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO coral_traces (query_text, sources_hit, execution_ms, cache_hit)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (query_summary, sources_hit, 0, False)
                )
            conn.commit()
    except Exception as e:
        print(f"  Warning: could not log trace: {e}")


if __name__ == "__main__":
    from planner import plan_investigation

    print("Planning investigation...")
    plan = plan_investigation("Investigate Vendor Zenith LLC")

    print(f"\nExecuting {len(plan['queries'])} queries...\n")
    results = execute_plan(plan)

    print(f"\nResults summary:")
    print(f"  Target: {results['target']}")
    print(f"  Total rows found: {results['total_rows']}")
    print(f"  Errors: {results['errors'] or 'none'}")
    print()

    for qr in results["query_results"]:
        print(f"  [{qr['id']}] {qr['name']}: {qr['count']} rows")
        if qr["rows"]:
            print(f"       Sample: {json.dumps(qr['rows'][0], indent=2)}")