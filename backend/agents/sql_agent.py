import subprocess
import json
import psycopg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://sentinel:sentinel123@localhost:5434/sentineldb")


def run_query(sql: str) -> dict:
    """Execute a single SQL query via Coral CLI directly."""
    try:
        result = subprocess.run(
            ["coral", "sql", "--format", "json", sql],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            return {"success": False, "rows": [], "count": 0, "error": result.stderr.strip()}

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

        return {"success": True, "rows": rows, "count": len(rows), "error": None}

    except subprocess.TimeoutExpired:
        return {"success": False, "rows": [], "count": 0, "error": "Query timed out"}
    except Exception as e:
        return {"success": False, "rows": [], "count": 0, "error": str(e)}


def execute_plan(plan: dict) -> dict:
    """
    Takes a query plan from the Planner and executes all queries.
    Returns a results dict compatible with graph_agent.populate_graph().
    """
    results = {
        "target":        plan.get("target"),
        "summary":       plan.get("summary"),
        "query_results": [],
        "total_rows":    0,
        "errors":        [],
    }

    sources_hit = set()

    for query in plan.get("queries", []):
        print(f"  Running [{query['id']}] {query['name']}...")

        result = run_query(query["sql"])

        rows  = result.get("rows", [])
        count = result.get("count", len(rows))

        # Debug: always show what came back
        if rows:
            print(f"    → {count} rows  |  keys: {list(rows[0].keys())}")
        else:
            error = result.get("error")
            if error:
                print(f"    → 0 rows  |  ERROR: {error}")
            else:
                print(f"    → 0 rows  |  (no matching data)")

        query_result = {
            "id":      query["id"],
            "name":    query["name"],
            "purpose": query.get("purpose", ""),
            "sql":     query["sql"],
            "rows":    rows,
            "count":   count,
            "success": result.get("success", True),
            "error":   result.get("error"),
        }

        results["query_results"].append(query_result)
        results["total_rows"] += count

        if not query_result["success"] and query_result["error"]:
            results["errors"].append(f"[{query['id']}] {query_result['error']}")

        # Track which tables were queried for coral_traces
        sql_lower = query["sql"].lower()
        for table in ["transactions", "sanctions", "emails", "slack_logs"]:
            if table in sql_lower:
                sources_hit.add(f"sentineldb.{table}")

    _log_trace(plan, results, list(sources_hit))

    return results


def _log_trace(plan: dict, results: dict, sources_hit: list):
    """Log this investigation run to the coral_traces table."""
    try:
        query_summary = (
            f"Investigation: {plan.get('target')} — "
            f"{len(plan.get('queries', []))} queries, "
            f"{results['total_rows']} total rows"
        )
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO coral_traces (query_text, sources_hit, execution_ms, cache_hit)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (query_summary, sources_hit, 0, False),
                )
            conn.commit()
    except Exception as e:
        print(f"  Warning: could not log trace: {e}")


if __name__ == "__main__":
    from planner import plan_investigation

    print("Planning investigation...")
    plan = plan_investigation("Investigate Vendor Zenith LLC")

    print(f"\nQuery plan ({len(plan['queries'])} queries):")
    for q in plan["queries"]:
        print(f"  [{q['id']}] {q['name']}")
        print(f"       {q['sql']}")

    print(f"\nExecuting queries...\n")
    results = execute_plan(plan)

    print(f"\nResults summary:")
    print(f"  Target:     {results['target']}")
    print(f"  Total rows: {results['total_rows']}")
    print(f"  Errors:     {results['errors'] or 'none'}")
    print()

    for qr in results["query_results"]:
        status = "✓" if qr["success"] else "✗"
        print(f"  {status} [{qr['id']}] {qr['name']}: {qr['count']} rows")
        if qr["rows"]:
            print(f"       Sample: {json.dumps(qr['rows'][0], indent=6)}")
        if qr["error"]:
            print(f"       Error:  {qr['error']}")