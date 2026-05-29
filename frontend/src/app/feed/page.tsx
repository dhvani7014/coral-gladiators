"use client";

import { useState, useEffect, useRef } from "react";

interface Transaction {
    transaction_id: string;
    sender: string;
    receiver: string;
    amount: number;
    timestamp: string;
    location: string;
    risk_score: number;
    flags: string[];
}

function riskBand(score: number) {
    if (score >= 70) return { row: "bg-red-500/5 border-l-2 border-red-500/60", badge: "bg-red-500/15 border-red-500/40 text-red-400", dot: "bg-red-500 shadow-[0_0_6px_#ef4444]" };
    if (score >= 40) return { row: "bg-amber-400/5 border-l-2 border-amber-400/40", badge: "bg-amber-400/15 border-amber-400/40 text-amber-400", dot: "bg-amber-400 shadow-[0_0_6px_#f59e0b]" };
    return { row: "bg-transparent border-l-2 border-transparent", badge: "bg-slate-700/50 border-slate-600 text-slate-400", dot: "bg-slate-500" };
}

function fmt(amount: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function timeAgo(ts: string) {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function FeedPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastUpdated, setLastUpdated] = useState("");
    const [newIds, setNewIds] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<"ALL" | "CRITICAL" | "HIGH">("ALL");
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const knownIds = useRef<Set<string>>(new Set());

    async function fetchFeed() {
        try {
            const res = await fetch("http://localhost:8000/transactions/flagged");
            const data = await res.json();
            const txns: Transaction[] = data.transactions || [];

            // Detect new rows for flash animation
            const incoming = new Set(txns.map(t => t.transaction_id));
            const fresh = txns.filter(t => !knownIds.current.has(t.transaction_id));
            if (fresh.length > 0) {
                const freshIds = new Set(fresh.map(t => t.transaction_id));
                setNewIds(freshIds);
                setTimeout(() => setNewIds(new Set()), 1500);
            }
            knownIds.current = incoming;

            setTransactions(txns);
            setLastUpdated(new Date().toLocaleTimeString());
        } catch (e) {
            console.error("Feed fetch failed:", e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchFeed();
    }, []);

    useEffect(() => {
        if (autoRefresh) {
            intervalRef.current = setInterval(fetchFeed, 5000);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [autoRefresh]);

    const filtered = transactions.filter(t => {
        if (filter === "CRITICAL") return t.risk_score >= 70;
        if (filter === "HIGH") return t.risk_score >= 40 && t.risk_score < 70;
        return true;
    });

    const criticalCount = transactions.filter(t => t.risk_score >= 70).length;
    const highCount = transactions.filter(t => t.risk_score >= 40 && t.risk_score < 70).length;
    const totalValue = transactions.reduce((s, t) => s + t.amount, 0);

    return (
        <div className="min-h-screen bg-[#020817] text-slate-200 font-mono">

            {/* header */}
            <div className="border-b border-slate-800 bg-slate-950 px-10 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse" : "bg-slate-600"}`} />
                    <span className="text-xs tracking-[4px] text-slate-400">SENTINEL</span>
                    <span className="text-slate-700">|</span>
                    <span className="text-xs tracking-[3px] text-slate-500">LIVE FRAUD FEED</span>
                </div>
                <div className="flex items-center gap-6">
                    {lastUpdated && (
                        <span className="text-[10px] tracking-wider text-slate-600">
                            UPDATED {lastUpdated}
                        </span>
                    )}
                    <button
                        onClick={() => setAutoRefresh(r => !r)}
                        className={`px-4 py-1.5 rounded text-[10px] font-bold tracking-widest border transition-all ${autoRefresh
                                ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                                : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
                            }`}
                    >
                        {autoRefresh ? "⏸ PAUSE" : "▶ RESUME"}
                    </button>
                    <button
                        onClick={fetchFeed}
                        className="px-4 py-1.5 rounded text-[10px] font-bold tracking-widest border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all"
                    >
                        ↻ REFRESH
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-10 py-8">

                {/* stat bar */}
                <div className="grid grid-cols-4 gap-4 mb-8">
                    {[
                        { label: "TOTAL FLAGGED", value: transactions.length, color: "text-slate-300" },
                        { label: "CRITICAL (≥70)", value: criticalCount, color: "text-red-400" },
                        { label: "HIGH (40–69)", value: highCount, color: "text-amber-400" },
                        { label: "TOTAL EXPOSURE", value: `$${(totalValue / 1000).toFixed(0)}k`, color: "text-violet-400" },
                    ].map(s => (
                        <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-lg px-5 py-4">
                            <div className="text-[9px] tracking-[3px] text-slate-600 mb-1">{s.label}</div>
                            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* filter tabs */}
                <div className="flex gap-2 mb-5">
                    {(["ALL", "CRITICAL", "HIGH"] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-1.5 rounded text-[10px] font-bold tracking-widest border transition-all ${filter === f
                                    ? f === "CRITICAL"
                                        ? "bg-red-500/15 border-red-500/40 text-red-400"
                                        : f === "HIGH"
                                            ? "bg-amber-400/15 border-amber-400/40 text-amber-400"
                                            : "bg-slate-700 border-slate-600 text-slate-200"
                                    : "bg-transparent border-slate-800 text-slate-600 hover:text-slate-400"
                                }`}
                        >
                            {f} {f === "ALL" ? `(${transactions.length})` : f === "CRITICAL" ? `(${criticalCount})` : `(${highCount})`}
                        </button>
                    ))}
                </div>

                {/* table */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">

                    {/* table header */}
                    <div className="grid grid-cols-[2fr_2fr_2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-slate-800 bg-slate-900/50">
                        {["VENDOR / RECEIVER", "SENDER", "AMOUNT", "RISK", "LOCATION", "TIME", "FLAGS"].map(h => (
                            <span key={h} className="text-[9px] tracking-[3px] text-slate-600">{h}</span>
                        ))}
                    </div>

                    {loading && (
                        <div className="text-center py-16 text-slate-700 text-xs tracking-widest">
                            LOADING FEED...
                        </div>
                    )}

                    {!loading && filtered.length === 0 && (
                        <div className="text-center py-16 text-slate-700 text-xs tracking-widest">
                            NO TRANSACTIONS MATCH CURRENT FILTER
                        </div>
                    )}

                    <div className="divide-y divide-slate-900/60">
                        {filtered.map(tx => {
                            const rb = riskBand(tx.risk_score);
                            const isNew = newIds.has(tx.transaction_id);
                            const isCrit = tx.risk_score >= 70;

                            return (
                                <div
                                    key={tx.transaction_id}
                                    className={`grid grid-cols-[2fr_2fr_2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3.5 items-center transition-all duration-700 ${rb.row} ${isNew ? "bg-blue-500/10" : ""}`}
                                >
                                    {/* receiver */}
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${rb.dot}`} />
                                        <span className={`text-xs font-bold truncate ${isCrit ? "text-red-300" : "text-slate-300"}`}>
                                            {tx.receiver}
                                        </span>
                                    </div>

                                    {/* sender */}
                                    <span className="text-xs text-slate-500 truncate">{tx.sender}</span>

                                    {/* amount */}
                                    <span className={`text-xs font-bold ${isCrit ? "text-red-400" : "text-amber-400"}`}>
                                        {fmt(tx.amount)}
                                    </span>

                                    {/* risk score */}
                                    <div className="flex items-center gap-2">
                                        <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${isCrit ? "bg-red-500" : "bg-amber-400"}`}
                                                style={{ width: `${tx.risk_score}%` }}
                                            />
                                        </div>
                                        <span className={`text-xs font-bold ${isCrit ? "text-red-400" : "text-amber-400"}`}>
                                            {tx.risk_score}
                                        </span>
                                    </div>

                                    {/* location */}
                                    <span className="text-xs text-slate-600 truncate">{tx.location || "—"}</span>

                                    {/* time */}
                                    <span className="text-xs text-slate-600">{timeAgo(tx.timestamp)}</span>

                                    {/* flags */}
                                    <div className="flex gap-1 flex-wrap justify-end">
                                        {(tx.flags || []).slice(0, 2).map(flag => (
                                            <span key={flag} className={`px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wide border ${rb.badge}`}>
                                                {flag}
                                            </span>
                                        ))}
                                        {(tx.flags || []).length > 2 && (
                                            <span className="px-1.5 py-0.5 rounded text-[8px] text-slate-600 border border-slate-800">
                                                +{tx.flags.length - 2}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* footer */}
                <div className="border-t border-slate-800 mt-8 pt-5 flex justify-between items-center">
                    <span className="text-[10px] tracking-widest text-slate-700">
                        SENTINEL AI — LIVE FRAUD MONITORING
                    </span>
                    <div className="flex gap-5">
                        {[["→ REPORT", "/report"], ["→ GRAPH", "/graph"], ["→ TRACES", "/trace"]].map(([label, href]) => (
                            <a key={href} href={href} className="text-[10px] tracking-widest text-slate-600 hover:text-slate-400 transition-colors no-underline">
                                {label}
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}