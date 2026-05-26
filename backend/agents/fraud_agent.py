import json
import os
import re
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

FRAUD_SYSTEM_PROMPT = """You are SentinelAI's fraud analysis agent. You receive the results of a multi-source investigation and must produce a structured fraud assessment.

Analyze the evidence and score the risk from 0-100 based on:
- Transaction patterns (high amounts, repeated transfers, offshore locations)
- Sanctions matches (entity appears in sanctions list = major red flag)
- Communications evidence (emails/slack showing intent to conceal)
- Cross-source corroboration (same entity appearing in multiple sources)

Risk score guidelines:
- 0-30: Low risk, likely legitimate
- 31-60: Medium risk, requires monitoring  
- 61-80: High risk, requires review
- 81-100: Critical risk, escalate immediately

Respond ONLY with a valid JSON object, no markdown, no backticks:
{
  "target": "entity name",
  "risk_score": 0-100,
  "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "recommendation": "CLEAR|MONITOR|REVIEW|ESCALATE",
  "findings": [
    {
      "source": "transactions|sanctions|emails|slack_logs",
      "severity": "LOW|MEDIUM|HIGH|CRITICAL",
      "description": "what was found"
    }
  ],
  "summary": "2-3 sentence executive summary of the fraud case"
}"""


def analyze_fraud(investigation_results: dict) -> dict:
    """
    Takes SQL agent results and produces a fraud risk assessment.
    """
    # Build a concise evidence summary for the LLM
    evidence = []
    for qr in investigation_results.get("query_results", []):
        if qr["count"] > 0:
            evidence.append({
                "query": qr["name"],
                "purpose": qr["purpose"],
                "rows_found": qr["count"],
                "sample_data": qr["rows"][:3],  # send first 3 rows only
            })

    prompt = f"""Investigate this entity: {investigation_results.get('target')}

Evidence gathered from federated SQL queries:
{json.dumps(evidence, indent=2)}

Produce a fraud risk assessment."""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": FRAUD_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        max_tokens=2000,
    )

    response_text = response.choices[0].message.content.strip()

    try:
        assessment = json.loads(response_text)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if match:
            assessment = json.loads(match.group())
        else:
            raise ValueError(f"Fraud agent returned invalid JSON: {response_text}")

    return assessment


if __name__ == "__main__":
    from planner import plan_investigation
    from sql_agent import execute_plan

    print("Planning...")
    plan = plan_investigation("Investigate Vendor Zenith LLC")

    print("Executing queries...")
    results = execute_plan(plan)

    print("Analyzing fraud...")
    assessment = analyze_fraud(results)

    print("\nFraud Assessment:")
    print(json.dumps(assessment, indent=2))