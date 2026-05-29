"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Trace {
    id: number;
    query_text: string;
    sources_hit: string[] | string | null;
    execution_ms: number | null;
    cache_hit: boolean | null;
    created_at: string | null;
}

interface TracesResponse {
    traces: Trace[];
    total: number;
    limit: number;
    offset: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSources(raw: string[] | string | null): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
        return [String(raw)];
    }
}

function formatTime(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

function formatDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const SOURCE_COLORS: Record<string, string> = {
    transactions: "#f59e0b",
    sanctions: "#ef4444",
    emails: "#3b82f6",
    slack_logs: "#8b5cf6",
    coral_traces: "#6b7280",
};

function sourceColor(s: string): string {
    return SOURCE_COLORS[s.toLowerCase()] ?? "#22d3ee";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
    const color = sourceColor(source);
    return (
        <span
            style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: "3px",
                fontSize: "10px",
                fontFamily: "'DM Mono', 'Fira Code', monospace",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: color,
                border: `1px solid ${color}40`,
                background: `${color}12`,
                marginRight: "4px",
                marginBottom: "2px",
            }}
        >
            {source}
        </span>
    );
}

function SqlBlock({ sql }: { sql: string }) {
    const [expanded, setExpanded] = useState(false);
    const preview = sql.length > 120 ? sql.slice(0, 120) + "…" : sql;

    // Minimal SQL keyword highlighting
    const highlight = (text: string) => {
        const keywords = /\b(SELECT|FROM|WHERE|JOIN|LEFT|INNER|ON|AND|OR|NOT|IN|LIKE|LIMIT|OFFSET|ORDER BY|GROUP BY|HAVING|INSERT|UPDATE|DELETE|WITH|AS|DISTINCT|COUNT|SUM|AVG|MAX|MIN|CASE|WHEN|THEN|ELSE|END|NULL|IS|BETWEEN|EXISTS)\b/gi;
        const parts = text.split(keywords);
        return parts.map((part, i) =>
            keywords.test(part) ? (
                <span key={i} style={{ color: "#22d3ee", fontWeight: 700 }}>
                    {part}
                </span>
            ) : (
                <span key={i} style={{ color: "#94a3b8" }}>
                    {part}
                </span>
            )
        );
    };

    return (
        <div style={{ position: "relative" }}>
            <pre
                style={{
                    margin: 0,
                    fontFamily: "'DM Mono', 'Fira Code', 'Cascadia Code', monospace",
                    fontSize: "12px",
                    lineHeight: "1.6",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "#94a3b8",
                    background: "transparent",
                }}
            >
                {highlight(expanded ? sql : preview)}
            </pre>
            {sql.length > 120 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    style={{
                        marginTop: "4px",
                        background: "none",
                        border: "none",
                        color: "#22d3ee",
                        fontSize: "11px",
                        fontFamily: "'DM Mono', monospace",
                        cursor: "pointer",
                        padding: 0,
                        opacity: 0.8,
                    }}
                >
                    {expanded ? "▲ collapse" : "▼ expand"}
                </button>
            )}
        </div>
    );
}

function StatCard({
    label,
    value,
    accent,
}: {
    label: string;
    value: string | number;
    accent: string;
}) {
    return (
        <div
            style={{
                background: "#0f172a",
                border: `1px solid ${accent}30`,
                borderLeft: `3px solid ${accent}`,
                borderRadius: "6px",
                padding: "14px 18px",
                minWidth: "140px",
            }}
        >
            <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>
                {label}
            </div>
            <div style={{ fontSize: "24px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: accent }}>
                {value}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TracePage() {
    const [traces, setTraces] = useState<Trace[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [filterSource, setFilterSource] = useState<string>("all");
    const [filterCache, setFilterCache] = useState<string>("all");
    const [clearing, setClearing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const LIMIT = 20;

    const fetchTraces = useCallback(async () => {
        try {
            setError(null);
            const res = await fetch(`http://localhost:8000/traces?limit=${LIMIT}&offset=${offset}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: TracesResponse = await res.json();
            setTraces(data.traces);
            setTotal(data.total);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to fetch traces");
        } finally {
            setLoading(false);
        }
    }, [offset]);

    useEffect(() => {
        fetchTraces();
    }, [fetchTraces]);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(fetchTraces, 3000);
        return () => clearInterval(id);
    }, [autoRefresh, fetchTraces]);

    const clearTraces = async () => {
        if (!confirm("Delete all trace logs?")) return;
        setClearing(true);
        try {
            await fetch("http://localhost:8000/traces", { method: "DELETE" });
            setTraces([]);
            setTotal(0);
            setOffset(0);
        } finally {
            setClearing(false);
        }
    };

    // Filtered view (client-side on current page)
    const filtered = traces.filter((t) => {
        const sources = parseSources(t.sources_hit);
        const sourceMatch =
            filterSource === "all" || sources.some((s) => s.toLowerCase() === filterSource);
        const cacheMatch =
            filterCache === "all" ||
            (filterCache === "hit" && t.cache_hit === true) ||
            (filterCache === "miss" && t.cache_hit === false);
        return sourceMatch && cacheMatch;
    });

    // Stats
    const avgMs =
        traces.length > 0
            ? Math.round(traces.reduce((a, t) => a + (t.execution_ms ?? 0), 0) / traces.length)
            : 0;
    const cacheHits = traces.filter((t) => t.cache_hit === true).length;
    const multiSource = traces.filter((t) => parseSources(t.sources_hit).length > 1).length;
    const allSources = Array.from(
        new Set(traces.flatMap((t) => parseSources(t.sources_hit).map((s) => s.toLowerCase())))
    ).sort();

    const totalPages = Math.ceil(total / LIMIT);
    const currentPage = Math.floor(offset / LIMIT) + 1;

    return (
        <>
            {/* Google Fonts */}
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Space+Grotesk:wght@400;600;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #020817;
          color: #e2e8f0;
          font-family: 'Space Grotesk', sans-serif;
        }

        .trace-row {
          border-bottom: 1px solid #1e293b;
          transition: background 0.15s;
        }
        .trace-row:hover {
          background: #0f172a !important;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 5px;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s;
          border: 1px solid transparent;
        }
        .btn:hover { opacity: 0.85; }
        .btn-primary {
          background: #22d3ee18;
          border-color: #22d3ee50;
          color: #22d3ee;
        }
        .btn-danger {
          background: #ef444418;
          border-color: #ef444450;
          color: #ef4444;
        }
        .btn-ghost {
          background: transparent;
          border-color: #334155;
          color: #64748b;
        }
        .btn-ghost.active {
          border-color: #22d3ee60;
          color: #22d3ee;
          background: #22d3ee10;
        }

        select {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 5px;
          color: #94a3b8;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          padding: 6px 10px;
          cursor: pointer;
          outline: none;
        }
        select:focus { border-color: #22d3ee50; }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }

        .pulse-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #22d3ee;
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }

        .fade-in {
          animation: fadeIn 0.3s ease forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

            <div style={{ background: "#020817", padding: "0 0 60px 0" }}>

                {/* ── Header ── */}
                <div style={{
                    borderBottom: "1px solid #1e293b",
                    background: "#020817",
                    position: "sticky",
                    top: 0,
                    zIndex: 50,
                    padding: "0 32px",
                }}>
                    <div style={{ maxWidth: "1400px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#22d3ee", letterSpacing: "0.15em" }}>SENTINEL</span>
                            <span style={{ color: "#1e293b" }}>›</span>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#64748b", letterSpacing: "0.1em" }}>SQL TRACE</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <button
                                className={`btn btn-ghost ${autoRefresh ? "active" : ""}`}
                                onClick={() => setAutoRefresh(!autoRefresh)}
                            >
                                {autoRefresh && <span className="pulse-dot" />}
                                {autoRefresh ? "live" : "auto-refresh"}
                            </button>
                            <button className="btn btn-primary" onClick={fetchTraces}>
                                ↺ refresh
                            </button>
                            <button className="btn btn-danger" onClick={clearTraces} disabled={clearing}>
                                {clearing ? "clearing…" : "clear log"}
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "32px 32px 0" }}>

                    {/* ── Page title ── */}
                    <div style={{ marginBottom: "28px" }}>
                        <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.02em", color: "#f1f5f9" }}>
                            Query Execution Log
                        </h1>
                        <p style={{ marginTop: "6px", fontSize: "14px", color: "#64748b", fontFamily: "'DM Mono', monospace" }}>
                            Every Coral federated query — sources, timing, cache status
                        </p>
                    </div>

                    {/* ── Stat cards ── */}
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "28px" }}>
                        <StatCard label="total queries" value={total} accent="#22d3ee" />
                        <StatCard label="avg latency" value={`${avgMs}ms`} accent="#f59e0b" />
                        <StatCard label="cache hits" value={cacheHits} accent="#22c55e" />
                        <StatCard label="multi-source" value={multiSource} accent="#a855f7" />
                    </div>

                    {/* ── Filters ── */}
                    <div style={{ display: "flex", gap: "10px", marginBottom: "20px", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#475569", marginRight: "4px" }}>FILTER:</span>
                        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
                            <option value="all">all sources</option>
                            {allSources.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                        <select value={filterCache} onChange={(e) => setFilterCache(e.target.value)}>
                            <option value="all">cache: all</option>
                            <option value="hit">cache: hit</option>
                            <option value="miss">cache: miss</option>
                        </select>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#475569", marginLeft: "auto" }}>
                            {filtered.length} of {traces.length} shown
                        </span>
                    </div>

                    {/* ── Table ── */}
                    {loading ? (
                        <div style={{ textAlign: "center", padding: "80px 0", color: "#475569", fontFamily: "'DM Mono', monospace", fontSize: "13px" }}>
                            <div style={{ marginBottom: "16px" }}>
                                <span className="pulse-dot" style={{ display: "inline-block" }} />
                            </div>
                            loading traces…
                        </div>
                    ) : error ? (
                        <div style={{
                            background: "#ef444412",
                            border: "1px solid #ef444430",
                            borderRadius: "8px",
                            padding: "24px",
                            color: "#ef4444",
                            fontFamily: "'DM Mono', monospace",
                            fontSize: "13px",
                        }}>
                            ✗ {error}
                            <div style={{ marginTop: "8px", color: "#94a3b8", fontSize: "12px" }}>
                                Is the backend running on port 8000?
                            </div>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{
                            textAlign: "center",
                            padding: "80px 0",
                            color: "#475569",
                            fontFamily: "'DM Mono', monospace",
                            fontSize: "13px",
                            border: "1px dashed #1e293b",
                            borderRadius: "8px",
                        }}>
                            no traces found
                            {total === 0 && (
                                <div style={{ marginTop: "10px", fontSize: "12px", color: "#334155" }}>
                                    run an investigation to populate the log
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{
                            border: "1px solid #1e293b",
                            borderRadius: "8px",
                            overflow: "hidden",
                        }}>
                            {/* Table header */}
                            <div style={{
                                display: "grid",
                                gridTemplateColumns: "56px 1fr 220px 90px 80px 100px",
                                background: "#0a1628",
                                borderBottom: "1px solid #1e293b",
                                padding: "10px 16px",
                            }}>
                                {["#", "SQL QUERY", "SOURCES HIT", "EXEC MS", "CACHE", "TIME"].map((h) => (
                                    <div key={h} style={{
                                        fontFamily: "'DM Mono', monospace",
                                        fontSize: "10px",
                                        letterSpacing: "0.12em",
                                        color: "#475569",
                                        fontWeight: 600,
                                    }}>
                                        {h}
                                    </div>
                                ))}
                            </div>

                            {/* Rows */}
                            {filtered.map((trace, idx) => {
                                const sources = parseSources(trace.sources_hit);
                                const isMulti = sources.length > 1;
                                return (
                                    <div
                                        key={trace.id}
                                        className="trace-row fade-in"
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "56px 1fr 220px 90px 80px 100px",
                                            padding: "14px 16px",
                                            background: idx % 2 === 0 ? "#020817" : "#050d1a",
                                            alignItems: "start",
                                            gap: "8px",
                                        }}
                                    >
                                        {/* # */}
                                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#334155", paddingTop: "1px" }}>
                                            {offset + idx + 1}
                                        </div>

                                        {/* SQL */}
                                        <div>
                                            {isMulti && (
                                                <div style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: "5px",
                                                    background: "#a855f718",
                                                    border: "1px solid #a855f730",
                                                    borderRadius: "3px",
                                                    padding: "2px 8px",
                                                    marginBottom: "8px",
                                                    fontSize: "10px",
                                                    fontFamily: "'DM Mono', monospace",
                                                    color: "#a855f7",
                                                    letterSpacing: "0.08em",
                                                }}>
                                                    ⬡ FEDERATED · {sources.length} SOURCES
                                                </div>
                                            )}
                                            <SqlBlock sql={trace.query_text ?? "—"} />
                                        </div>

                                        {/* Sources */}
                                        <div style={{ display: "flex", flexWrap: "wrap", alignContent: "flex-start", gap: "4px" }}>
                                            {sources.length > 0
                                                ? sources.map((s) => <SourceBadge key={s} source={s} />)
                                                : <span style={{ color: "#334155", fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>—</span>
                                            }
                                        </div>

                                        {/* Exec ms */}
                                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px", paddingTop: "1px" }}>
                                            {trace.execution_ms != null ? (
                                                <span style={{
                                                    color: trace.execution_ms > 1000 ? "#ef4444" : trace.execution_ms > 300 ? "#f59e0b" : "#22c55e"
                                                }}>
                                                    {trace.execution_ms}
                                                    <span style={{ fontSize: "10px", color: "#475569", marginLeft: "2px" }}>ms</span>
                                                </span>
                                            ) : "—"}
                                        </div>

                                        {/* Cache */}
                                        <div style={{ paddingTop: "2px" }}>
                                            {trace.cache_hit === true ? (
                                                <span style={{
                                                    fontFamily: "'DM Mono', monospace",
                                                    fontSize: "10px",
                                                    color: "#22c55e",
                                                    background: "#22c55e15",
                                                    border: "1px solid #22c55e30",
                                                    borderRadius: "3px",
                                                    padding: "2px 8px",
                                                    letterSpacing: "0.08em",
                                                }}>HIT</span>
                                            ) : trace.cache_hit === false ? (
                                                <span style={{
                                                    fontFamily: "'DM Mono', monospace",
                                                    fontSize: "10px",
                                                    color: "#f59e0b",
                                                    background: "#f59e0b15",
                                                    border: "1px solid #f59e0b30",
                                                    borderRadius: "3px",
                                                    padding: "2px 8px",
                                                    letterSpacing: "0.08em",
                                                }}>MISS</span>
                                            ) : (
                                                <span style={{ color: "#334155", fontFamily: "'DM Mono', monospace", fontSize: "11px" }}>—</span>
                                            )}
                                        </div>

                                        {/* Time */}
                                        <div>
                                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#64748b" }}>
                                                {formatTime(trace.created_at)}
                                            </div>
                                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#334155", marginTop: "2px" }}>
                                                {formatDate(trace.created_at)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Pagination ── */}
                    {totalPages > 1 && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginTop: "24px" }}>
                            <button
                                className="btn btn-ghost"
                                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                                disabled={offset === 0}
                            >
                                ← prev
                            </button>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#475569" }}>
                                page {currentPage} / {totalPages}
                            </span>
                            <button
                                className="btn btn-ghost"
                                onClick={() => setOffset(offset + LIMIT)}
                                disabled={offset + LIMIT >= total}
                            >
                                next →
                            </button>
                        </div>
                    )}

                    {/* ── Legend ── */}
                    <div style={{
                        marginTop: "40px",
                        padding: "16px 20px",
                        background: "#0a1628",
                        border: "1px solid #1e293b",
                        borderRadius: "8px",
                        display: "flex",
                        gap: "24px",
                        flexWrap: "wrap",
                        alignItems: "center",
                    }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#475569", letterSpacing: "0.1em" }}>SOURCE LEGEND:</span>
                        {Object.entries(SOURCE_COLORS).map(([src, color]) => (
                            <span key={src} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: color, display: "inline-block" }} />
                                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#64748b" }}>{src}</span>
                            </span>
                        ))}
                        <span style={{ marginLeft: "auto", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "#334155" }}>
                            ⬡ FEDERATED = query spans multiple sources
                        </span>
                    </div>

                </div>
            </div>
        </>
    );
}