"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

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
    if (score >= 70) return {
        row: "border-l-2 border-[#D97B4F] bg-[#D97B4F]/[0.03]",
        badge: "bg-[#F5EAE0] text-[#C06030] border border-[#E8CDB8]",
        bar: "bg-[#D97B4F]",
        text: "text-[#C06030]",
        dot: "bg-[#D97B4F]",
    };
    if (score >= 40) return {
        row: "border-l-2 border-[#A87820] bg-[#A87820]/[0.03]",
        badge: "bg-[#F5EDD8] text-[#A87820] border border-[#E8D5A0]",
        bar: "bg-[#A87820]",
        text: "text-[#A87820]",
        dot: "bg-[#C4B8AC]",
    };
    return {
        row: "border-l-2 border-transparent",
        badge: "bg-[#EDE7DF] text-[#9B8E82] border border-[#D8CEBF]",
        bar: "bg-[#C4B8AC]",
        text: "text-[#9B8E82]",
        dot: "bg-[#D8CEBF]",
    };
}

function fmt(amount: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(amount);
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
            const fresh = txns.filter((t) => !knownIds.current.has(t.transaction_id));
            if (fresh.length > 0) {
                const freshIds = new Set(fresh.map((t) => t.transaction_id));
                setNewIds(freshIds);
                setTimeout(() => setNewIds(new Set()), 1500);
            }
            knownIds.current = new Set(txns.map((t) => t.transaction_id));
            setTransactions(txns);
            setLastUpdated(new Date().toLocaleTimeString());
        } catch (e) {
            console.error("Feed fetch failed:", e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { fetchFeed(); }, []);

    useEffect(() => {
        if (autoRefresh) {
            intervalRef.current = setInterval(fetchFeed, 5000);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [autoRefresh]);

    const filtered = transactions.filter((t) => {
        if (filter === "CRITICAL") return t.risk_score >= 70;
        if (filter === "HIGH") return t.risk_score >= 40 && t.risk_score < 70;
        return true;
    });

    const criticalCount = transactions.filter((t) => t.risk_score >= 70).length;
    const highCount = transactions.filter((t) => t.risk_score >= 40 && t.risk_score < 70).length;
    const totalValue = transactions.reduce((s, t) => s + t.amount, 0);

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Outfit:wght@300;400;500;600&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-outfit  { font-family: 'Outfit', sans-serif; }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes flash-new { 0% { background-color: #D97B4F18; } 100% { background-color: transparent; } }
        .flash-new { animation: flash-new 1.5s ease-out forwards; }
      `}</style>

            <div className="font-outfit bg-[#F7F3EE] min-h-screen text-[#1A1612]">

                {/* Top bar */}
                <div className="bg-[#1A1612] flex items-center justify-between px-12 h-[52px]">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="font-outfit font-semibold text-sm tracking-widest text-[#F7F3EE] uppercase no-underline">
                            Sentinel
                        </Link>
                        <div className="w-px h-4 bg-[#3A3430]" />
                        <span className="text-[11px] text-[#6B5E52] tracking-wide">Live Fraud Feed</span>
                    </div>
                    <div className="flex items-center gap-4">
                        {lastUpdated && (
                            <span className="text-[10px] text-[#3A3430] tracking-widest uppercase">
                                Updated {lastUpdated}
                            </span>
                        )}
                        <button
                            onClick={fetchFeed}
                            className="text-[11px] text-[#6B5E52] hover:text-[#F7F3EE] tracking-wide transition-colors bg-transparent border-none cursor-pointer"
                        >
                            ↻ Refresh
                        </button>
                        <button
                            onClick={() => setAutoRefresh((r) => !r)}
                            className={`flex items-center gap-2 border rounded-full px-3 py-[5px] text-[11px] font-medium tracking-wide transition-colors cursor-pointer bg-transparent ${autoRefresh
                                ? "border-[#D97B4F]/40 text-[#D97B4F]"
                                : "border-[#3A3430] text-[#3A3430] hover:text-[#6B5E52]"
                                }`}
                        >
                            {autoRefresh && <div className="w-1.5 h-1.5 rounded-full bg-[#D97B4F] animate-pulse-dot" />}
                            {autoRefresh ? "Live" : "Paused"}
                        </button>
                    </div>
                </div>

                {/* Page header */}
                <div className="px-12 pt-12 pb-10 border-b border-[#E0D8CF]">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-6 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                        <span className="text-[11px] font-medium tracking-[0.18em] text-[#D97B4F] uppercase">
                            Real-time monitoring
                        </span>
                    </div>
                    <div className="flex items-end justify-between gap-8">
                        <h1 className="font-playfair text-[52px] font-black leading-[0.92] tracking-tight text-[#1A1612]">
                            Live <em className="italic text-[#8B5E3C]">Feed.</em>
                        </h1>
                        {/* Stat pills */}
                        <div className="flex items-center gap-3 pb-1">
                            <div className="flex items-baseline gap-2 bg-[#EDE7DF] border border-[#D8CEBF] rounded-md px-4 py-2.5">
                                <span className="font-playfair text-[20px] font-bold text-[#1A1612]">{transactions.length}</span>
                                <span className="text-[11px] text-[#9B8E82] tracking-wide">Flagged</span>
                            </div>
                            <div className="flex items-baseline gap-2 bg-[#F5EAE0] border border-[#E8CDB8] rounded-md px-4 py-2.5">
                                <span className="font-playfair text-[20px] font-bold text-[#C06030]">{criticalCount}</span>
                                <span className="text-[11px] text-[#C06030]/70 tracking-wide">Critical</span>
                            </div>
                            <div className="flex items-baseline gap-2 bg-[#F5EDD8] border border-[#E8D5A0] rounded-md px-4 py-2.5">
                                <span className="font-playfair text-[20px] font-bold text-[#A87820]">{highCount}</span>
                                <span className="text-[11px] text-[#A87820]/70 tracking-wide">High</span>
                            </div>
                            <div className="flex items-baseline gap-2 bg-[#EDE7DF] border border-[#D8CEBF] rounded-md px-4 py-2.5">
                                <span className="font-playfair text-[20px] font-bold text-[#1A1612]">
                                    ${(totalValue / 1000).toFixed(0)}k
                                </span>
                                <span className="text-[11px] text-[#9B8E82] tracking-wide">Exposure</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-12 py-8">

                    {/* Filter tabs */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex gap-px border border-[#E0D8CF] rounded-md overflow-hidden">
                            {(["ALL", "CRITICAL", "HIGH"] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-5 py-2 text-[11px] font-medium tracking-widest uppercase border-none cursor-pointer transition-colors ${filter === f
                                        ? "bg-[#1A1612] text-[#F7F3EE]"
                                        : "bg-[#F7F3EE] text-[#9B8E82] hover:bg-[#EDE7DF]"
                                        }`}
                                >
                                    {f}{" "}
                                    <span className="ml-1 opacity-60">
                                        ({f === "ALL" ? transactions.length : f === "CRITICAL" ? criticalCount : highCount})
                                    </span>
                                </button>
                            ))}
                        </div>
                        <span className="text-[11px] text-[#C4B8AC] tracking-wide">
                            Showing {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
                        </span>
                    </div>

                    {/* Table */}
                    <div className="border border-[#E0D8CF] rounded-lg overflow-hidden">

                        {/* Table header */}
                        <div className="grid grid-cols-[2fr_2fr_1.2fr_1fr_1.2fr_1fr_1.5fr] gap-4 px-6 py-3 bg-[#EDE7DF] border-b border-[#E0D8CF]">
                            {["Receiver", "Sender", "Amount", "Risk", "Location", "Time", "Flags"].map((h) => (
                                <span key={h} className="text-[10px] font-medium tracking-[0.15em] text-[#9B8E82] uppercase">{h}</span>
                            ))}
                        </div>

                        {loading && (
                            <div className="text-center py-16 text-[#C4B8AC] text-sm tracking-widest">
                                Loading feed...
                            </div>
                        )}

                        {!loading && filtered.length === 0 && (
                            <div className="text-center py-16 text-[#C4B8AC] text-sm">
                                No transactions match current filter.
                            </div>
                        )}

                        <div className="divide-y divide-[#E0D8CF]">
                            {filtered.map((tx) => {
                                const rb = riskBand(tx.risk_score);
                                const isNew = newIds.has(tx.transaction_id);
                                return (
                                    <div
                                        key={tx.transaction_id}
                                        className={`grid grid-cols-[2fr_2fr_1.2fr_1fr_1.2fr_1fr_1.5fr] gap-4 px-6 py-4 items-center transition-all duration-700 bg-[#F7F3EE] hover:bg-[#F0E9E0] ${rb.row} ${isNew ? "flash-new" : ""}`}
                                    >
                                        {/* Receiver */}
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${rb.dot}`} />
                                            <span className={`text-[13px] font-medium truncate ${rb.text}`}>
                                                {tx.receiver}
                                            </span>
                                        </div>

                                        {/* Sender */}
                                        <span className="text-[13px] font-light text-[#9B8E82] truncate">{tx.sender}</span>

                                        {/* Amount */}
                                        <span className={`text-[13px] font-semibold ${rb.text}`}>{fmt(tx.amount)}</span>

                                        {/* Risk score */}
                                        <div className="flex items-center gap-2">
                                            <div className="w-10 h-1 bg-[#E0D8CF] rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${rb.bar}`}
                                                    style={{ width: `${tx.risk_score}%` }}
                                                />
                                            </div>
                                            <span className={`text-[12px] font-medium ${rb.text}`}>{tx.risk_score}</span>
                                        </div>

                                        {/* Location */}
                                        <span className="text-[12px] font-light text-[#C4B8AC] truncate">{tx.location || "—"}</span>

                                        {/* Time */}
                                        <span className="text-[12px] font-light text-[#C4B8AC]">{timeAgo(tx.timestamp)}</span>

                                        {/* Flags */}
                                        <div className="flex gap-1 flex-wrap">
                                            {(tx.flags || []).slice(0, 2).map((flag) => (
                                                <span
                                                    key={flag}
                                                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide ${rb.badge}`}
                                                >
                                                    {flag}
                                                </span>
                                            ))}
                                            {(tx.flags || []).length > 2 && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] text-[#C4B8AC] border border-[#E0D8CF]">
                                                    +{tx.flags.length - 2}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Footer ── */}
                    <div className="bg-white/50 backdrop-blur-sm px-12 py-5 fixed bottom-0 left-0 right-0 border-t border-[#E0D8CF]">
                        <div className="flex justify-center w-full gap-8 flex-wrap">
                            {[
                                { key: "SentinelDB", val: "port 5433" },
                                { key: "Neo4j", val: "port 7687" },
                                { key: "API", val: "port 8000" },
                                { key: "Model", val: "GROQ - llama-3.3-70b-versatile" },
                                { key: "Developed by", val: "Partha Chakraborty, Dhvani Dave" },
                            ].map(({ key, val }) => (
                                <div key={key} className="flex items-center gap-2">
                                    <span className="text-[10px] tracking-widest text-[#3A3430] uppercase">{key}</span>
                                    <div className="w-px h-2.5 bg-[#3A3430]" />
                                    <span className="text-[10px] text-[#6B5E52] tracking-wide">{val}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}