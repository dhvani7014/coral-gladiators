import json
import os
import re

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

PLANNER_SYSTEM_PROMPT = """You are SentinelAI's sanctions and intelligence screening planner. Your job is to analyze a screening request and produce a structured query plan.

You have access to a federated SQL database via Coral with these tables:
- sanctions.sanctions (id, entity_name, country, sanction_type, listed_date, source)
- emails.emails (email_id, sender, receiver, subject, body, timestamp, employee_id)
- slack.slack_logs (message_id, user_id, user_name, channel, message, timestamp)

Given a target name (a company, person, or organisation), produce a JSON query plan with exactly 4 SQL queries that together build a complete sanctions and intelligence picture.

Always include ALL FOUR of these queries in this order:
1. Sanctions exact match — find exact entity_name matches in sanctions list
2. Sanctions fuzzy match — find partial matches using LIKE for related entities, subsidiaries, aliases
3. Email intelligence — search emails subject and body for mentions of the target
4. Slack intelligence — search slack_logs message for mentions of the target (use first word only)

CRITICAL RULES:
- NEVER query transactions — that table does not exist
- NEVER use UNION or UNION ALL
- Always run emails and slack_logs as SEPARATE queries
- Use LIKE '%keyword%' for text searches
- For the fuzzy sanctions search, use the first significant word of the name e.g. for "Zenith LLC" search LIKE '%Zenith%'
- For slack searches, always use a short keyword (first word of the target name)
- Keep queries simple — no subqueries, no CTEs
- Only use columns that exist in the table definitions above

Respond ONLY with a valid JSON object in this exact format, no markdown, no backticks:
{
  "target": "the entity being investigated",
  "summary": "one sentence description of what this screening covers",
  "queries": [
    {
      "id": "q1",
      "name": "Sanctions Exact Match",
      "purpose": "Direct hit on sanctions watchlist",
      "sql": "SELECT entity_name, country, sanction_type, listed_date, source FROM sanctions.sanctions WHERE entity_name = 'Target Name' LIMIT 20"
    },
    {
      "id": "q2",
      "name": "Sanctions Related Entities",
      "purpose": "Find subsidiaries, aliases and related sanctioned entities",
      "sql": "SELECT entity_name, country, sanction_type, listed_date, source FROM sanctions.sanctions WHERE entity_name LIKE '%Keyword%' LIMIT 20"
    },
    {
      "id": "q3",
      "name": "Email Intelligence",
      "purpose": "Internal emails mentioning this entity",
      "sql": "SELECT sender, receiver, subject, body, timestamp FROM emails.emails WHERE subject LIKE '%Keyword%' OR body LIKE '%Keyword%' ORDER BY timestamp DESC LIMIT 20"
    },
    {
      "id": "q4",
      "name": "Slack Intelligence",
      "purpose": "Internal Slack messages mentioning this entity",
      "sql": "SELECT user_name, channel, message, timestamp FROM slack.slack_logs WHERE message LIKE '%Keyword%' ORDER BY timestamp DESC LIMIT 20"
    }
  ]
}"""


def _patch_plan(plan: dict) -> dict:
    """
    Post-process the LLM plan to fix known issues:
    1. Remove any query that references the transactions table
    2. Ensure no UNION/UNION ALL slips through
    """
    filtered = []
    for query in plan.get("queries", []):
        sql = query.get("sql", "")

        # Fix 1: Drop any query referencing transactions table
        if re.search(r"\btransactions\b", sql, re.IGNORECASE):
            continue

        # Fix 2: Catch any UNION that slipped through
        if re.search(r"\bUNION\b", sql, re.IGNORECASE):
            sql = re.split(r"\bUNION\b", sql, flags=re.IGNORECASE)[0].strip()
            query["sql"] = sql

        filtered.append(query)

    plan["queries"] = filtered
    return plan


def plan_investigation(user_query: str) -> dict:
    """
    Takes a natural language investigation request and returns a structured query plan.
    """
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
            {"role": "user", "content": user_query},
        ],
        temperature=0.1,
        max_tokens=2000,
    )

    response_text = response.choices[0].message.content.strip()

    try:
        plan = json.loads(response_text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", response_text, re.DOTALL)
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
