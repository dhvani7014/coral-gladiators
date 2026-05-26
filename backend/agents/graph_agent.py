import os
import json
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "sentinel123")


# ---------------------------------------------------------------------------
# Field normalizers
# ---------------------------------------------------------------------------

def normalize_transaction(row: dict) -> dict:
    return {
        "transaction_id": row.get("transaction_id") or row.get("id") or row.get("txn_id") or "",
        "sender": row.get("sender") or row.get("employee_id") or row.get("from") or "unknown",
        "receiver": row.get("receiver") or row.get("vendor") or row.get("to") or "unknown",
        "amount": float(row.get("amount") or row.get("tx_amount") or 0),
        "timestamp": str(row.get("timestamp") or row.get("date") or row.get("created_at") or ""),
        "location": row.get("location") or row.get("country") or "",
        "risk_score": int(row.get("risk_score") or row.get("score") or 0),
        "flags": str(row.get("flags") or row.get("flag") or ""),
        "status": row.get("status") or "",
    }


def normalize_sanction(row: dict) -> dict:
    return {
        "entity_name": (
            row.get("entity_name") or row.get("name") or row.get("vendor") or
            row.get("sanctioned_entity") or row.get("entity") or "unknown"
        ),
        "sanction_type": row.get("sanction_type") or row.get("type") or row.get("category") or "",
        "country": row.get("country") or row.get("jurisdiction") or "",
        "source": row.get("source") or row.get("list_name") or row.get("list_source") or "OpenSanctions",
        "reason": row.get("reason") or row.get("description") or "",
    }


def normalize_email(row: dict) -> dict:
    return {
        "email_id": str(row.get("email_id") or row.get("id") or row.get("message_id") or ""),
        "sender": row.get("sender") or row.get("from") or row.get("from_address") or "unknown",
        "recipient": row.get("recipient") or row.get("to") or row.get("to_address") or "",
        "subject": row.get("subject") or "",
        "body": row.get("body") or row.get("content") or "",
        "timestamp": str(row.get("timestamp") or row.get("date") or row.get("sent_at") or ""),
    }


def normalize_slack(row: dict) -> dict:
    return {
        "message_id": str(row.get("message_id") or row.get("id") or row.get("ts") or ""),
        "user_name": row.get("user_name") or row.get("user") or row.get("username") or "unknown",
        "channel": row.get("channel") or row.get("channel_name") or "",
        "message": row.get("message") or row.get("text") or row.get("content") or "",
        "timestamp": str(row.get("timestamp") or row.get("ts") or row.get("date") or ""),
    }


# ---------------------------------------------------------------------------
# GraphAgent
# ---------------------------------------------------------------------------

class GraphAgent:
    def __init__(self):
        self.driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    def close(self):
        self.driver.close()

    def clear_investigation(self, target: str):
        with self.driver.session() as session:
            session.run(
                "MATCH (n {investigation_target: $target}) DETACH DELETE n",
                target=target,
            )

    def add_transaction(self, tx_data: dict, target: str):
        d = normalize_transaction(tx_data)
        with self.driver.session() as session:
            session.run("""
                MERGE (sender:Entity {name: $sender})
                SET sender.type = CASE
                        WHEN $sender STARTS WITH 'emp_' THEN 'Employee'
                        ELSE 'Vendor'
                    END,
                    sender.investigation_target = $target

                MERGE (receiver:Entity {name: $receiver})
                SET receiver.type = CASE
                        WHEN $receiver STARTS WITH 'emp_' THEN 'Employee'
                        ELSE 'Vendor'
                    END,
                    receiver.investigation_target = $target

                MERGE (tx:Transaction {transaction_id: $transaction_id})
                SET tx.amount               = $amount,
                    tx.timestamp            = $timestamp,
                    tx.location             = $location,
                    tx.risk_score           = $risk_score,
                    tx.flags                = $flags,
                    tx.status               = $status,
                    tx.investigation_target = $target

                MERGE (sender)-[:INITIATED]->(tx)
                MERGE (tx)-[:SENT_TO]->(receiver)
            """, {**d, "target": target})

    def add_sanction(self, sanction_data: dict, target: str):
        d = normalize_sanction(sanction_data)
        with self.driver.session() as session:
            session.run("""
                MERGE (e:Entity {name: $entity_name})
                SET e.sanctioned            = true,
                    e.sanction_type         = $sanction_type,
                    e.country               = $country,
                    e.sanction_reason       = $reason,
                    e.investigation_target  = $target

                MERGE (sl:SanctionList {name: $source})
                SET sl.investigation_target = $target

                MERGE (e)-[:LISTED_IN]->(sl)
            """, {**d, "target": target})

    def add_email_evidence(self, email_data: dict, target: str):
        d = normalize_email(email_data)
        with self.driver.session() as session:
            session.run("""
                MERGE (sender:Entity {name: $sender})
                SET sender.investigation_target = $target

                MERGE (email:Email {email_id: $email_id})
                SET email.subject               = $subject,
                    email.body                  = $body,
                    email.timestamp             = $timestamp,
                    email.investigation_target  = $target

                MERGE (sender)-[:SENT_EMAIL]->(email)
            """, {**d, "target": target})

            if d["recipient"]:
                session.run("""
                    MERGE (recipient:Entity {name: $recipient})
                    SET recipient.investigation_target = $target

                    MERGE (email:Email {email_id: $email_id})
                    MERGE (email)-[:RECEIVED_BY]->(recipient)
                """, {
                    "recipient": d["recipient"],
                    "email_id": d["email_id"],
                    "target": target,
                })

    def add_slack_evidence(self, slack_data: dict, target: str):
        d = normalize_slack(slack_data)
        with self.driver.session() as session:
            session.run("""
                MERGE (user:Entity {name: $user_name})
                SET user.type                   = 'Employee',
                    user.investigation_target   = $target

                MERGE (msg:SlackMessage {message_id: $message_id})
                SET msg.channel                 = $channel,
                    msg.message                 = $message,
                    msg.timestamp               = $timestamp,
                    msg.investigation_target    = $target

                MERGE (user)-[:POSTED]->(msg)
            """, {**d, "target": target})

    def add_corroboration_edges(self, target: str):
        with self.driver.session() as session:
            session.run("""
                MATCH (e:Email {investigation_target: $target})<-[:SENT_EMAIL]-(sender:Entity)
                MATCH (tx:Transaction {investigation_target: $target})<-[:INITIATED]-(sender)
                MERGE (e)-[:CORROBORATES]->(tx)
            """, target=target)

            session.run("""
                MATCH (msg:SlackMessage {investigation_target: $target})<-[:POSTED]-(user:Entity)
                MATCH (tx:Transaction {investigation_target: $target})<-[:INITIATED]-(user)
                MERGE (msg)-[:CORROBORATES]->(tx)
            """, target=target)

            session.run("""
                MATCH (tx:Transaction {investigation_target: $target})-[:SENT_TO]->(vendor:Entity)
                WHERE vendor.sanctioned = true
                MERGE (tx)-[:INVOLVES_SANCTIONED]->(vendor)
            """, target=target)

    def get_graph_summary(self, target: str) -> dict:
        with self.driver.session() as session:
            result = session.run("""
                MATCH (n)
                WHERE n.investigation_target = $target
                RETURN labels(n)[0] AS type, count(n) AS count
            """, target=target)
            node_counts = {r["type"]: r["count"] for r in result}

            result = session.run("""
                MATCH (a)-[r]->(b)
                WHERE a.investigation_target = $target
                   OR b.investigation_target = $target
                RETURN type(r) AS rel_type, count(r) AS count
            """, target=target)
            rel_counts = {r["rel_type"]: r["count"] for r in result}

        return {"nodes": node_counts, "relationships": rel_counts}


# ---------------------------------------------------------------------------
# populate_graph  — called by sql_agent after queries run
# ---------------------------------------------------------------------------

def populate_graph(investigation_results: dict) -> dict:
    target = investigation_results.get("target", "unknown")
    agent = GraphAgent()

    try:
        print(f"  Populating Neo4j graph for: {target}")
        agent.clear_investigation(target)
        print(f"    Cleared previous graph data for: {target}")

        for qr in investigation_results.get("query_results", []):
            name = qr.get("name", "").lower()
            rows = qr.get("rows", [])
            count = qr.get("count", 0)

            print(f"    [{name}] → {count} rows", end="")
            if rows:
                print(f"  |  keys: {list(rows[0].keys())}")
            else:
                print("  |  (no rows — check SQL or seed data)")
                continue

            if "transaction" in name:
                for row in rows:
                    agent.add_transaction(row, target)
                print(f"      ↳ added {len(rows)} transaction nodes")

            elif "sanction" in name:
                for row in rows:
                    agent.add_sanction(row, target)
                print(f"      ↳ added {len(rows)} sanction nodes")

            elif "email" in name:
                for row in rows:
                    agent.add_email_evidence(row, target)
                print(f"      ↳ added {len(rows)} email nodes")

            elif "slack" in name:
                for row in rows:
                    agent.add_slack_evidence(row, target)
                print(f"      ↳ added {len(rows)} slack nodes")

            elif "correlation" in name:
                # Correlation rows have both transaction + email fields;
                # route each row to both handlers
                for row in rows:
                    agent.add_transaction(row, target)
                    agent.add_email_evidence(row, target)
                print(f"      ↳ added {len(rows)} correlation rows")

        print("    Drawing corroboration edges...")
        agent.add_corroboration_edges(target)

        summary = agent.get_graph_summary(target)
        print(f"    Graph summary: {summary}")
        return summary

    finally:
        agent.close()


# ---------------------------------------------------------------------------
# Runner — prints plan so you can inspect the SQL before results
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    from planner import plan_investigation
    from sql_agent import execute_plan

    print("Planning...")
    plan = plan_investigation("Investigate Vendor Zenith LLC")

    print("\nGenerated query plan:")
    for q in plan["queries"]:
        print(f"  [{q['name']}] {q['purpose']}")
        print(f"    SQL: {q['sql']}\n")

    print("Executing queries...")
    results = execute_plan(plan)

    print("\nPopulating graph...")
    summary = populate_graph(results)

    print("\nGraph Summary:")
    print(json.dumps(summary, indent=2))
    print("\nOpen http://localhost:7474 to explore the graph")
    print("Cypher to view: MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 50")