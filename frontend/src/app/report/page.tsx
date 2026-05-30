"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
    if (score >= 80) return {
        text: "text-[#C0392B]", border: "border-[#C0392B]/30",
        bg: "bg-[#C0392B]/8", label: "CRITICAL", dot: "#C0392B"
    };
    if (score >= 40) return {
        text: "text-[#A87820]", border: "border-[#A87820]/30",
        bg: "bg-[#A87820]/8", label: "MEDIUM", dot: "#A87820"
    };
    return {
        text: "text-[#3B8A52]", border: "border-[#3B8A52]/30",
        bg: "bg-[#3B8A52]/8", label: "LOW", dot: "#3B8A52"
    };
}

function getRiskColor(score: number) {
    if (score >= 80) return "#C0392B";
    if (score >= 40) return "#A87820";
    return "#3B8A52";
}

function getSourceStyle(source: string) {
    const s = source.toLowerCase();
    if (s.includes("sql") || s.includes("transaction"))
        return "bg-[#F5EDD8] text-[#A87820] border border-[#E8D5A0]";
    if (s.includes("neo4j") || s.includes("graph"))
        return "bg-[#EDE8F5] text-[#7B58B8] border border-[#D5C8EC]";
    if (s.includes("sanction"))
        return "bg-[#F5E8E8] text-[#C0392B] border border-[#E8C8C8]";
    if (s.includes("email"))
        return "bg-[#E3EDF8] text-[#3B72B8] border border-[#C8DCF0]";
    if (s.includes("slack"))
        return "bg-[#EAE8F5] text-[#5B48B8] border border-[#CEC8EC]";
    return "bg-[#EDE7DF] text-[#9B8E82] border border-[#D8CEBF]";
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
        result.risk_score >= 80 ? [192, 57, 43]
            : result.risk_score >= 40 ? [168, 120, 32]
                : [59, 138, 82];

    function addText(text: string, x: number, startY: number, opts: {
        size?: number; bold?: boolean; color?: [number, number, number];
        maxWidth?: number; lineHeight?: number;
    } = {}): number {
        const { size = 10, bold = false, color = [106, 94, 82], maxWidth = contentW, lineHeight = 6 } = opts;
        doc.setFontSize(size); doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setTextColor(...color);
        const lines = doc.splitTextToSize(text, maxWidth);
        if (startY + lines.length * lineHeight > 275) { doc.addPage(); startY = margin; }
        doc.text(lines, x, startY);
        return startY + lines.length * lineHeight;
    }

    function addDivider(startY: number): number {
        if (startY > 275) { doc.addPage(); startY = margin; }
        doc.setDrawColor(224, 216, 207); doc.setLineWidth(0.3);
        doc.line(margin, startY, W - margin, startY);
        return startY + 4;
    }

    function sectionHeader(label: string, startY: number): number {
        if (startY > 265) { doc.addPage(); startY = margin; }
        doc.setFillColor(237, 231, 223);
        doc.roundedRect(margin, startY, contentW, 7, 1, 1, "F");
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.setTextColor(155, 142, 130);
        doc.text(label, margin + 3, startY + 5);
        return startY + 11;
    }

    // Cover
    doc.setFillColor(26, 22, 18);
    doc.rect(0, 0, W, 48, "F");
    doc.setFillColor(...riskColor);
    doc.rect(0, 0, 4, 48, "F");

    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.setTextColor(217, 123, 79);
    doc.text("SENTINEL", margin, 12);
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 94, 82);
    doc.text("FRAUD INVESTIGATION SYSTEM", margin, 18);

    doc.setFillColor(...riskColor);
    doc.roundedRect(W - margin - 28, 8, 28, 14, 2, 2, "F");
    doc.setFontSize(18); doc.setFont("helvetica", "bold");
    doc.setTextColor(247, 243, 238);
    doc.text(String(result.risk_score), W - margin - 14, 19, { align: "center" });
    doc.setFontSize(6); doc.setFont("helvetica", "normal");
    doc.text("RISK SCORE", W - margin - 14, 24, { align: "center" });

    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.setTextColor(247, 243, 238);
    doc.text(report.title || `Investigation: ${result.target}`, margin, 36, { maxWidth: contentW - 35 });

    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 94, 82);
    const ts = timestamp ? new Date(timestamp).toLocaleString().toUpperCase() : new Date().toLocaleString().toUpperCase();
    doc.text(`GENERATED: ${ts}   |   TARGET: ${result.target.toUpperCase()}`, margin, 44);

    y = 58;
    doc.setFillColor(...riskColor.map(c => Math.floor(c * 0.15)) as [number, number, number]);
    doc.roundedRect(margin, y, 44, 8, 2, 2, "F");
    doc.setDrawColor(...riskColor); doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, 44, 8, 2, 2, "S");
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.setTextColor(...riskColor);
    const riskLabel = result.risk_score >= 80 ? "CRITICAL" : result.risk_score >= 60 ? "HIGH" : result.risk_score >= 40 ? "MEDIUM" : "LOW";
    doc.text(`${riskLabel} RISK`, margin + 22, y + 5.5, { align: "center" });

    doc.setFillColor(237, 231, 223);
    doc.roundedRect(margin + 48, y, 80, 8, 2, 2, "F");
    doc.setDrawColor(216, 206, 191); doc.setLineWidth(0.3);
    doc.roundedRect(margin + 48, y, 80, 8, 2, 2, "S");
    doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.setTextColor(107, 94, 82);
    doc.text(`▲ ${report.recommended_action}`, margin + 52, y + 5.5);

    y += 14;
    y = addDivider(y);

    y = sectionHeader("EXECUTIVE SUMMARY", y);
    y = addText(report.executive_summary || "", margin, y, { size: 9.5, color: [106, 94, 82], lineHeight: 5.5 });
    y += 6;

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
            doc.setFillColor(237, 231, 223);
            doc.roundedRect(cx, y, cellW - 2, 14, 1, 1, "F");
            doc.setFontSize(13); doc.setFont("helvetica", "bold");
            doc.setTextColor(...riskColor);
            doc.text(value, cx + cellW / 2 - 1, y + 8, { align: "center" });
            doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
            doc.setTextColor(155, 142, 130);
            doc.text(label, cx + cellW / 2 - 1, y + 13, { align: "center" });
        });
        y += 20;
    }

    y = sectionHeader("KEY FINDINGS", y);
    (report.key_findings || []).forEach((finding, i) => {
        if (y > 270) { doc.addPage(); y = margin; }
        doc.setFillColor(...riskColor.map(c => Math.floor(c * 0.18)) as [number, number, number]);
        doc.circle(margin + 3, y + 2.5, 3, "F");
        doc.setFontSize(7); doc.setFont("helvetica", "bold");
        doc.setTextColor(...riskColor);
        doc.text(String(i + 1), margin + 3, y + 4, { align: "center" });
        y = addText(finding, margin + 9, y, { size: 9, color: [106, 94, 82], maxWidth: contentW - 9, lineHeight: 5 });
        y += 2;
    });
    y += 4;

    if (ge?.transactions.flags && ge.transactions.flags.length > 0) {
        y = sectionHeader("RISK FLAGS TRIGGERED", y);
        const flags = [...new Set(ge.transactions.flags)];
        let fx = margin;
        flags.forEach((flag) => {
            const fw = doc.getTextWidth(flag) + 8;
            if (fx + fw > W - margin) { fx = margin; y += 9; }
            if (y > 272) { doc.addPage(); y = margin; fx = margin; }
            doc.setFillColor(240, 220, 220);
            doc.roundedRect(fx, y, fw, 7, 1.5, 1.5, "F");
            doc.setDrawColor(...riskColor); doc.setLineWidth(0.3);
            doc.roundedRect(fx, y, fw, 7, 1.5, 1.5, "S");
            doc.setFontSize(7); doc.setFont("helvetica", "bold");
            doc.setTextColor(...riskColor);
            doc.text(flag, fx + fw / 2, y + 5, { align: "center" });
            fx += fw + 3;
        });
        y += 13;
    }

    if (report.network_analysis) {
        y = sectionHeader("NETWORK ANALYSIS", y);
        y = addText(report.network_analysis, margin, y, { size: 9, color: [106, 94, 82], lineHeight: 5 });
        y += 6;
    }

    if (report.evidence && report.evidence.length > 0) {
        doc.addPage(); y = margin;
        doc.setFillColor(26, 22, 18);
        doc.rect(0, 0, W, 14, "F");
        doc.setFillColor(...riskColor);
        doc.rect(0, 0, 4, 14, "F");
        doc.setFontSize(7); doc.setFont("helvetica", "bold");
        doc.setTextColor(155, 142, 130);
        doc.text("SENTINEL  —  EVIDENCE TRAIL", margin, 9);
        doc.setTextColor(107, 94, 82);
        doc.text(result.target.toUpperCase(), W - margin, 9, { align: "right" });
        y = 22;

        y = sectionHeader("EVIDENCE TRAIL", y);
        doc.setFillColor(237, 231, 223);
        doc.rect(margin, y, contentW, 7, "F");
        doc.setFontSize(7); doc.setFont("helvetica", "bold");
        doc.setTextColor(155, 142, 130);
        doc.text("SOURCE", margin + 2, y + 5);
        doc.text("FINDING / DETAIL", margin + 38, y + 5);
        y += 9;

        report.evidence.forEach((ev, i) => {
            const text = ev.finding || ev.detail || "";
            const lines = doc.splitTextToSize(text, contentW - 40);
            const rowH = Math.max(10, lines.length * 5 + 4);
            if (y + rowH > 280) { doc.addPage(); y = margin; }
            if (i % 2 === 0) {
                doc.setFillColor(247, 243, 238);
                doc.rect(margin, y, contentW, rowH, "F");
            }
            doc.setFillColor(237, 231, 223);
            doc.roundedRect(margin + 1, y + 2, 32, 5.5, 1, 1, "F");
            doc.setFontSize(6.5); doc.setFont("helvetica", "bold");
            doc.setTextColor(107, 94, 82);
            doc.text(ev.source.toUpperCase().slice(0, 14), margin + 3, y + 6.2);
            doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
            doc.setTextColor(106, 94, 82);
            doc.text(lines, margin + 38, y + 6);
            y += rowH;
        });
    }

    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFillColor(26, 22, 18);
        doc.rect(0, 285, W, 12, "F");
        doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 94, 82);
        doc.text("SENTINEL — CONFIDENTIAL — AUTOMATED FRAUD INVESTIGATION", margin, 291);
        doc.text(`PAGE ${p} OF ${pageCount}`, W - margin, 291, { align: "right" });
    }

    doc.save(`sentinel_${result.target.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}.pdf`);
}

// ── gauge ─────────────────────────────────────────────────────────────────────
function RiskGauge({ score }: { score: number }) {
    const color = getRiskColor(score);
    const r = 80, cx = 110, cy = 110, strokeW = 14;
    const arcStart = Math.PI * 0.75;
    const arcEnd = Math.PI * 2.25;
    const filled = (arcEnd - arcStart) * (score / 100);
    const polar = (angle: number, rad: number) => ({ x: cx + rad * Math.cos(angle), y: cy + rad * Math.sin(angle) });
    const arcPath = (start: number, end: number) => {
        const s = polar(start, r), e = polar(end, r);
        const large = end - start > Math.PI ? 1 : 0;
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
    };
    const rc = getRiskClasses(score);

    return (
        <div className="flex flex-col items-center gap-3">
            <svg width={220} height={160} viewBox="0 0 220 160">
                <path d={arcPath(arcStart, arcEnd)} fill="none" stroke="#1A1612" strokeOpacity={0.15}
                    strokeWidth={strokeW} strokeLinecap="round" />
                <path d={arcPath(arcStart, arcStart + filled)} fill="none" stroke={color}
                    strokeWidth={strokeW} strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 8px ${color}80)` }} />
                <text x={cx} y={cy + 10} textAnchor="middle" fill={color}
                    style={{ fontSize: 40, fontWeight: 800, fontFamily: "'Playfair Display', serif" }}>
                    {score}
                </text>
                <text x={cx} y={cy + 30} textAnchor="middle" fill="#C4B8AC"
                    style={{ fontSize: 11, fontFamily: "'Outfit', sans-serif", letterSpacing: 2 }}>
                    / 100
                </text>
                <text x={polar(arcStart, r + 20).x} y={polar(arcStart, r + 20).y + 4}
                    textAnchor="middle" fill="#C4B8AC" style={{ fontSize: 9, fontFamily: "'Outfit', sans-serif" }}>0</text>
                <text x={polar(arcEnd, r + 20).x} y={polar(arcEnd, r + 20).y + 4}
                    textAnchor="middle" fill="#C4B8AC" style={{ fontSize: 9, fontFamily: "'Outfit', sans-serif" }}>100</text>
            </svg>
            <span className={`px-5 py-1.5 rounded-full text-xs font-semibold tracking-[0.18em] border font-outfit ${rc.text} ${rc.border} ${rc.bg}`}>
                {rc.label} RISK
            </span>
        </div>
    );
}

// ── stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, accent = false }: {
    label: string; value: string | number; accent?: boolean;
}) {
    return (
        <div className="bg-[#EDE7DF] border border-[#D8CEBF] rounded-md px-5 py-4 flex flex-col gap-1">
            <span className="text-[10px] tracking-[0.15em] text-[#9B8E82] font-outfit uppercase">{label}</span>
            <span className={`font-playfair text-2xl font-bold ${accent ? "text-[#D97B4F]" : "text-[#1A1612]"}`}>{value}</span>
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
        setLoading(true); setError(null);
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
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Outfit:wght@300;400;500;600&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-outfit { font-family: 'Outfit', sans-serif; }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes agent-pulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; border-color: #D97B4F; color: #D97B4F; }
        }
      `}</style>

            <div className="font-outfit bg-[#F7F3EE] min-h-screen text-[#1A1612]">

                {/* ── Top bar (identical to home) ── */}
                <div className="bg-[#1A1612] flex items-center justify-between px-12 h-[52px]">
                    <div className="flex items-center gap-6">
                        <Link href="/">
                            <span className="font-outfit font-semibold text-sm tracking-widest text-[#F7F3EE] uppercase cursor-pointer">
                                Sentinel
                            </span>
                        </Link>
                        <div className="w-px h-4 bg-[#3A3430]" />
                        <span className="text-[11px] text-[#6B5E52] tracking-wide">Investigation Report</span>
                    </div>
                    <div className="flex items-center gap-5">
                        {result && report && !loading && (
                            <button
                                onClick={() => downloadPDF(result, timestamp)}
                                className="flex items-center gap-2 px-4 py-1.5 bg-[#2A2420] hover:bg-[#3A3430] border border-[#3A3430] hover:border-[#5A4E48] rounded-full text-[11px] font-medium tracking-widest text-[#9B8E82] hover:text-[#F7F3EE] transition-all"
                            >
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                    <path d="M6 1v7M3 5.5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                EXPORT PDF
                            </button>
                        )}
                        <div className="flex items-center gap-2 bg-[#2A2420] border border-[#3A3430] rounded-full px-3 py-[5px]">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#D97B4F] animate-pulse-dot" />
                            <span className="text-[11px] text-[#D97B4F] tracking-wider font-medium">Module 03</span>
                        </div>
                    </div>
                </div>

                {/* ── Page header ── */}
                <div className="px-12 pt-12 pb-10 border-b border-[#E0D8CF]">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-6 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                        <span className="text-[11px] font-medium tracking-[0.18em] text-[#D97B4F] uppercase">
                            Structured evidence report
                        </span>
                    </div>
                    <div className="flex items-end justify-between gap-10">
                        <div>
                            <h1 className="font-playfair text-[52px] font-black leading-[0.92] tracking-tight text-[#1A1612] mb-4">
                                Investigation<br />
                                <em className="text-[#8B5E3C]">Report.</em>
                            </h1>
                            <p className="text-[14px] font-light text-[#6B5E52] leading-[1.75] max-w-[380px]">
                                Risk gauge, key findings, evidence trail, and full agent output — export as PDF when ready.
                            </p>
                        </div>
                        {/* Query bar lives in the header */}
                        <div className="flex gap-3 flex-1 max-w-lg">
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && runInvestigation()}
                                placeholder="Enter investigation query..."
                                className="flex-1 bg-white border border-[#E0D8CF] rounded-md px-4 py-3 text-sm text-[#1A1612] font-outfit outline-none focus:border-[#D97B4F] transition-colors placeholder:text-[#C4B8AC]"
                            />
                            <button
                                onClick={runInvestigation}
                                disabled={loading}
                                className={`px-6 py-3 rounded-md text-[11px] font-semibold tracking-widest transition-all whitespace-nowrap
                  ${loading
                                        ? "bg-[#EDE7DF] text-[#C4B8AC] cursor-not-allowed"
                                        : "bg-[#1A1612] hover:bg-[#2A2420] text-[#F7F3EE] cursor-pointer"
                                    }`}
                            >
                                {loading ? "ANALYZING..." : "INVESTIGATE"}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="px-12 py-10 pb-28">

                    {/* error */}
                    {error && (
                        <div className="bg-[#F5E8E8] border border-[#E8C8C8] rounded-md px-4 py-3 text-[#C0392B] text-xs mb-8 font-outfit">
                            ⚠ {error}
                        </div>
                    )}

                    {/* loading */}
                    {loading && (
                        <div className="text-center py-24">
                            <div className="text-[11px] tracking-[0.2em] text-[#9B8E82] mb-8 uppercase">Running agent pipeline</div>
                            <div className="flex justify-center gap-2">
                                {["PLANNER", "SQL", "GRAPH", "FRAUD", "INTEL", "REPORT"].map((s, i) => (
                                    <div key={s}
                                        className="px-3 py-1.5 border border-[#D8CEBF] rounded-full text-[10px] tracking-widest text-[#C4B8AC] font-outfit"
                                        style={{ animation: `agent-pulse 1.5s ease-in-out ${i * 0.25}s infinite` }}
                                    >
                                        {s}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Report ── */}
                    {result && report && !loading && (
                        <div className="flex flex-col gap-0 border border-[#E0D8CF] rounded-xl overflow-hidden">

                            {/* Hero — gauge + title */}
                            <div className="grid grid-cols-[1fr_auto] gap-10 items-center p-10 bg-white border-b border-[#E0D8CF]">
                                <div>
                                    <div className="text-[10px] tracking-[0.2em] text-[#9B8E82] mb-3 uppercase font-outfit">
                                        Case Report — {result.target}
                                    </div>
                                    <h2 className="font-playfair text-3xl font-bold text-[#1A1612] mb-4 leading-tight">
                                        {report.title}
                                    </h2>
                                    <p className="text-[14px] font-light text-[#6B5E52] leading-[1.75] mb-6 max-w-xl">
                                        {report.executive_summary}
                                    </p>
                                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold tracking-[0.15em] border font-outfit ${rc.text} ${rc.border} ${rc.bg}`}>
                                        ▲ {result.recommendation}
                                    </span>
                                </div>
                                <RiskGauge score={result.risk_score} />
                            </div>

                            {/* Stat cards */}
                            {ge && (
                                <div className="grid grid-cols-5 gap-px bg-[#E0D8CF] border-b border-[#E0D8CF]">
                                    {[
                                        { label: "Transactions", value: ge.transactions.count, accent: true },
                                        { label: "Total Value", value: `$${(ge.transactions.total_amount / 1000).toFixed(0)}k`, accent: true },
                                        { label: "Sanctions Hits", value: ge.sanctions.hit_count, accent: false },
                                        { label: "Corroborations", value: ge.corroborations, accent: false },
                                        { label: "Confidence", value: report.confidence, accent: false },
                                    ].map(({ label, value, accent }) => (
                                        <div key={label} className="bg-[#F7F3EE] px-6 py-5 flex flex-col gap-1">
                                            <span className="text-[10px] tracking-[0.15em] text-[#9B8E82] font-outfit uppercase">{label}</span>
                                            <span className={`font-playfair text-2xl font-bold ${accent ? "text-[#D97B4F]" : "text-[#1A1612]"}`}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Findings + flags */}
                            <div className="grid grid-cols-2 gap-px bg-[#E0D8CF] border-b border-[#E0D8CF]">

                                {/* Key findings */}
                                <div className="bg-[#F7F3EE] p-8">
                                    <div className="flex items-center gap-2.5 mb-6">
                                        <div className="w-4 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                                        <span className="text-[10px] tracking-[0.2em] text-[#9B8E82] uppercase font-outfit">Key Findings</span>
                                    </div>
                                    <div className="flex flex-col gap-5">
                                        {(report.key_findings || []).map((f, i) => (
                                            <div key={i} className="flex gap-4 items-start">
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 border font-outfit ${rc.text} ${rc.border} ${rc.bg}`}>
                                                    {i + 1}
                                                </div>
                                                <span className="text-[13px] font-light text-[#4A3E35] leading-[1.7]">{f}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Right column */}
                                <div className="flex flex-col gap-px bg-[#E0D8CF]">

                                    {/* Risk flags */}
                                    {ge?.transactions.flags && ge.transactions.flags.length > 0 && (
                                        <div className="bg-[#F7F3EE] p-7 flex-1">
                                            <div className="flex items-center gap-2.5 mb-5">
                                                <div className="w-4 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                                                <span className="text-[10px] tracking-[0.2em] text-[#9B8E82] uppercase font-outfit">Risk Flags Triggered</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {[...new Set(ge.transactions.flags)].map(flag => (
                                                    <span key={flag} className="px-3 py-1.5 bg-[#F5E8E8] border border-[#E8C8C8] rounded-full text-[10px] font-semibold tracking-widest text-[#C0392B] font-outfit">
                                                        {flag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Recommended action */}
                                    <div className={`p-7 flex-1 ${rc.bg}`} style={{ borderColor: "transparent" }}>
                                        <div className="flex items-center gap-2.5 mb-3">
                                            <div className="w-4 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                                            <span className={`text-[10px] tracking-[0.2em] uppercase font-outfit opacity-70 ${rc.text}`}>Recommended Action</span>
                                        </div>
                                        <div className={`font-playfair text-2xl font-bold ${rc.text}`}>
                                            {report.recommended_action}
                                        </div>
                                        {report.investigator_notes && (
                                            <p className="text-xs font-light text-[#6B5E52] mt-3 leading-relaxed">{report.investigator_notes}</p>
                                        )}
                                    </div>

                                    {/* Network analysis */}
                                    {report.network_analysis && (
                                        <div className="bg-[#F7F3EE] p-7">
                                            <div className="flex items-center gap-2.5 mb-4">
                                                <div className="w-4 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                                                <span className="text-[10px] tracking-[0.2em] text-[#9B8E82] uppercase font-outfit">Network Analysis</span>
                                            </div>
                                            <p className="text-[13px] font-light text-[#6B5E52] leading-[1.7]">{report.network_analysis}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Evidence table */}
                            {report.evidence && report.evidence.length > 0 && (
                                <div className="bg-[#F7F3EE]">
                                    <div className="px-8 py-5 border-b border-[#E0D8CF] flex items-center gap-2.5">
                                        <div className="w-4 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                                        <span className="text-[10px] tracking-[0.2em] text-[#9B8E82] uppercase font-outfit">Evidence Trail</span>
                                    </div>
                                    {/* Table header */}
                                    <div className="grid grid-cols-[180px_1fr] gap-4 px-8 py-3 border-b border-[#E0D8CF] bg-[#EDE7DF]">
                                        <span className="text-[10px] tracking-[0.15em] text-[#9B8E82] font-outfit uppercase">Source</span>
                                        <span className="text-[10px] tracking-[0.15em] text-[#9B8E82] font-outfit uppercase">Finding</span>
                                    </div>
                                    <div>
                                        {report.evidence.map((ev, i) => (
                                            <div key={i} className={`grid grid-cols-[180px_1fr] gap-4 px-8 py-4 items-start border-b border-[#E0D8CF] ${i % 2 === 0 ? "bg-[#F7F3EE]" : "bg-white"}`}>
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide border w-fit font-outfit ${getSourceStyle(ev.source)}`}>
                                                    {ev.source.toUpperCase()}
                                                </span>
                                                <span className="text-[13px] font-light text-[#6B5E52] leading-[1.65]">
                                                    {ev.finding || (ev as any).detail}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Card footer */}
                            <div className="bg-[#EDE7DF] border-t border-[#D8CEBF] px-8 py-4 flex justify-between items-center">
                                <span className="text-[10px] tracking-widest text-[#C4B8AC] font-outfit uppercase">
                                    Sentinel — Automated Fraud Investigation
                                </span>
                                <div className="flex gap-6">
                                    {[["Investigate", "/investigate"], ["Graph", "/graph"], ["Traces", "/trace"]].map(([label, href]) => (
                                        <Link key={href} href={href} className="text-[11px] tracking-wide text-[#9B8E82] hover:text-[#D97B4F] transition-colors no-underline font-outfit">
                                            {label} →
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {!result && !loading && (
                        <div className="text-center py-32">
                            <div className="font-playfair text-7xl text-[#E0D8CF] mb-6">⬡</div>
                            <div className="text-[11px] tracking-[0.2em] text-[#C4B8AC] font-outfit uppercase">
                                Enter a query to generate a report
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Footer (identical to home) ── */}
                <div className="bg-white/50 backdrop-blur-sm px-12 py-5 flex items-center justify-between flex-wrap gap-4 fixed bottom-0 left-0 right-0 border-t border-[#E0D8CF]">
                    <div className="flex justify-center w-full gap-8 flex-wrap">
                        {[
                            { key: "SentinelDB", val: "port 5433" },
                            { key: "Neo4j", val: "port 7687" },
                            { key: "API", val: "port 8000" },
                            { key: "Model", val: "GROQ - llama-3.3-70b-versatile" },
                            { key: "Developed by", val: "Partha Chakraborty, Dhvani Dave" }
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
        </>
    );
}