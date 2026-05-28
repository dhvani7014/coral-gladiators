import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def generate_report(
    target: str,
    sql_results: dict,
    fraud_assessment: dict,
    graph_intelligence: dict,
) -> dict:
    """Call LLM to produce a structured investigation report."""

    # Summarise inputs so we don't blow the context window
    sql_summary = []
    for q in sql_results.get("query_results", []):
        sql_summary.append({
            "query": q["name"],
            "rows_returned": q["count"],
            "sample": q["rows"][:3] if q.get("rows") else [],
        })

    fraud_score = fraud_assessment.get("assessment", {}).get("score", 0)
    risk_level = fraud_assessment.get("assessment", {}).get("risk_level", "UNKNOWN")
    rule_findings = fraud_assessment.get("rule_findings", [])
    graph_findings = graph_intelligence.get("findings", [])

    prompt = f"""
You are a senior financial crime investigator writing a formal fraud investigation report.

TARGET ENTITY: {target}

FRAUD SCORE: {fraud_score}/100
RISK LEVEL: {risk_level}

RULE-BASED FINDINGS:
{json.dumps(rule_findings, indent=2)}

GRAPH INTELLIGENCE FINDINGS:
{json.dumps(graph_findings, indent=2)}

SQL EVIDENCE SUMMARY:
{json.dumps(sql_summary, indent=2)}

Write a structured report with EXACTLY this JSON shape and nothing else:
{{
  "title": "Fraud Investigation Report — {target}",
  "risk_score": <integer 0-100>,
  "risk_level": "<CRITICAL|HIGH|MEDIUM|LOW>",
  "executive_summary": "<2-3 sentence paragraph>",
  "key_findings": ["<finding 1>", "<finding 2>", ...],
  "evidence": [
    {{"source": "<SQL|Graph|Sanctions>", "detail": "<what was found>"}}
  ],
  "network_analysis": "<1-2 sentences about graph relationships>",
  "recommended_action": "<ESCALATE TO COMPLIANCE|FLAG FOR REVIEW|CLEAR|FREEZE ACCOUNT>",
  "confidence": "<HIGH|MEDIUM|LOW>",
  "investigator_notes": "<any caveats or next steps>"
}}

Return only valid JSON. No markdown, no preamble.
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1500,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        report = json.loads(raw)
    except Exception as e:
        # Fallback — build report from rule data if LLM fails
        report = {
            "title": f"Fraud Investigation Report — {target}",
            "risk_score": fraud_score,
            "risk_level": risk_level,
            "executive_summary": f"Automated analysis flagged {target} with a risk score of {fraud_score}/100. Manual review required.",
            "key_findings": rule_findings + graph_findings,
            "evidence": [{"source": q["query"], "detail": f"{q['rows_returned']} rows"} for q in sql_summary],
            "network_analysis": "Graph analysis completed. See graph explorer for full network.",
            "recommended_action": "ESCALATE TO COMPLIANCE" if fraud_score >= 80 else "FLAG FOR REVIEW",
            "confidence": "MEDIUM",
            "investigator_notes": f"LLM generation failed: {str(e)}. Report generated from rule engine.",
        }

    return report