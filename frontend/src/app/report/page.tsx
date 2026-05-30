"use client";

import { useState, useEffect } from "react";
import jsPDF from "jspdf";

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

// ── pdf download ──────────────────────────────────────────────────────────────
function downloadPDF(result: InvestigationResult, timestamp: string) {
    const report = result.report;
    const ge = result.graph_evidence;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210;
    const margin = 18;
    const contentW = W - margin * 2;
    let y = 0;

    const riskColor: [number, number, number] =
        result.risk_score >= 80 ? [239, 68, 68]
            : result.risk_score >= 40 ? [245, 158, 11]
                : [34, 197, 94];

    // helper: wrapped text — returns new y
    function addText(
        text: string,
        x: number,
        startY: number,
        opts: {
            size?: number;
            bold?: boolean;
            color?: [number, number, number];
            maxWidth?: number;
            lineHeight?: number;
        } = {}
    ): number {
        const { size = 10, bold = false, color = [200, 200, 210], maxWidth = contentW, lineHeight = 6 } = opts;
        doc.setFontSize(size);
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setTextColor(...color);
        const lines = doc.splitTextToSize(text, maxWidth);
        // page break check
        if (startY + lines.length * lineHeight > 275) {
            doc.addPage();
            startY = margin;
        }
        doc.text(lines, x, startY);
        return startY + lines.length * lineHeight;
    }

    function addDivider(startY: number, color: [number, number, number] = [40, 44, 60]): number {
        if (startY > 275) { doc.addPage(); startY = margin; }
        doc.setDrawColor(...color);
        doc.setLineWidth(0.3);
        doc.line(margin, startY, W - margin, startY);
        return startY + 4;
    }

    function sectionHeader(label: string, startY: number): number {
        if (startY > 265) { doc.addPage(); startY = margin; }
        doc.setFillColor(20, 24, 40);
        doc.roundedRect(margin, startY, contentW, 7, 1, 1, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 130, 160);
        doc.text(label, margin + 3, startY + 5);
        return startY + 11;
    }

    // ── Page 1: Cover ─────────────────────────────────────────────────────────
    // Dark header band
    doc.setFillColor(8, 10, 22);
    doc.rect(0, 0, W, 48, "F");

    // Red accent bar
    doc.setFillColor(...riskColor);
    doc.rect(0, 0, 4, 48, "F");

    // SENTINELAI wordmark
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 40, 40);
    doc.text("SENTINELAI", margin, 12);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 90, 110);
    doc.text("AUTOMATED FRAUD INVESTIGATION SYSTEM", margin, 18);

    // Risk score badge (top right)
    doc.setFillColor(...riskColor);
    doc.roundedRect(W - margin - 28, 8, 28, 14, 2, 2, "F");
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(String(result.risk_score), W - margin - 14, 19, { align: "center" });
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.text("RISK SCORE", W - margin - 14, 24, { align: "center" });

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(230, 235, 245);
    doc.text(report.title || `Investigation: ${result.target}`, margin, 36, { maxWidth: contentW - 35 });

    // Timestamp + target
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 80, 100);
    const ts = timestamp ? new Date(timestamp).toLocaleString().toUpperCase() : new Date().toLocaleString().toUpperCase();
    doc.text(`GENERATED: ${ts}   |   TARGET: ${result.target.toUpperCase()}`, margin, 44);

    y = 58;

    // Risk level pill
    doc.setFillColor(...riskColor.map(c => Math.floor(c * 0.15)) as [number, number, number]);
    doc.roundedRect(margin, y, 44, 8, 2, 2, "F");
    doc.setDrawColor(...riskColor);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, 44, 8, 2, 2, "S");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...riskColor);
    const riskLabel = result.risk_score >= 80 ? "CRITICAL" : result.risk_score >= 60 ? "HIGH" : result.risk_score >= 40 ? "MEDIUM" : "LOW";
    doc.text(`${riskLabel} RISK`, margin + 22, y + 5.5, { align: "center" });

    // Recommendation pill
    doc.setFillColor(20, 24, 40);
    doc.roundedRect(margin + 48, y, 80, 8, 2, 2, "F");
    doc.setDrawColor(60, 70, 90);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin + 48, y, 80, 8, 2, 2, "S");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(160, 170, 190);
    doc.text(`▲ ${report.recommended_action}`, margin + 52, y + 5.5);

    y += 14;
    y = addDivider(y, [25, 30, 50]);

    // ── Executive Summary ─────────────────────────────────────────────────────
    y = sectionHeader("EXECUTIVE SUMMARY", y);
    y = addText(report.executive_summary || "", margin, y, {
        size: 9.5, color: [190, 200, 215], lineHeight: 5.5, maxWidth: contentW,
    });
    y += 6;

    // ── Stats row ─────────────────────────────────────────────────────────────
    if (ge) {
        y = sectionHeader("INVESTIGATION METRICS", y);
        const stats = [
            ["TRANSACTIONS", String(ge.transactions.count)],
            ["TOTAL VALUE", `$${(ge.transactions.total_amount / 1000).toFixed(0)}k`],
            ["SANCTIONS HITS", String(ge.sanctions.hit_count)],
            ["CORROBORATIONS", String(ge.corroborations)],
            ["CONFIDENCE", report.confidence],
        ];
        const cellW = contentW / stats.length;
        stats.forEach(([label, value], i) => {
            const cx = margin + i * cellW;
            doc.setFillColor(14, 18, 32);
            doc.roundedRect(cx, y, cellW - 2, 14, 1, 1, "F");
            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...riskColor);
            doc.text(value, cx + cellW / 2 - 1, y + 8, { align: "center" });
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(80, 90, 110);
            doc.text(label, cx + cellW / 2 - 1, y + 13, { align: "center" });
        });
        y += 20;
    }

    // ── Key Findings ──────────────────────────────────────────────────────────
    y = sectionHeader("KEY FINDINGS", y);
    (report.key_findings || []).forEach((finding, i) => {
        if (y > 270) { doc.addPage(); y = margin; }
        // Number bubble
        doc.setFillColor(...riskColor.map(c => Math.floor(c * 0.18)) as [number, number, number]);
        doc.circle(margin + 3, y + 2.5, 3, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...riskColor);
        doc.text(String(i + 1), margin + 3, y + 4, { align: "center" });
        // Finding text
        y = addText(finding, margin + 9, y, {
            size: 9, color: [185, 195, 210], maxWidth: contentW - 9, lineHeight: 5,
        });
        y += 2;
    });
    y += 4;

    // ── Risk Flags ────────────────────────────────────────────────────────────
    if (ge?.transactions.flags && ge.transactions.flags.length > 0) {
        y = sectionHeader("RISK FLAGS TRIGGERED", y);
        const flags = [...new Set(ge.transactions.flags)];
        let fx = margin;
        flags.forEach((flag) => {
            const fw = doc.getTextWidth(flag) + 8;
            if (fx + fw > W - margin) { fx = margin; y += 9; }
            if (y > 272) { doc.addPage(); y = margin; fx = margin; }
            doc.setFillColor(60, 10, 10);
            doc.roundedRect(fx, y, fw, 7, 1.5, 1.5, "F");
            doc.setDrawColor(180, 40, 40);
            doc.setLineWidth(0.3);
            doc.roundedRect(fx, y, fw, 7, 1.5, 1.5, "S");
            doc.setFontSize(7);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(239, 68, 68);
            doc.text(flag, fx + fw / 2, y + 5, { align: "center" });
            fx += fw + 3;
        });
        y += 13;
    }

    // ── Network Analysis ──────────────────────────────────────────────────────
    if (report.network_analysis) {
        y = sectionHeader("NETWORK ANALYSIS", y);
        y = addText(report.network_analysis, margin, y, {
            size: 9, color: [170, 180, 200], lineHeight: 5, maxWidth: contentW,
        });
        y += 6;
    }

    // ── Evidence Trail (new page for cleanliness) ─────────────────────────────
    if (report.evidence && report.evidence.length > 0) {
        doc.addPage();
        y = margin;

        // Page header
        doc.setFillColor(8, 10, 22);
        doc.rect(0, 0, W, 14, "F");
        doc.setFillColor(...riskColor);
        doc.rect(0, 0, 4, 14, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 130, 160);
        doc.text("SENTINELAI  —  EVIDENCE TRAIL", margin, 9);
        doc.setTextColor(80, 90, 110);
        doc.text(result.target.toUpperCase(), W - margin, 9, { align: "right" });
        y = 22;

        y = sectionHeader("EVIDENCE TRAIL", y);

        // Table header
        doc.setFillColor(14, 18, 32);
        doc.rect(margin, y, contentW, 7, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80, 90, 110);
        doc.text("SOURCE", margin + 2, y + 5);
        doc.text("FINDING / DETAIL", margin + 38, y + 5);
        y += 9;

        report.evidence.forEach((ev, i) => {
            const text = ev.finding || ev.detail || "";
            const lines = doc.splitTextToSize(text, contentW - 40);
            const rowH = Math.max(10, lines.length * 5 + 4);

            if (y + rowH > 280) { doc.addPage(); y = margin; }

            // Alternating row bg
            if (i % 2 === 0) {
                doc.setFillColor(12, 15, 26);
                doc.rect(margin, y, contentW, rowH, "F");
            }

            // Source badge
            const src = ev.source.toLowerCase();
            const badgeColor: [number, number, number] =
                src.includes("transaction") || src.includes("sql") ? [180, 120, 0]
                    : src.includes("sanction") ? [180, 40, 40]
                        : src.includes("email") ? [0, 130, 180]
                            : src.includes("slack") ? [100, 80, 180]
                                : src.includes("graph") || src.includes("neo4j") ? [130, 60, 200]
                                    : [80, 90, 110];

            doc.setFillColor(...badgeColor.map(c => Math.floor(c * 0.2)) as [number, number, number]);
            doc.roundedRect(margin + 1, y + 2, 32, 5.5, 1, 1, "F");
            doc.setFontSize(6.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...badgeColor);
            doc.text(ev.source.toUpperCase().slice(0, 14), margin + 3, y + 6.2);

            // Finding text
            doc.setFontSize(8.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(175, 185, 200);
            doc.text(lines, margin + 38, y + 6);

            y += rowH;
        });

        y += 6;
    }

    // ── Footer on last page ───────────────────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFillColor(8, 10, 20);
        doc.rect(0, 285, W, 12, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 60, 80);
        doc.text("SENTINELAI — CONFIDENTIAL — AUTOMATED FRAUD INVESTIGATION", margin, 291);
        doc.text(`PAGE ${p} OF ${pageCount}`, W - margin, 291, { align: "right" });
    }

    // Save
    const filename = `sentinel_${result.target.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}.pdf`;
    doc.save(filename);
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
                <div className="flex items-center gap-4">
                    {timestamp && (
                        <span className="text-[10px] tracking-wider text-slate-600">
                            GENERATED {new Date(timestamp).toLocaleString().toUpperCase()}
                        </span>
                    )}
                    {/* Download button — only shows when report is ready */}
                    {result && report && !loading && (
                        <button
                            onClick={() => downloadPDF(result, timestamp)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-500 rounded text-xs font-bold tracking-widest text-slate-300 hover:text-white transition-all"
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M6 1v7M3 5.5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            EXPORT PDF
                        </button>
                    )}
                </div>
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