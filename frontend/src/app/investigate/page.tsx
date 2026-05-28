"use client";

import { useState, useRef } from "react";

const BACKEND = "http://localhost:8000";

const riskColor = (level: string) => {
    switch (level) {
        case "CRITICAL": return "text-red-500 border-red-500";
        case "HIGH": return "text-orange-500 border-orange-500";
        case "MEDIUM": return "text-yellow-500 border-yellow-500";
        case "LOW": return "text-blue-400 border-blue-400";
        default: return "text-green-400 border-green-400";
    }
};

const riskBg = (level: string) => {
    switch (level) {
        case "CRITICAL": return "bg-red-500/10 border-red-500/30";
        case "HIGH": return "bg-orange-500/10 border-orange-500/30";
        case "MEDIUM": return "bg-yellow-500/10 border-yellow-500/30";
        case "LOW": return "bg-blue-400/10 border-blue-400/30";
        default: return "bg-green-400/10 border-green-400/30";
    }
};

type StageStatus = "idle" | "running" | "done" | "error";

type Stage = {
    id: string;
    label: string;
    status: StageStatus;
    detail?: string;
};

// Maps SSE agent names → stage ids
const AGENT_TO_STAGE: Record<string, string> = {
    Planner: "planner",
    SQL: "sql",
    Graph: "graph",
    Fraud: "fraud",
    GraphIntelligence: "graph_intel",
    Report: "report",
};

const INITIAL_STAGES: Stage[] = [
    { id: "planner", label: "Planner Agent", status: "idle" },
    { id: "sql", label: "SQL Agent", status: "idle" },
    { id: "graph", label: "Graph Agent", status: "idle" },
    { id: "fraud", label: "Fraud Agent", status: "idle" },
    { id: "graph_intel", label: "Graph Intelligence", status: "idle" },
    { id: "report", label: "Report Generator", status: "idle" },
];

export default function InvestigatePage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES);
    const abortRef = useRef<AbortController | null>(null);

    // ── helpers ──────────────────────────────────────────────────────────────

    const setStage = (id: string, status: StageStatus, detail?: string) =>
        setStages(prev => prev.map(s => s.id === id ? { ...s, status, detail } : s));

    const resetStages = () => setStages(INITIAL_STAGES.map(s => ({ ...s })));

    // ── SSE detail lines per agent ───────────────────────────────────────────

    const detailFromDone = (agentName: string, data: any): string => {
        switch (agentName) {
            case "Planner":
                return `Target: ${data.target} · ${data.query_count} queries`;
            case "SQL":
                return `${data.total_rows} rows across ${data.queries?.length ?? 0} queries`;
            case "Graph":
                return `${Object.values(data.nodes ?? {}).reduce((a: any, b: any) => a + b, 0)} nodes`;
            case "Fraud":
                return `Score: ${data.rule_score}/100 · ${data.risk_level}`;
            case "GraphIntelligence":
                return data.findings?.[0] ?? `${data.network_size} connected nodes`;
            case "Report":
                return `${data.risk_level} · ${data.recommended_action}`;
            default:
                return "Complete";
        }
    };

    // ── main investigate ─────────────────────────────────────────────────────

    const investigate = async () => {
        if (!query.trim() || loading) return;

        // cancel any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);
        setResult(null);
        resetStages();

        try {
            const response = await fetch(`${BACKEND}/investigate/stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ request: query }),
                signal: controller.signal,
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";

                for (const part of parts) {
                    const lines = part.trim().split("\n");
                    let eventType = "message";
                    let dataStr = "";

                    for (const line of lines) {
                        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
                        if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
                    }

                    if (!dataStr) continue;

                    let data: any;
                    try { data = JSON.parse(dataStr); } catch { continue; }

                    const stageId = AGENT_TO_STAGE[data.agent] ?? data.agent;

                    if (eventType === "agent_start") {
                        setStage(stageId, "running", data.message);
                    }

                    if (eventType === "agent_done") {
                        setStage(stageId, "done", detailFromDone(data.agent, data));
                    }

                    if (eventType === "agent_error") {
                        setStage(stageId, "error", data.error);
                    }

                    if (eventType === "pipeline_done") {
                        if (!data.error) setResult(data);
                        else setError(data.error);
                    }
                }
            }
        } catch (err: any) {
            if (err.name !== "AbortError") setError(err.message);
            setStages(prev => prev.map(s =>
                s.status === "running" ? { ...s, status: "error" } : s
            ));
        } finally {
            setLoading(false);
        }
    };

    // ── derived data ─────────────────────────────────────────────────────────

    const assessment = result?.fraud_assessment?.assessment;
    const sqlResults = result?.sql_results?.query_results ?? [];
    const graphNodes = result?.graph_results?.nodes ?? {};
    const graphIntel = result?.graph_intelligence ?? {};
    const report = result?.report ?? {};

    // ── render ───────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-mono">
            <div className="max-w-5xl mx-auto">

                {/* Header */}
                <div className="mb-10">
                    <h1 className="text-3xl font-bold tracking-tight text-white">SentinelAI</h1>
                    <p className="text-gray-500 mt-1 text-sm">Fraud Investigation System</p>
                </div>

                {/* Input */}
                <div className="flex gap-3 mb-10">
                    <input
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
                        placeholder='e.g. "Investigate Vendor Zenith LLC"'
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !loading && investigate()}
                        disabled={loading}
                    />
                    <button
                        onClick={investigate}
                        disabled={loading || !query.trim()}
                        className="bg-white text-gray-950 px-6 py-3 rounded-lg text-sm font-bold hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? "Running..." : "Investigate"}
                    </button>
                </div>

                {/* Pipeline stage cards — now 6 stages in 3×2 grid */}
                <div className="grid grid-cols-3 gap-3 mb-10">
                    {stages.map((stage, i) => (
                        <div
                            key={stage.id}
                            className={`border rounded-lg p-4 transition-all duration-300 ${stage.status === "done" ? "border-green-500/40 bg-green-500/5" :
                                stage.status === "running" ? "border-blue-400/60 bg-blue-400/5 animate-pulse" :
                                    stage.status === "error" ? "border-red-500/40 bg-red-500/5" :
                                        "border-gray-800 bg-gray-900/50"
                                }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-gray-500">{String(i + 1).padStart(2, "0")}</span>
                                <span className={`text-xs font-bold ${stage.status === "done" ? "text-green-400" :
                                    stage.status === "running" ? "text-blue-400" :
                                        stage.status === "error" ? "text-red-400" :
                                            "text-gray-700"
                                    }`}>
                                    {stage.status === "done" ? "✓" :
                                        stage.status === "running" ? "●" :
                                            stage.status === "error" ? "✗" : "○"}
                                </span>
                            </div>
                            <p className="text-xs font-bold text-white">{stage.label}</p>
                            {stage.detail && (
                                <p className="text-xs text-gray-500 mt-1 truncate">{stage.detail}</p>
                            )}
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="border border-red-500/30 bg-red-500/10 rounded-lg p-4 mb-6 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Results */}
                {result && assessment && (
                    <div className="space-y-6">

                        {/* Risk banner */}
                        <div className={`border rounded-lg p-6 ${riskBg(result.risk_level)}`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">
                                        FRAUD RISK ASSESSMENT — {result.target}
                                    </p>
                                    <p className={`text-5xl font-bold ${riskColor(result.risk_level)}`}>
                                        {result.risk_score}
                                        <span className="text-2xl text-gray-600">/100</span>
                                    </p>
                                    <p className={`text-sm font-bold mt-1 ${riskColor(result.risk_level)}`}>
                                        {result.risk_level}
                                    </p>
                                </div>
                                <div className={`border rounded-lg px-4 py-2 text-xs font-bold ${riskColor(result.risk_level)}`}>
                                    {result.recommendation}
                                </div>
                            </div>
                            <p className="text-gray-400 text-sm mt-4 leading-relaxed">{result.summary}</p>
                        </div>

                        {/* Key findings */}
                        <div className="border border-gray-800 rounded-lg p-6">
                            <h2 className="text-xs font-bold text-gray-500 mb-4 tracking-widest">KEY FINDINGS</h2>
                            <ul className="space-y-2">
                                {(report.key_findings ?? assessment.key_findings ?? []).map((f: string, i: number) => (
                                    <li key={i} className="flex gap-3 text-sm text-gray-300">
                                        <span className="text-red-400 mt-0.5">▸</span>
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Evidence grid */}
                        <div className="grid grid-cols-2 gap-4">

                            {/* SQL evidence */}
                            <div className="border border-gray-800 rounded-lg p-6">
                                <h2 className="text-xs font-bold text-gray-500 mb-4 tracking-widest">SQL EVIDENCE</h2>
                                <div className="space-y-3">
                                    {sqlResults.map((q: any) => (
                                        <div key={q.id} className="flex justify-between items-center text-sm">
                                            <span className="text-gray-400">{q.name}</span>
                                            <span className={`font-bold ${q.count > 0 ? "text-white" : "text-gray-600"}`}>
                                                {q.count} rows
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Graph nodes */}
                            <div className="border border-gray-800 rounded-lg p-6">
                                <h2 className="text-xs font-bold text-gray-500 mb-4 tracking-widest">GRAPH NODES</h2>
                                <div className="space-y-3">
                                    {Object.entries(graphNodes).map(([type, count]: any) => (
                                        <div key={type} className="flex justify-between items-center text-sm">
                                            <span className="text-gray-400">{type}</span>
                                            <span className="font-bold text-white">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Graph Intelligence */}
                        {graphIntel.findings?.length > 0 && (
                            <div className="border border-gray-800 rounded-lg p-6">
                                <h2 className="text-xs font-bold text-gray-500 mb-4 tracking-widest">GRAPH INTELLIGENCE</h2>
                                <div className="flex flex-wrap gap-2">
                                    {graphIntel.findings.map((f: string, i: number) => (
                                        <span
                                            key={i}
                                            className="text-xs bg-green-900/30 border border-green-700/50 rounded px-3 py-1 text-green-300"
                                        >
                                            {f}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Evidence table from report */}
                        {report.evidence?.length > 0 && (
                            <div className="border border-gray-800 rounded-lg p-6">
                                <h2 className="text-xs font-bold text-gray-500 mb-4 tracking-widest">EVIDENCE</h2>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-gray-600 border-b border-gray-800">
                                            <th className="text-left pb-2 w-24">Source</th>
                                            <th className="text-left pb-2">Detail</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.evidence.map((e: any, i: number) => (
                                            <tr key={i} className="border-b border-gray-800/50">
                                                <td className="py-2 text-orange-400 font-bold">{e.source}</td>
                                                <td className="py-2 text-gray-300">{e.detail}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Rule engine */}
                        <div className="border border-gray-800 rounded-lg p-6">
                            <h2 className="text-xs font-bold text-gray-500 mb-4 tracking-widest">RULE ENGINE OUTPUT</h2>
                            <div className="space-y-2">
                                {result.fraud_assessment?.rule_findings?.map((r: string, i: number) => (
                                    <div key={i} className="text-xs text-gray-400 font-mono bg-gray-900 rounded px-3 py-2">
                                        {r}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Investigator notes */}
                        {report.investigator_notes && (
                            <div className="border border-yellow-700/30 bg-yellow-500/5 rounded-lg p-6">
                                <h2 className="text-xs font-bold text-yellow-500/70 mb-2 tracking-widest">INVESTIGATOR NOTES</h2>
                                <p className="text-xs text-gray-400 leading-relaxed">{report.investigator_notes}</p>
                            </div>
                        )}

                    </div>
                )}
            </div>
        </div>
    );
}