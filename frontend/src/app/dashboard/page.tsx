"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
    transactions: {
        total: number;
        flagged: number;
        critical: number;
        high: number;
        total_exposure: number;
    };
    traces: {
        total_queries: number;
        avg_latency_ms: number;
        cache_hits: number;
    };
    top_vendors: {
        name: string;
        tx_count: number;
        max_risk: number;
        total_amount: number;
    }[];
    recent_flagged: {
        transaction_id: string;
        sender: string;
        receiver: string;
        amount: number;
        risk_score: number;
        flags: string[];
        timestamp: string;
    }[];
}

function fmt$(n: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(n);
}

function timeAgo(iso: string) {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function RiskBar({ score }: { score: number }) {
    const color = score >= 70 ? "#e63535" : score >= 40 ? "#f59e0b" : "#22c55e";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 3, background: "#1e293b", borderRadius: 2 }}>
                <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2 }} />
            </div>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color, minWidth: 28, textAlign: "right" }}>
                {score}
            </span>
        </div>
    );
}

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("http://localhost:8000/stats")
            .then((r) => r.json())
            .then((d) => { setStats(d); setLoading(false); })
            .catch((e) => { setError(e.message); setLoading(false); });
    }, []);

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap');
        :root { --mono: 'IBM Plex Mono', monospace; --sans: 'IBM Plex Sans', sans-serif; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .dash-root { background: #020817; min-height: 100%; padding: 32px; font-family: var(--sans); color: #e2e8f0; }

        .page-header { margin-bottom: 28px; display: flex; align-items: flex-end; justify-content: space-between; }
        .page-title { font-size: 22px; font-weight: 500; color: #f1f5f9; letter-spacing: -0.01em; }
        .page-sub { font-family: var(--mono); font-size: 11px; color: #334155; letter-spacing: 0.08em; margin-top: 4px; }
        .page-time { font-family: var(--mono); font-size: 10px; color: #1e293b; letter-spacing: 0.08em; }

        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #0f172a; border: 1px solid #0f172a; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
        .stat-card { background: #020817; padding: 22px 24px; position: relative; }
        .stat-card::after { content: ''; position: absolute; top: 20%; bottom: 20%; right: 0; width: 1px; background: #0f172a; }
        .stat-card:last-child::after { display: none; }
        .stat-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; color: #475569; margin-bottom: 10px; text-transform: uppercase; }
        .stat-value { font-size: 32px; font-weight: 500; line-height: 1; letter-spacing: -0.02em; }
        .stat-sub { font-family: var(--mono); font-size: 10px; color: #334155; margin-top: 8px; }
        .stat-accent { display: inline-block; width: 3px; height: 32px; border-radius: 2px; position: absolute; left: 0; top: 22px; }

        .section { margin-bottom: 24px; }
        .section-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; color: #334155; text-transform: uppercase; margin-bottom: 10px; }

        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .panel { background: #020817; border: 1px solid #0f172a; border-radius: 8px; overflow: hidden; }
        .panel-head { padding: 12px 18px; border-bottom: 1px solid #0a1628; font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: #334155; text-transform: uppercase; display: flex; justify-content: space-between; align-items: center; }

        .vendor-row { display: flex; align-items: center; gap: 16px; padding: 13px 18px; border-bottom: 1px solid #0a1628; transition: background 0.12s; }
        .vendor-row:last-child { border-bottom: none; }
        .vendor-row:hover { background: #0a1628; }
        .vendor-rank { font-family: var(--mono); font-size: 10px; color: #1e293b; width: 16px; flex-shrink: 0; }
        .vendor-info { flex: 1; min-width: 0; }
        .vendor-name { font-size: 13px; font-weight: 500; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vendor-meta { font-family: var(--mono); font-size: 10px; color: #334155; margin-top: 3px; }
        .vendor-bar { width: 100px; flex-shrink: 0; }

        .tx-row { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; padding: 12px 18px; border-bottom: 1px solid #0a1628; transition: background 0.12s; }
        .tx-row:last-child { border-bottom: none; }
        .tx-row:hover { background: #0a1628; }
        .tx-receiver { font-size: 13px; font-weight: 500; color: #f1f5f9; }
        .tx-sender { font-family: var(--mono); font-size: 10px; color: #334155; margin-top: 2px; }
        .tx-right { text-align: right; }
        .tx-amount { font-family: var(--mono); font-size: 12px; color: #94a3b8; }
        .tx-time { font-family: var(--mono); font-size: 10px; color: #334155; margin-top: 2px; }
        .tx-flags { margin-top: 4px; }

        .flag { display: inline-block; font-family: var(--mono); font-size: 9px; padding: 2px 5px; border-radius: 2px; letter-spacing: 0.06em; margin-right: 3px; }
        .flag-fraud    { color: #e63535; background: #e6353510; border: 1px solid #e6353525; }
        .flag-transfer { color: #f59e0b; background: #f59e0b10; border: 1px solid #f59e0b25; }
        .flag-high     { color: #a855f7; background: #a855f710; border: 1px solid #a855f725; }

        .system-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1px; background: #0a0a0a; border: 1px solid #0a0a0a; border-radius: 8px; overflow: hidden; }
        .sys-card { background: #020817; padding: 14px 16px; display: flex; align-items: center; gap: 8px; }
        .sys-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
        .sys-label { font-family: var(--mono); font-size: 10px; color: #334155; letter-spacing: 0.06em; }
        .sys-val { font-family: var(--mono); font-size: 10px; color: #1e293b; margin-top: 1px; }

        .shortcut-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
        .shortcut { display: flex; align-items: center; justify-content: space-between; padding: 11px 14px; background: #020817; border: 1px solid #0f172a; border-radius: 6px; text-decoration: none; transition: border-color 0.15s, background 0.15s; }
        .shortcut:hover { background: #0a1628; border-color: #1e293b; }
        .shortcut-label { font-family: var(--mono); font-size: 11px; color: #475569; letter-spacing: 0.06em; }
        .shortcut-arrow { font-family: var(--mono); font-size: 10px; color: #1e293b; }

        .empty { padding: 32px; text-align: center; font-family: var(--mono); font-size: 12px; color: #1e293b; }
        .pulse { animation: pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .critical-badge { font-family: var(--mono); font-size: 9px; color: #e63535; background: #e6353510; border: 1px solid #e6353525; border-radius: 2px; padding: 2px 6px; letter-spacing: 0.06em; }
      `}</style>

            <div className="dash-root">
                {/* Header */}
                <div className="page-header">
                    <div>
                        <div className="page-title">Dashboard</div>
                        <div className="page-sub">SENTINELAI · SYSTEM OVERVIEW</div>
                    </div>
                    <div className="page-time">{new Date().toLocaleString("en-US", { hour12: false })}</div>
                </div>

                {loading && (
                    <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#334155", padding: "80px 0", textAlign: "center" }}>
                        <span className="pulse">loading stats…</span>
                    </div>
                )}

                {error && (
                    <div style={{ background: "#e6353510", border: "1px solid #e6353525", borderRadius: 6, padding: "16px 20px", fontFamily: "var(--mono)", fontSize: 12, color: "#e63535" }}>
                        ✗ {error} — is the backend running on port 8000?
                    </div>
                )}

                {stats && (
                    <>
                        {/* Stat cards */}
                        <div className="stat-grid">
                            <div className="stat-card">
                                <div className="stat-accent" style={{ background: "#22d3ee" }} />
                                <div className="stat-label">Total transactions</div>
                                <div className="stat-value" style={{ color: "#f1f5f9" }}>
                                    {stats.transactions.total.toLocaleString()}
                                </div>
                                <div className="stat-sub">across all accounts</div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-accent" style={{ background: "#f59e0b" }} />
                                <div className="stat-label">Flagged</div>
                                <div className="stat-value" style={{ color: "#f59e0b" }}>
                                    {stats.transactions.flagged}
                                </div>
                                <div className="stat-sub">
                                    {stats.transactions.critical} critical · {stats.transactions.high} high
                                </div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-accent" style={{ background: "#e63535" }} />
                                <div className="stat-label">Total exposure</div>
                                <div className="stat-value" style={{ color: "#e63535", fontSize: 22 }}>
                                    {fmt$(stats.transactions.total_exposure)}
                                </div>
                                <div className="stat-sub">flagged transactions only</div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-accent" style={{ background: "#a855f7" }} />
                                <div className="stat-label">Queries run</div>
                                <div className="stat-value" style={{ color: "#a855f7" }}>
                                    {stats.traces.total_queries}
                                </div>
                                <div className="stat-sub">
                                    avg {stats.traces.avg_latency_ms}ms · {stats.traces.cache_hits} hits
                                </div>
                            </div>
                        </div>

                        {/* Two col */}
                        <div className="two-col section">
                            {/* Top vendors */}
                            <div>
                                <div className="section-title">Top risk vendors</div>
                                <div className="panel">
                                    <div className="panel-head">
                                        <span>by max risk score</span>
                                        <span>{stats.top_vendors.length} vendors</span>
                                    </div>
                                    {stats.top_vendors.length === 0 ? (
                                        <div className="empty">no flagged vendors</div>
                                    ) : (
                                        stats.top_vendors.map((v, i) => (
                                            <div key={v.name} className="vendor-row">
                                                <div className="vendor-rank">{String(i + 1).padStart(2, "0")}</div>
                                                <div className="vendor-info">
                                                    <div className="vendor-name" title={v.name}>
                                                        {v.name.length > 20 ? v.name.slice(0, 18) + "…" : v.name}
                                                    </div>
                                                    <div className="vendor-meta">{v.tx_count} tx · {fmt$(v.total_amount)}</div>
                                                </div>
                                                <div className="vendor-bar">
                                                    <RiskBar score={v.max_risk} />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Recent flagged */}
                            <div>
                                <div className="section-title">Recent flagged transactions</div>
                                <div className="panel">
                                    <div className="panel-head">
                                        <span>latest activity</span>
                                        <span className="critical-badge">LIVE</span>
                                    </div>
                                    {stats.recent_flagged.length === 0 ? (
                                        <div className="empty">no flagged transactions</div>
                                    ) : (
                                        stats.recent_flagged.map((tx) => (
                                            <div key={tx.transaction_id} className="tx-row">
                                                <div>
                                                    <div className="tx-receiver">{tx.receiver}</div>
                                                    <div className="tx-sender">{tx.sender}</div>
                                                    <div className="tx-flags">
                                                        {tx.flags.map((f) => (
                                                            <span
                                                                key={f}
                                                                className={`flag ${f === "FRAUD" ? "flag-fraud"
                                                                        : f === "HIGH_VALUE" ? "flag-high"
                                                                            : "flag-transfer"
                                                                    }`}
                                                            >
                                                                {f}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="tx-right">
                                                    <div className="tx-amount">{fmt$(tx.amount)}</div>
                                                    <div className="tx-time">{timeAgo(tx.timestamp)}</div>
                                                    <div style={{ marginTop: 4, width: 80 }}>
                                                        <RiskBar score={tx.risk_score} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* System status */}
                        <div className="section">
                            <div className="section-title">System status</div>
                            <div className="system-grid">
                                {[
                                    { label: "PostgreSQL", val: "port 5433" },
                                    { label: "Neo4j", val: "port 7687" },
                                    { label: "FastAPI", val: "port 8000" },
                                    { label: "Next.js", val: "port 3000" },
                                    { label: "Groq", val: "llama-3.3-70b" },
                                    { label: "Coral", val: "federated" },
                                ].map((s) => (
                                    <div key={s.label} className="sys-card">
                                        <span className="sys-dot" />
                                        <div>
                                            <div className="sys-label">{s.label}</div>
                                            <div className="sys-val">{s.val}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick nav */}
                        <div className="section">
                            <div className="section-title">Quick access</div>
                            <div className="shortcut-grid">
                                {[
                                    { href: "/feed", label: "Live Feed" },
                                    { href: "/investigate", label: "Investigate" },
                                    { href: "/report", label: "Report" },
                                    { href: "/graph", label: "Graph" },
                                    { href: "/trace", label: "SQL Trace" },
                                ].map((s) => (
                                    <Link key={s.href} href={s.href} className="shortcut">
                                        <span className="shortcut-label">{s.label}</span>
                                        <span className="shortcut-arrow">→</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}