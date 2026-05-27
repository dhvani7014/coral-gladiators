"use client";

import { useState } from "react";

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

type Stage = {
    id: string;
    label: string;
    status: "idle" | "running" | "done" | "error";
    detail?: string;
};

export default function InvestigatePage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [stages, setStages] = useState<Stage[]>([
        { id: "planner", label: "Planner Agent", status: "idle" },
        { id: "sql", label: "SQL Agent", status: "idle" },
        { id: "graph", label: "Graph Agent", status: "idle" },
        { id: "fraud", label: "Fraud Agent", status: "idle" },
    ]);

    const setStage = (id: string, status: Stage["status"], detail?: string) => {
        setStages(prev => prev.map(s => s.id === id ? { ...s, status, detail } : s));
    };

    const resetStages = () => {
        setStages(prev => prev.map(s => ({ ...s, status: "idle", detail: undefined })));
    };

    const investigate = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError(null);
        setResult(null);
        resetStages();

        // Animate stages sequentially while waiting for response
        setStage("planner", "running");
        const plannerTimer = setTimeout(() => {
            setStage("planner", "done", "Query plan generated");
            setStage("sql", "running");
        }, 1500);

        const sqlTimer = setTimeout(() => {
            setStage("sql", "done", "Queries executed");
            setStage("graph", "running");
        }, 4000);

        const graphTimer = setTimeout(() => {
            setStage("graph", "done", "Neo4j graph populated");
            setStage("fraud", "running");
        }, 6000);

        try {
            const res = await fetch(`${BACKEND}/investigate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ request: query }),
            });

            clearTimeout(plannerTimer);
            clearTimeout(sqlTimer);
            clearTimeout(graphTimer);

            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const data = await res.json();

            // Mark all stages done based on actual pipeline_errors
            const errs = data.pipeline_errors || [];
            setStages([
                { id: "planner", label: "Planner Agent", status: "done", detail: `Target: ${data.target}` },
                {
                    id: "sql", label: "SQL Agent", status: errs.some((e: string) => e.includes("SQL")) ? "error" : "done",
                    detail: `${data.sql_results?.total_rows ?? 0} rows retrieved`
                },
                {
                    id: "graph", label: "Graph Agent", status: errs.some((e: string) => e.includes("Graph")) ? "error" : "done",
                    detail: `${Object.values(data.graph_results?.nodes ?? {}).reduce((a: any, b: any) => a + b, 0)} nodes in graph`
                },
                { id: "fraud", label: "Fraud Agent", status: "done", detail: `Score: ${data.risk_score}/100` },
            ]);

            setResult(data);
        } catch (err: any) {
            clearTimeout(plannerTimer);
            clearTimeout(sqlTimer);
            clearTimeout(graphTimer);
            setError(err.message);
            setStages(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s));
        } finally {
            setLoading(false);
        }
    };

    const assessment = result?.fraud_assessment?.assessment;
    const sqlResults = result?.sql_results?.query_results ?? [];
    const graphNodes = result?.graph_results?.nodes ?? {};

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

                {/* Pipeline stages */}
                <div className="grid grid-cols-4 gap-3 mb-10">
                    {stages.map((stage, i) => (
                        <div key={stage.id} className={`border rounded-lg p-4 transition-all duration-300 ${stage.status === "done" ? "border-green-500/40 bg-green-500/5" :
                                stage.status === "running" ? "border-blue-400/60 bg-blue-400/5 animate-pulse" :
                                    stage.status === "error" ? "border-red-500/40 bg-red-500/5" :
                                        "border-gray-800 bg-gray-900/50"
                            }`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-gray-500">{String(i + 1).padStart(2, "0")}</span>
                                <span className={`text-xs font-bold ${stage.status === "done" ? "text-green-400" :
                                        stage.status === "running" ? "text-blue-400" :
                                            stage.status === "error" ? "text-red-400" :
                                                "text-gray-700"
                                    }`}>
                                    {stage.status === "done" ? "✓" : stage.status === "running" ? "●" : stage.status === "error" ? "✗" : "○"}
                                </span>
                            </div>
                            <p className="text-xs font-bold text-white">{stage.label}</p>
                            {stage.detail && <p className="text-xs text-gray-500 mt-1">{stage.detail}</p>}
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
                                    <p className="text-xs text-gray-500 mb-1">FRAUD RISK ASSESSMENT — {result.target}</p>
                                    <p className={`text-5xl font-bold ${riskColor(result.risk_level)}`}>
                                        {result.risk_score}<span className="text-2xl text-gray-600">/100</span>
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
                                {assessment.key_findings?.map((f: string, i: number) => (
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

                        {/* Rule findings */}
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

                    </div>
                )}
            </div>
        </div>
    );
}