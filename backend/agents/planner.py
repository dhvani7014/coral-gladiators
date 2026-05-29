import json
import os
import re
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

PLANNER_SYSTEM_PROMPT = """You are SentinelAI's investigation planner. Your job is to analyze a fraud investigation request and produce a structured query plan.

You have access to a federated SQL database via Coral with these tables:
- sentineldb.transactions (transaction_id, sender, receiver, amount, timestamp, location, risk_score, flags)
- sentineldb.sanctions (id, entity_name, country, sanction_type, listed_date, source)
- sentineldb.emails (email_id, sender, receiver, subject, body, timestamp, employee_id)
- sentineldb.slack_logs (message_id, user_id, user_name, channel, message, timestamp)

Given an investigation target (e.g. a vendor name, employee ID, or transaction pattern), produce a JSON query plan with 4-5 SQL queries that together build a complete fraud picture.

Always include:
1. A transaction query — find all transactions involving the target
2. A sanctions check — check if the target appears in sanctions list
3. An email query — search emails for mentions of the target (search subject and body)
4. A slack query — search slack_logs for mentions of the target (separate query from emails)
5. A cross-source JOIN — at least one query that joins 2+ tables

CRITICAL RULES:
- NEVER use UNION or UNION ALL — emails and slack_logs have different columns and cannot be combined
- Always run emails and slack_logs as separate queries
- Use LIKE '%keyword%' for text searches — for vendor names like "Zenith LLC", search for just the first word e.g. LIKE '%Zenith%' to catch partial mentions
- Keep queries simple — no subqueries, no CTEs
- Only use columns that exist in the table definitions above
- For slack_logs searches, always use a short keyword (first word of vendor name), not the full legal name

Respond ONLY with a valid JSON object in this exact format, no markdown, no backticks:
{
  "target": "the entity being investigated",
  "summary": "one sentence description of the investigation approach",
  "queries": [
    {
      "id": "q1",
      "name": "short name for this query",
      "purpose": "what this query is looking for",
      "sql": "SELECT ... FROM sentineldb.transactions ..."
    }
  ]
}"""


def _patch_plan(plan: dict) -> dict:
    """
    Post-process the LLM plan to fix known issues:
    1. Slack queries: broaden LIKE '%Vendor LLC%' -> '%Vendor%' (strip suffix after first word)
    2. Ensure no UNION/UNION ALL slips through
    """
    for query in plan.get("queries", []):
        name = query.get("name", "").lower()
        sql  = query.get("sql", "")

        # Fix 1: Broaden LIKE patterns in slack queries
        # Matches: LIKE '%Zenith LLC%' or LIKE '%Zenith LLC' -> LIKE '%Zenith%'
        if "slack" in name:
            def _broaden_like(match):
                inner = match.group(1)  # e.g. "Zenith LLC"
                first_word = inner.strip().split()[0]  # "Zenith"
                return f"LIKE '%{first_word}%'"

            sql = re.sub(
                r"LIKE\s+'%([^%']+?)%?'",
                _broaden_like,
                sql,
                flags=re.IGNORECASE,
            )
            query["sql"] = sql

        # Fix 2: Catch any UNION that slipped through
        if re.search(r'\bUNION\b', sql, re.IGNORECASE):
            # Split on UNION and keep only the first SELECT
            sql = re.split(r'\bUNION\b', sql, flags=re.IGNORECASE)[0].strip()
            query["sql"] = sql

    return plan


def plan_investigation(user_query: str) -> dict:
    """
    Takes a natural language investigation request and returns a structured query plan.
    """
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
            {"role": "user",   "content": user_query},
        ],
        temperature=0.1,
        max_tokens=2000,
    )

    response_text = response.choices[0].message.content.strip()

    try:
        plan = json.loads(response_text)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if match:
            plan = json.loads(match.group())
        else:
            raise ValueError(f"Planner returned invalid JSON: {response_text}")

    # Apply post-processing fixes
    plan = _patch_plan(plan)

    return plan


if __name__ == "__main__":
    plan = plan_investigation("Investigate Vendor Zenith LLC")
    print(json.dumps(plan, indent=2))