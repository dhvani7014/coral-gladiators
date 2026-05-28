from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "sentinel123")

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))


def _run(cypher, params=None):
    with driver.session() as session:
        result = session.run(cypher, params or {})
        return [dict(r) for r in result]


def find_co_senders(target: str):
    """Who else sent money to the same target?"""
    rows = _run("""
        MATCH (other:Entity)-[:INITIATED]->(t:Transaction)-[:SENT_TO]->(v:Entity {name: $target})
        WHERE other.name <> $target
        RETURN DISTINCT other.name AS entity, count(t) AS tx_count, sum(t.amount) AS total_amount
        ORDER BY tx_count DESC
    """, {"target": target})
    return rows


def find_hop_paths(target: str, max_hops: int = 3):
    """Is there a path from any employee to a sanctioned entity within N hops?"""
    rows = _run("""
        MATCH path = (e:Entity)-[*1..%d]-(v:Entity)
        WHERE v.name = $target AND e.name <> $target
        RETURN DISTINCT e.name AS connected_entity,
               length(path) AS hops,
               [n IN nodes(path) | coalesce(n.name, n.transaction_id, '')] AS path_nodes
        ORDER BY hops ASC
        LIMIT 20
    """ % max_hops, {"target": target})
    return rows


def find_shared_receivers(target: str):
    """Find entities that received money from the same senders as the target."""
    rows = _run("""
        MATCH (sender:Entity)-[:INITIATED]->(t1:Transaction)-[:SENT_TO]->(v:Entity {name: $target})
        MATCH (sender)-[:INITIATED]->(t2:Transaction)-[:SENT_TO]->(other:Entity)
        WHERE other.name <> $target
        RETURN DISTINCT other.name AS shared_receiver,
               sender.name AS common_sender,
               count(t2) AS tx_count
        ORDER BY tx_count DESC
        LIMIT 10
    """, {"target": target})
    return rows


def find_sanctioned_neighbors(target: str):
    """Any entity within 2 hops that is listed in a sanction list?"""
    rows = _run("""
        MATCH (v:Entity {name: $target})-[*1..2]-(neighbor:Entity)-[:LISTED_IN]->(s:SanctionList)
        WHERE neighbor.name <> $target
        RETURN DISTINCT neighbor.name AS sanctioned_entity,
               s.source AS sanction_source,
               s.sanction_type AS sanction_type
        LIMIT 10
    """, {"target": target})
    return rows


def find_high_risk_cluster(target: str):
    """Return all transactions involving this target with risk score > 80."""
    rows = _run("""
        MATCH (e:Entity)-[:INITIATED]->(t:Transaction)-[:SENT_TO]->(v:Entity {name: $target})
        WHERE t.risk_score > 80
        RETURN e.name AS sender,
               t.transaction_id AS tx_id,
               t.amount AS amount,
               t.risk_score AS risk_score,
               t.location AS location
        ORDER BY t.risk_score DESC
    """, {"target": target})
    return rows


def run_graph_intelligence(target: str) -> dict:
    """Run all graph intelligence queries and return structured findings."""
    co_senders = find_co_senders(target)
    hop_paths = find_hop_paths(target)
    shared_receivers = find_shared_receivers(target)
    sanctioned_neighbors = find_sanctioned_neighbors(target)
    high_risk_cluster = find_high_risk_cluster(target)

    # Build a summary of findings
    findings = []

    if co_senders:
        findings.append(f"{len(co_senders)} entity/entities also sent funds to {target}")

    if sanctioned_neighbors:
        names = [r["sanctioned_entity"] for r in sanctioned_neighbors]
        findings.append(f"Sanctioned neighbors within 2 hops: {', '.join(names)}")

    if high_risk_cluster:
        avg_risk = sum(r["risk_score"] for r in high_risk_cluster) / len(high_risk_cluster)
        findings.append(f"{len(high_risk_cluster)} high-risk transactions (avg score {avg_risk:.1f})")

    if shared_receivers:
        findings.append(f"{len(shared_receivers)} shared receiver(s) found via common senders")

    min_hops = min((r["hops"] for r in hop_paths), default=None)
    if min_hops is not None:
        findings.append(f"Shortest network path to {target}: {min_hops} hop(s)")

    return {
        "target": target,
        "co_senders": co_senders,
        "hop_paths": hop_paths,
        "shared_receivers": shared_receivers,
        "sanctioned_neighbors": sanctioned_neighbors,
        "high_risk_cluster": high_risk_cluster,
        "findings": findings,
        "network_size": len(hop_paths),
    }