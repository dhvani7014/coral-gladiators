"use client";

import { useState, useEffect } from "react";

// ── types ────────────────────────────────────────────────────────────────────
interface ReportEvidence {
    source: string;
    finding: string;
    detail?: string;
    severity?: string;
}

interface Report {
    title: string;
    risk_score: number;
    risk_level: string;
    executive_summary: string;
    key_findings: string[];
    evidence: ReportEvidence[];
    network_analysis?: string;
    recommended_action: string;
    confidence: string;
    investigator_notes?: string;
}

interface InvestigationResult {
    target: string;
    risk_score: number;
    risk_level: string;
    recommendation: string;
    report: Report;
    graph_evidence?: {
        transactions: { count: number; total_amount: number; flags: string[] };
        sanctions: { hit_count: number };
        corroborations: number;
        slack: { count: number };
        emails: { count: number };
    };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function getRiskClasses(score: number) {
    if (score >= 80) return { text: "text-red-500", border: "border-red-500/30", bg: "bg-red-500/10", glow: "shadow-red-500/20" };
    if (score >= 40) return { text: "text-amber-400", border: "border-amber-400/30", bg: "bg-amber-400/10", glow: "shadow-amber-400/20" };
    return { text: "text-green-400", border: "border-green-400/30", bg: "bg-green-400/10", glow: "shadow-green-400/20" };
}

function getRiskColor(score: number) {
    if (score >= 80) return "#ef4444";
    if (score >= 40) return "#f59e0b";
    return "#22c55e";
}

function getSourceClasses(source: string) {
    const s = source.toLowerCase();
    if (s.includes("sql") || s.includes("transaction")) return "bg-amber-400/10 border-amber-400/40 text-amber-400";
    if (s.includes("neo4j") || s.includes("graph")) return "bg-violet-400/10 border-violet-400/40 text-violet-400";
    if (s.includes("sanction")) return "bg-red-500/10 border-red-500/40 text-red-400";
    if (s.includes("email")) return "bg-sky-400/10 border-sky-400/40 text-sky-400";
    if (s.includes("slack")) return "bg-indigo-400/10 border-indigo-400/40 text-indigo-400";
    return "bg-white/5 border-white/10 text-slate-400";
}

// ── gauge ────────────────────────────────────────────────────────────────────
function RiskGauge({ score }: { score: number }) {
    const color = getRiskColor(score);
    const r = 80;
    const cx = 110, cy = 110;
    const strokeW = 14;
    const arcStart = Math.PI * 0.75;
    const arcEnd = Math.PI * 2.25;
    const filled = (arcEnd - arcStart) * (score / 100);

    const polar = (angle: number, rad: number) => ({
        x: cx + rad * Math.cos(angle),
        y: cy + rad * Math.sin(angle),
    });

    const arcPath = (start: number, end: number) => {
        const s = polar(start, r);
        const e = polar(end, r);
        const large = end - start > Math.PI ? 1 : 0;
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
    };

    const rc = getRiskClasses(score);

    return (
        <div className="flex flex-col items-center gap-3">
            <svg width={220} height={160} viewBox="0 0 220 160">
                <path d={arcPath(arcStart, arcEnd)} fill="none" stroke="white" strokeOpacity={0.06}
                    strokeWidth={strokeW} strokeLinecap="round" />
                <path d={arcPath(arcStart, arcStart + filled)} fill="none" stroke={color}
                    strokeWidth={strokeW} strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 10px ${color})` }} />
                <text x={cx} y={cy + 10} textAnchor="middle" fill={color}
                    style={{ fontSize: 40, fontWeight: 800, fontFamily: "monospace" }}>
                    {score}
                </text>
                <text x={cx} y={cy + 30} textAnchor="middle" fill="#475569"
                    style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: 2 }}>
                    / 100
                </text>
                <text x={polar(arcStart, r + 20).x} y={polar(arcStart, r + 20).y + 4}
                    textAnchor="middle" fill="#334155" style={{ fontSize: 9, fontFamily: "monospace" }}>0</text>
                <text x={polar(arcEnd, r + 20).x} y={polar(arcEnd, r + 20).y + 4}
                    textAnchor="middle" fill="#334155" style={{ fontSize: 9, fontFamily: "monospace" }}>100</text>
            </svg>
            <span className={`px-5 py-1.5 rounded text-xs font-bold tracking-widest border font-mono ${rc.text} ${rc.border} ${rc.bg}`}>
                {score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 40 ? "MEDIUM" : score >= 20 ? "LOW" : "MINIMAL"} RISK
            </span>
        </div>
    );
}

// ── stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, colorClass = "text-slate-300" }: {
    label: string; value: string | number; colorClass?: string;
}) {
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg px-5 py-4 flex flex-col gap-1">
            <span className="text-slate-500 font-mono text-[9px] tracking-widest">{label}</span>
            <span className={`font-mono text-xl font-bold ${colorClass}`}>{value}</span>
        </div>
    );
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function ReportPage() {
    const [query, setQuery] = useState("Investigate Vendor Zenith LLC");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<InvestigationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [timestamp, setTimestamp] = useState("");

    useEffect(() => {
        const saved = sessionStorage.getItem("sentinel_last_report");
        if (saved) { try { setResult(JSON.parse(saved)); } catch { } }
    }, []);

    async function runInvestigation() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("http://localhost:8000/investigate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ request: query }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: InvestigationResult = await res.json();
            setResult(data);
            setTimestamp(new Date().toISOString());
            sessionStorage.setItem("sentinel_last_report", JSON.stringify(data));
        } catch (e: any) {
            setError(e.message || "Unknown error");
        } finally {
            setLoading(false);
        }
    }

    const report = result?.report;
    const ge = result?.graph_evidence;
    const rc = getRiskClasses(result?.risk_score ?? 0);

    return (
        <div className="min-h-screen bg-[#020817] text-slate-200 font-mono">

            {/* header */}
            <div className="border-b border-slate-800 bg-slate-950 px-10 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                    <span className="text-xs tracking-[4px] text-slate-400">SENTINEL</span>
                    <span className="text-slate-700">|</span>
                    <span className="text-xs tracking-[3px] text-slate-500">INVESTIGATION REPORT</span>
                </div>
                {timestamp && (
                    <span className="text-[10px] tracking-wider text-slate-600">
                        GENERATED {new Date(timestamp).toLocaleString().toUpperCase()}
                    </span>
                )}
            </div>

            <div className="max-w-5xl mx-auto px-10 py-10">

                {/* query bar */}
                <div className="flex gap-3 mb-10">
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && runInvestigation()}
                        placeholder="Enter investigation query..."
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-md px-4 py-3 text-sm text-slate-200 font-mono outline-none focus:border-slate-600 transition-colors placeholder:text-slate-600"
                    />
                    <button
                        onClick={runInvestigation}
                        disabled={loading}
                        className={`px-7 py-3 rounded-md text-xs font-bold tracking-widest transition-all
              ${loading
                                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                                : "bg-red-600 hover:bg-red-500 text-white cursor-pointer"
                            }`}
                    >
                        {loading ? "ANALYZING..." : "INVESTIGATE"}
                    </button>
                </div>

                {/* error */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-md px-4 py-3 text-red-400 text-xs mb-6">
                        ⚠ {error}
                    </div>
                )}

                {/* loading */}
                {loading && (
                    <div className="text-center py-24">
                        <div className="text-xs tracking-[4px] text-slate-600 mb-6">RUNNING AGENT PIPELINE</div>
                        <div className="flex justify-center gap-2">
                            {["PLANNER", "SQL", "GRAPH", "FRAUD", "INTEL", "REPORT"].map((s, i) => (
                                <div key={s}
                                    className="px-3 py-1 border border-slate-800 rounded text-[9px] tracking-widest text-slate-600"
                                    style={{ animation: `pulse 1.5s ease-in-out ${i * 0.25}s infinite` }}
                                >
                                    {s}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* report */}
                {result && report && !loading && (
                    <div className="flex flex-col gap-6">

                        {/* hero — gauge + title */}
                        <div className={`grid grid-cols-[1fr_auto] gap-10 items-center p-8 bg-slate-950 border rounded-xl shadow-lg ${rc.border}`}>
                            <div>
                                <div className="text-[10px] tracking-[4px] text-slate-500 mb-3">
                                    CASE REPORT — {result.target.toUpperCase()}
                                </div>
                                <h1 className="text-2xl font-extrabold text-slate-100 mb-4 leading-tight">
                                    {report.title}
                                </h1>
                                <p className="text-sm text-slate-400 leading-relaxed mb-5 max-w-xl">
                                    {report.executive_summary}
                                </p>
                                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded text-xs font-bold tracking-widest border ${rc.text} ${rc.border} ${rc.bg}`}>
                                    ▲ {result.recommendation}
                                </span>
                            </div>
                            <RiskGauge score={result.risk_score} />
                        </div>

                        {/* stat cards */}
                        {ge && (
                            <div className="grid grid-cols-5 gap-3">
                                <StatCard label="TRANSACTIONS" value={ge.transactions.count} colorClass="text-amber-400" />
                                <StatCard label="TOTAL VALUE" value={`$${(ge.transactions.total_amount / 1000).toFixed(0)}k`} colorClass="text-amber-400" />
                                <StatCard label="SANCTIONS HITS" value={ge.sanctions.hit_count} colorClass="text-red-400" />
                                <StatCard label="CORROBORATIONS" value={ge.corroborations} colorClass="text-violet-400" />
                                <StatCard label="CONFIDENCE" value={report.confidence} colorClass="text-green-400" />
                            </div>
                        )}

                        {/* findings + flags */}
                        <div className="grid grid-cols-2 gap-6">

                            {/* key findings */}
                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                                <div className="text-[10px] tracking-[4px] text-slate-500 mb-5">KEY FINDINGS</div>
                                <div className="flex flex-col gap-4">
                                    {(report.key_findings || []).map((f, i) => (
                                        <div key={i} className="flex gap-3 items-start">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5 border ${rc.text} ${rc.border} ${rc.bg}`}>
                                                {i + 1}
                                            </div>
                                            <span className="text-sm text-slate-300 leading-relaxed">{f}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* right column */}
                            <div className="flex flex-col gap-4">

                                {/* risk flags */}
                                {ge?.transactions.flags && ge.transactions.flags.length > 0 && (
                                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                                        <div className="text-[10px] tracking-[4px] text-slate-500 mb-4">RISK FLAGS TRIGGERED</div>
                                        <div className="flex flex-wrap gap-2">
                                            {[...new Set(ge.transactions.flags)].map(flag => (
                                                <span key={flag} className="px-3 py-1 bg-red-500/10 border border-red-500/30 rounded text-[10px] font-bold tracking-widest text-red-400">
                                                    {flag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* recommended action */}
                                <div className={`rounded-xl p-5 border flex-1 ${rc.bg} ${rc.border}`}>
                                    <div className={`text-[10px] tracking-[4px] mb-2 opacity-70 ${rc.text}`}>RECOMMENDED ACTION</div>
                                    <div className={`text-lg font-extrabold tracking-wide ${rc.text}`}>
                                        {report.recommended_action}
                                    </div>
                                    {report.investigator_notes && (
                                        <p className="text-xs text-slate-400 mt-3 leading-relaxed">{report.investigator_notes}</p>
                                    )}
                                </div>

                                {/* network analysis */}
                                {report.network_analysis && (
                                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
                                        <div className="text-[10px] tracking-[4px] text-slate-500 mb-3">NETWORK ANALYSIS</div>
                                        <p className="text-xs text-slate-400 leading-relaxed">{report.network_analysis}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* evidence table */}
                        {report.evidence && report.evidence.length > 0 && (
                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                                <div className="text-[10px] tracking-[4px] text-slate-500 mb-5">EVIDENCE TRAIL</div>
                                <div className="divide-y divide-slate-900">
                                    <div className="grid grid-cols-[160px_1fr] gap-4 pb-3 mb-1">
                                        <span className="text-[9px] tracking-[3px] text-slate-600">SOURCE</span>
                                        <span className="text-[9px] tracking-[3px] text-slate-600">FINDING</span>
                                    </div>
                                    {report.evidence.map((ev, i) => (
                                        <div key={i} className="grid grid-cols-[160px_1fr] gap-4 py-3 items-start">
                                            <span className={`inline-flex px-2 py-1 rounded text-[9px] font-bold tracking-widest border w-fit ${getSourceClasses(ev.source)}`}>
                                                {ev.source.toUpperCase()}
                                            </span>
                                            <span className="text-xs text-slate-400 leading-relaxed">{ev.finding || (ev as any).detail}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* footer */}
                        <div className="border-t border-slate-800 pt-5 flex justify-between items-center">
                            <span className="text-[10px] tracking-widest text-slate-700">
                                SENTINEL AI — AUTOMATED FRAUD INVESTIGATION SYSTEM
                            </span>
                            <div className="flex gap-5">
                                {[["→ INVESTIGATE", "/investigate"], ["→ GRAPH", "/graph"], ["→ TRACES", "/trace"]].map(([label, href]) => (
                                    <a key={href} href={href} className="text-[10px] tracking-widest text-slate-600 hover:text-slate-400 transition-colors no-underline">
                                        {label}
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* empty state */}
                {!result && !loading && (
                    <div className="text-center py-32">
                        <div className="text-5xl mb-4 text-slate-800">⬡</div>
                        <div className="text-xs tracking-[4px] text-slate-700">ENTER A QUERY TO GENERATE A REPORT</div>
                    </div>
                )}
            </div>

            <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; border-color: #3b82f6; color: #3b82f6; }
        }
      `}</style>
        </div>
    );
}