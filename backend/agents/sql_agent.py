import json
import subprocess

from dotenv import load_dotenv

load_dotenv()


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
            return {
                "success": False,
                "rows": [],
                "count": 0,
                "error": result.stderr.strip(),
            }

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

        rows = result.get("rows", [])
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
            "id": query["id"],
            "name": query["name"],
            "purpose": query.get("purpose", ""),
            "sql": query["sql"],
            "rows": rows,
            "count": count,
            "success": result.get("success", True),
            "error": result.get("error"),
        }

        results["query_results"].append(query_result)
        results["total_rows"] += count

        if not query_result["success"] and query_result["error"]:
            results["errors"].append(f"[{query['id']}] {query_result['error']}")

        SOURCE_TABLE_MAP = {
            "sanctions": "sanctions.sanctions",
            "emails": "emails.emails",
            "slack_logs": "slack.slack_logs",
        }
        sql_lower = query["sql"].lower()
        for table, full_name in SOURCE_TABLE_MAP.items():
            if table in sql_lower:
                sources_hit.add(full_name)

    return results


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
