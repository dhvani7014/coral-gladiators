"""
fraud_agent.py — SentinelAI Fraud Analysis Agent
"""

import os
import json
from neo4j import GraphDatabase
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

NEO4J_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER     = os.getenv("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "sentinel123")

_driver = None

def _get_driver():
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    return _driver

def _run(cypher: str, params: dict = {}) -> list[dict]:
    driver = _get_driver()
    with driver.session() as session:
        result = session.run(cypher, **params)
        return [dict(record) for record in result]


# ---------------------------------------------------------------------------
# Flag parser — handles JSON strings, plain strings, lists, nested lists
# ---------------------------------------------------------------------------

def _parse_flags(flags_val) -> list:
    """
    Robustly parse flags however Neo4j returns them:
      - Already a list of strings: ["FRAUD", "TRANSFER"]
      - List of JSON strings:      ['["FRAUD","TRANSFER"]', '["FRAUD"]']
      - JSON string:               '["FRAUD","TRANSFER"]'
      - Plain CSV string:          "FRAUD,TRANSFER"
    Returns a flat deduplicated list of flag strings.
    """
    if not flags_val:
        return []

    result = []

    def _extract(val):
        if isinstance(val, list):
            for item in val:
                _extract(item)
        elif isinstance(val, str) and val.strip():
            # Try JSON parse first
            try:
                parsed = json.loads(val)
                if isinstance(parsed, list):
                    for item in parsed:
                        _extract(item)
                else:
                    result.append(str(parsed).strip())
            except (json.JSONDecodeError, ValueError):
                # Plain string — may be comma-separated
                for part in val.split(","):
                    part = part.strip().strip('"').strip("'")
                    if part:
                        result.append(part)

    _extract(flags_val)

    # Deduplicate while preserving order
    seen = set()
    deduped = []
    for f in result:
        if f not in seen:
            seen.add(f)
            deduped.append(f)
    return deduped


# ---------------------------------------------------------------------------
# Graph evidence extraction
# ---------------------------------------------------------------------------

def extract_graph_evidence(target: str) -> dict:
    evidence = {}

    # 1. Transaction summary
    txn_rows = _run("""
        MATCH (t:Transaction)
        WHERE EXISTS { MATCH (e:Entity {name: $target})-[:INITIATED]->(t) }
           OR EXISTS { MATCH (t)-[:SENT_TO]->(e:Entity {name: $target}) }
        RETURN
            count(t)              AS tx_count,
            sum(t.amount)         AS total_amount,
            avg(t.amount)         AS avg_amount,
            max(t.amount)         AS max_amount,
            collect(t.flags)      AS flag_lists,
            collect(t.risk_score) AS risk_scores
    """, {"target": target})

    if txn_rows:
        row = txn_rows[0]
        # flag_lists is a list of whatever Neo4j stored per transaction
        # _parse_flags handles all formats including nested JSON strings
        all_flags = _parse_flags(row.get("flag_lists") or [])

        evidence["transactions"] = {
            "count":        row.get("tx_count", 0),
            "total_amount": float(row.get("total_amount") or 0),
            "avg_amount":   float(row.get("avg_amount")   or 0),
            "max_amount":   float(row.get("max_amount")   or 0),
            "flags":        all_flags,
            "risk_scores":  [float(s) for s in (row.get("risk_scores") or []) if s is not None],
        }
    else:
        evidence["transactions"] = {
            "count": 0, "total_amount": 0, "avg_amount": 0,
            "max_amount": 0, "flags": [], "risk_scores": [],
        }

    # 2. Sanctions hits
    sanction_rows = _run("""
        MATCH (e:Entity {name: $target})-[:LISTED_IN]->(s:SanctionList)
        RETURN count(s) AS sanction_count, collect(s.sanction_type) AS types
    """, {"target": target})

    if sanction_rows:
        row = sanction_rows[0]
        evidence["sanctions"] = {
            "hit_count": row.get("sanction_count", 0),
            "types":     list(row.get("types") or []),
        }
    else:
        evidence["sanctions"] = {"hit_count": 0, "types": []}

    # 3. Sanctioned transactions — DISTINCT fix applied
    sanctioned_txn_rows = _run("""
        MATCH (t:Transaction)-[:INVOLVES_SANCTIONED]->(v:Entity)
        WHERE EXISTS { MATCH (:Entity {name: $target})-[:INITIATED]->(t) }
           OR EXISTS { MATCH (t)-[:SENT_TO]->(:Entity {name: $target}) }
        RETURN count(t) AS count, collect(DISTINCT v.name) AS sanctioned_entities
    """, {"target": target})

    if sanctioned_txn_rows:
        row = sanctioned_txn_rows[0]
        evidence["sanctioned_transactions"] = {
            "count":    row.get("count", 0),
            "entities": list(row.get("sanctioned_entities") or []),
        }
    else:
        evidence["sanctioned_transactions"] = {"count": 0, "entities": []}

    # 4. Email evidence
    email_rows = _run("""
        MATCH (e:Entity)-[:SENT_EMAIL]->(em:Email)
        WHERE e.name CONTAINS $target OR em.subject CONTAINS $target OR em.body CONTAINS $target
        RETURN count(em) AS email_count, collect(em.subject) AS subjects
    """, {"target": target})

    if email_rows:
        row = email_rows[0]
        evidence["emails"] = {
            "count":    row.get("email_count", 0),
            "subjects": list(row.get("subjects") or []),
        }
    else:
        evidence["emails"] = {"count": 0, "subjects": []}

    # 5. Slack evidence — searches partial name too
    slack_target = target.split()[0]  # "Zenith LLC" → "Zenith"

    slack_rows = _run("""
        MATCH (e:Entity)-[:POSTED]->(s:SlackMessage)
        WHERE e.name CONTAINS $target
        OR s.message CONTAINS $target
        OR s.message CONTAINS $slack_target
        RETURN count(s) AS slack_count, collect(s.message) AS messages
        """, {"target": target, "slack_target": slack_target})

    if slack_rows:
        row = slack_rows[0]
        evidence["slack"] = {
            "count":    row.get("slack_count", 0),
            "messages": list(row.get("messages") or []),
        }
    else:
        evidence["slack"] = {"count": 0, "messages": []}

    # 6. Corroboration edges
    corroboration_rows = _run("""
        MATCH (ev)-[:CORROBORATES]->(t:Transaction)
        WHERE EXISTS { MATCH (:Entity {name: $target})-[:INITIATED]->(t) }
           OR EXISTS { MATCH (t)-[:SENT_TO]->(:Entity {name: $target}) }
        RETURN count(ev) AS corroboration_count
    """, {"target": target})

    evidence["corroborations"] = (
        corroboration_rows[0].get("corroboration_count", 0) if corroboration_rows else 0
    )

    # 7. Counterparties
    counterparty_rows = _run("""
        MATCH (a:Entity)-[:INITIATED]->(t:Transaction)-[:SENT_TO]->(b:Entity)
        WHERE a.name = $target OR b.name = $target
        RETURN collect(DISTINCT CASE WHEN a.name = $target THEN b.name ELSE a.name END) AS counterparties
    """, {"target": target})

    evidence["counterparties"] = (
        list(counterparty_rows[0].get("counterparties") or []) if counterparty_rows else []
    )

    return evidence


# ---------------------------------------------------------------------------
# Rule-based scoring
# ---------------------------------------------------------------------------

def rule_based_score(evidence: dict) -> tuple[int, list[str]]:
    score = 0
    rules = []

    txn             = evidence.get("transactions", {})
    sanctions       = evidence.get("sanctions", {})
    sanctioned_txns = evidence.get("sanctioned_transactions", {})

    if sanctions.get("hit_count", 0) > 0:
        score += 35
        rules.append(
            f"SANCTIONS HIT: Entity appears on {sanctions['hit_count']} sanctions list(s) "
            f"({', '.join(sanctions['types']) or 'unknown type'})"
        )

    if sanctioned_txns.get("count", 0) > 0:
        score += 25
        rules.append(
            f"SANCTIONED TRANSACTIONS: {sanctioned_txns['count']} transaction(s) "
            f"directly involve sanctioned entities: {', '.join(sanctioned_txns['entities'])}"
        )

    tx_count = txn.get("count", 0)
    total    = txn.get("total_amount", 0)
    max_amt  = txn.get("max_amount", 0)

    if tx_count > 5:
        score += 10
        rules.append(f"HIGH FREQUENCY: {tx_count} transactions recorded")

    if total > 500_000:
        score += 15
        rules.append(f"LARGE TOTAL VOLUME: ${total:,.2f} transacted in total")
    elif total > 100_000:
        score += 8
        rules.append(f"ELEVATED VOLUME: ${total:,.2f} transacted in total")

    if max_amt > 100_000:
        score += 10
        rules.append(f"LARGE SINGLE TRANSACTION: max amount ${max_amt:,.2f}")

    flags        = txn.get("flags", [])
    unique_flags = list(dict.fromkeys(f for f in flags if f))  # deduplicated, order preserved
    if unique_flags:
        score += min(len(unique_flags) * 5, 15)
        rules.append(f"RISK FLAGS PRESENT: {', '.join(unique_flags)}")

    risk_scores = txn.get("risk_scores", [])
    if risk_scores:
        avg_risk = sum(risk_scores) / len(risk_scores)
        if avg_risk > 0.7:
            score += 10
            rules.append(f"HIGH INTERNAL RISK SCORE: avg={avg_risk:.2f} across {len(risk_scores)} transactions")
        elif avg_risk > 0.4:
            score += 5
            rules.append(f"MODERATE INTERNAL RISK SCORE: avg={avg_risk:.2f}")

    corroborations = evidence.get("corroborations", 0)
    if corroborations > 0:
        score += 10
        rules.append(
            f"CROSS-SOURCE CORROBORATION: {corroborations} email/slack message(s) corroborate suspicious transactions"
        )

    email_count = evidence.get("emails", {}).get("count", 0)
    slack_count = evidence.get("slack", {}).get("count", 0)

    if email_count > 2:
        score += 5
        rules.append(f"INTERNAL EMAIL ACTIVITY: {email_count} emails reference this entity")

    if slack_count > 0:
        score += 3
        rules.append(f"SLACK CHATTER: {slack_count} internal Slack message(s) mention this entity")

    counterparties = evidence.get("counterparties", [])
    if len(counterparties) > 3:
        score += 5
        rules.append(f"WIDE NETWORK: transactions sent to {len(counterparties)} distinct counterparties")

    return min(score, 100), rules


# ---------------------------------------------------------------------------
# LLM assessment
# ---------------------------------------------------------------------------

def _llm_assess(target: str, evidence: dict, rule_score: int, rule_findings: list[str]) -> dict:
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))

    system_prompt = """You are a senior fraud investigator at a financial crime intelligence unit.
You receive structured evidence extracted from a graph database about a target entity.
Your job is to produce a concise, professional fraud risk assessment.

Respond ONLY with a JSON object. No markdown, no explanation outside the JSON.

JSON schema:
{
  "score": <integer 0-100>,
  "risk_level": <"CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "MINIMAL">,
  "summary": <one paragraph executive summary>,
  "key_findings": [<list of specific concerning findings, most serious first>],
  "recommendation": <"ESCALATE TO COMPLIANCE" | "FURTHER INVESTIGATION REQUIRED" | "MONITOR" | "NO ACTION REQUIRED">,
  "confidence": <"HIGH" | "MEDIUM" | "LOW">
}

Risk level thresholds:
- CRITICAL: 80-100
- HIGH: 60-79
- MEDIUM: 40-59
- LOW: 20-39
- MINIMAL: 0-19"""

    user_prompt = f"""FRAUD INVESTIGATION REQUEST
Target Entity: {target}

=== RULE-BASED PRE-SCORE ===
Score: {rule_score}/100
Triggered Rules:
{chr(10).join(f'  • {r}' for r in rule_findings) if rule_findings else '  • None triggered'}

=== GRAPH DATABASE EVIDENCE ===
{json.dumps(evidence, indent=2)}

Based on all evidence above, provide your fraud risk assessment JSON."""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        temperature=0.1,
        max_tokens=1000,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def analyze_fraud(investigation_results: dict) -> dict:
    target = investigation_results.get("target", "Unknown")

    try:
        evidence                  = extract_graph_evidence(target)
        rule_score, rule_findings = rule_based_score(evidence)
        assessment                = _llm_assess(target, evidence, rule_score, rule_findings)

        return {
            "target":         target,
            "rule_score":     rule_score,
            "rule_findings":  rule_findings,
            "graph_evidence": evidence,
            "assessment":     assessment,
            "success":        True,
            "error":          None,
        }

    except Exception as exc:
        try:
            evidence                  = extract_graph_evidence(target)
            rule_score, rule_findings = rule_based_score(evidence)
        except Exception:
            evidence, rule_score, rule_findings = {}, 0, []

        risk_level = (
            "CRITICAL" if rule_score >= 80 else
            "HIGH"     if rule_score >= 60 else
            "MEDIUM"   if rule_score >= 40 else
            "LOW"      if rule_score >= 20 else
            "MINIMAL"
        )

        return {
            "target":         target,
            "rule_score":     rule_score,
            "rule_findings":  rule_findings,
            "graph_evidence": evidence,
            "assessment": {
                "score":        rule_score,
                "risk_level":   risk_level,
                "summary":      f"LLM assessment unavailable ({exc}). Rule-based score: {rule_score}/100.",
                "key_findings": rule_findings,
                "recommendation": (
                    "ESCALATE TO COMPLIANCE"          if rule_score >= 80 else
                    "FURTHER INVESTIGATION REQUIRED"  if rule_score >= 60 else
                    "MONITOR"                         if rule_score >= 40 else
                    "NO ACTION REQUIRED"
                ),
                "confidence": "LOW",
            },
            "success": False,
            "error":   str(exc),
        }


if __name__ == "__main__":
    result = analyze_fraud({"target": "Zenith LLC"})
    print(json.dumps(result, indent=2))