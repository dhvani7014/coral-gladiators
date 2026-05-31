"use client";

import { useState, useRef } from "react";
import Link from "next/link";

const BACKEND = "http://localhost:8000";

type StageStatus = "idle" | "running" | "done" | "error";
type Stage = {
  id: string;
  label: string;
  status: StageStatus;
  detail?: string;
};

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
  { id: "sql", label: "Coral Query", status: "idle" },
  { id: "graph", label: "Graph Builder", status: "idle" },
  { id: "fraud", label: "Fraud Agent", status: "idle" },
  { id: "graph_intel", label: "Graph Intelligence", status: "idle" },
  { id: "report", label: "Report", status: "idle" },
];

function riskStyles(level: string) {
  switch (level) {
    case "CRITICAL":
      return {
        pill: "bg-[#F5EAE0] text-[#C06030] border border-[#E8CDB8]",
        banner: "bg-[#F5EAE0] border border-[#E8CDB8]",
        score: "text-[#C06030]",
        accent: "#C06030",
      };
    case "HIGH":
      return {
        pill: "bg-[#F5EDD8] text-[#A87820] border border-[#E8D5A0]",
        banner: "bg-[#F5EDD8] border border-[#E8D5A0]",
        score: "text-[#A87820]",
        accent: "#A87820",
      };
    case "MEDIUM":
      return {
        pill: "bg-[#EDE8F5] text-[#7B58B8] border border-[#D5C8EC]",
        banner: "bg-[#EDE8F5] border border-[#D5C8EC]",
        score: "text-[#7B58B8]",
        accent: "#7B58B8",
      };
    default:
      return {
        pill: "bg-[#E3F0E8] text-[#3B8A52] border border-[#C0DCC8]",
        banner: "bg-[#E3F0E8] border border-[#C0DCC8]",
        score: "text-[#3B8A52]",
        accent: "#3B8A52",
      };
  }
}

function stageStyles(status: StageStatus) {
  switch (status) {
    case "done":
      return {
        card: "border-[#C0DCC8] bg-[#E3F0E8]/40",
        dot: "bg-[#3B8A52]",
        text: "text-[#3B8A52]",
      };
    case "running":
      return {
        card: "border-[#D97B4F] bg-[#F5EAE0]/40",
        dot: "bg-[#D97B4F]",
        text: "text-[#D97B4F]",
      };
    case "error":
      return {
        card: "border-[#E8CDB8] bg-[#F5EAE0]/20",
        dot: "bg-[#C06030]",
        text: "text-[#C06030]",
      };
    default:
      return {
        card: "border-[#E0D8CF] bg-[#F7F3EE]",
        dot: "bg-[#D8CEBF]",
        text: "text-[#C4B8AC]",
      };
  }
}

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

export default function InvestigatePage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES);
  const abortRef = useRef<AbortController | null>(null);

  const setStage = (id: string, status: StageStatus, detail?: string) =>
    setStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, detail } : s)),
    );

  const resetStages = () => setStages(INITIAL_STAGES.map((s) => ({ ...s })));

  const investigate = async () => {
    if (!query.trim() || loading) return;
    // Normalize: if user just types a company name, wrap it into a full request
    const normalized = query.trim().toLowerCase().startsWith("investigate")
      ? query.trim()
      : `Investigate company ${query.trim()}`;
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
        body: JSON.stringify({ request: normalized }),
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
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          const stageId = AGENT_TO_STAGE[data.agent] ?? data.agent;
          if (eventType === "agent_start")
            setStage(stageId, "running", data.message);
          if (eventType === "agent_done")
            setStage(stageId, "done", detailFromDone(data.agent, data));
          if (eventType === "agent_error")
            setStage(stageId, "error", data.error);
          if (eventType === "pipeline_done") {
            if (!data.error) setResult(data);
            else setError(data.error);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message);
      setStages((prev) =>
        prev.map((s) =>
          s.status === "running" ? { ...s, status: "error" } : s,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const assessment = result?.fraud_assessment?.assessment;
  const sqlResults = result?.sql_results?.query_results ?? [];
  const graphNodes = result?.graph_results?.nodes ?? {};
  const graphIntel = result?.graph_intelligence ?? {};
  const report = result?.report ?? {};
  const risk = riskStyles(result?.risk_level ?? "");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Outfit:wght@300;400;500;600&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-outfit   { font-family: 'Outfit', sans-serif; }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes spin-slow { to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 1.5s linear infinite; }
      `}</style>

      <div className="font-outfit bg-[#F7F3EE] min-h-screen text-[#1A1612]">
        {/* Top bar */}
        <div className="bg-[#1A1612] flex items-center justify-between px-12 h-[52px]">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="font-outfit font-semibold text-sm tracking-widest text-[#F7F3EE] uppercase no-underline"
            >
              Sentinel
            </Link>
            <div className="w-px h-4 bg-[#3A3430]" />
            <span className="text-[11px] text-[#6B5E52] tracking-wide">
              Investigate
            </span>
          </div>
          <div className="flex items-center gap-4">
            {loading && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#D97B4F] animate-pulse-dot" />
                <span className="text-[11px] text-[#D97B4F] tracking-wide">
                  Pipeline running
                </span>
              </div>
            )}
            <span className="text-[11px] text-[#3A3430] tracking-wide">
              3 sources
            </span>
          </div>
        </div>

        {/* Page header */}
        <div className="px-12 pt-12 pb-10 border-b border-[#E0D8CF]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-6 bg-[#D97B4F]" style={{ height: "1.5px" }} />
            <span className="text-[11px] font-medium tracking-[0.18em] text-[#D97B4F] uppercase">
              sanctions · email · slack
            </span>
          </div>
          <h1 className="font-playfair text-[52px] font-black leading-[0.92] tracking-tight text-[#1A1612] mb-8">
            Screen{" "}
            <em className="italic text-[#8B5E3C]">any company or person.</em>
          </h1>

          {/* Search bar */}
          <div className="flex gap-3 max-w-2xl">
            <input
              className="flex-1 bg-white border border-[#E0D8CF] rounded-lg px-5 py-3.5 text-[14px] text-[#1A1612] placeholder-[#C4B8AC] focus:outline-none focus:border-[#D97B4F] transition-colors font-outfit"
              placeholder='Enter a company or person name — e.g. "Zenith LLC", "Marcus Webb"'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && investigate()}
              disabled={loading}
            />
            <button
              onClick={investigate}
              disabled={loading || !query.trim()}
              className="bg-[#1A1612] text-[#F7F3EE] px-7 py-3.5 rounded-lg text-[13px] font-medium tracking-wide hover:bg-[#2C2418] disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-none cursor-pointer whitespace-nowrap"
            >
              {loading ? "Running…" : "Screen →"}
            </button>
          </div>
        </div>

        <div className="px-12 py-8">
          {/* Pipeline stages */}
          <div className="mb-px">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">
                Screening pipeline
              </span>
              <span className="text-[11px] text-[#C4B8AC] tracking-wide">
                {stages.filter((s) => s.status === "done").length} /{" "}
                {stages.length} complete
              </span>
            </div>
            <div className="grid grid-cols-6 border border-[#E0D8CF] rounded-lg overflow-hidden">
              {stages.map((stage, i) => {
                const st = stageStyles(stage.status);
                return (
                  <div
                    key={stage.id}
                    className={`p-5 border-r border-[#E0D8CF] last:border-r-0 transition-all duration-300 ${st.card}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] text-[#C4B8AC] tracking-widest">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot} ${stage.status === "running" ? "animate-pulse-dot" : ""}`}
                      />
                    </div>
                    <p className="text-[12px] font-medium text-[#1A1612] mb-1 leading-tight">
                      {stage.label}
                    </p>
                    {stage.detail ? (
                      <p className="text-[11px] font-light text-[#9B8E82] truncate leading-snug">
                        {stage.detail}
                      </p>
                    ) : (
                      <p className={`text-[11px] tracking-wide ${st.text}`}>
                        {stage.status === "idle"
                          ? "Waiting"
                          : stage.status === "running"
                            ? "Running…"
                            : stage.status === "done"
                              ? "Done"
                              : "Error"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-6 border border-[#E8CDB8] bg-[#F5EAE0] rounded-lg px-6 py-4 text-[13px] text-[#C06030] font-light">
              {error}
            </div>
          )}

          {/* Results */}
          {result && assessment && (
            <div className="mt-8 space-y-px">
              {/* Risk banner */}
              <div className={`rounded-t-lg p-8 ${risk.banner}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-4">
                      <div
                        className="w-6 bg-[#D97B4F]"
                        style={{ height: "1.5px" }}
                      />
                      <span className="text-[11px] font-medium tracking-[0.18em] text-[#9B8E82] uppercase">
                        Screening result — {result.target}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-3 mb-2">
                      <span
                        className={`font-playfair text-[72px] font-black leading-none ${risk.score}`}
                      >
                        {result.risk_score}
                      </span>
                      <span className="text-[#C4B8AC] text-2xl font-light">
                        /100
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-semibold tracking-[0.15em] uppercase px-3 py-1 rounded-full ${risk.pill}`}
                    >
                      {result.risk_level}
                    </span>
                  </div>
                  <div className={`text-right mt-1`}>
                    <p className="text-[10px] text-[#9B8E82] tracking-widest uppercase mb-2">
                      Recommendation
                    </p>
                    <p className="text-[13px] font-medium text-[#1A1612] max-w-[240px] leading-snug">
                      {result.recommendation}
                    </p>
                  </div>
                </div>
                <p className="text-[14px] font-light text-[#6B5E52] leading-relaxed mt-6 max-w-3xl">
                  {result.summary}
                </p>
              </div>

              {/* Key findings */}
              <div className="bg-[#F7F3EE] border border-[#E0D8CF] p-8">
                <p className="text-[11px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase mb-5">
                  Key findings
                </p>
                <ul className="space-y-3">
                  {(report.key_findings ?? assessment.key_findings ?? []).map(
                    (f: string, i: number) => (
                      <li
                        key={i}
                        className="flex gap-4 text-[13px] text-[#6B5E52] font-light leading-relaxed"
                      >
                        <span className="text-[#D97B4F] mt-0.5 flex-shrink-0">
                          →
                        </span>
                        <span>{f}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>

              {/* Evidence grid */}
              <div className="grid grid-cols-2 border border-[#E0D8CF]">
                <div className="p-8 border-r border-[#E0D8CF] bg-[#F7F3EE]">
                  <p className="text-[11px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase mb-5">
                    SQL evidence
                  </p>
                  <div className="space-y-3">
                    {sqlResults.map((q: any) => (
                      <div
                        key={q.id}
                        className="flex justify-between items-center"
                      >
                        <span className="text-[13px] font-light text-[#6B5E52]">
                          {q.name}
                        </span>
                        <span
                          className={`text-[13px] font-medium ${q.count > 0 ? "text-[#1A1612]" : "text-[#C4B8AC]"}`}
                        >
                          {q.count} rows
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-8 bg-[#F7F3EE]">
                  <p className="text-[11px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase mb-5">
                    Graph nodes
                  </p>
                  <div className="space-y-3">
                    {Object.entries(graphNodes).map(([type, count]: any) => (
                      <div
                        key={type}
                        className="flex justify-between items-center"
                      >
                        <span className="text-[13px] font-light text-[#6B5E52]">
                          {type}
                        </span>
                        <span className="text-[13px] font-medium text-[#1A1612]">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Graph intelligence */}
              {graphIntel.findings?.length > 0 && (
                <div className="bg-[#F7F3EE] border border-[#E0D8CF] p-8">
                  <p className="text-[11px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase mb-5">
                    Graph intelligence
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {graphIntel.findings.map((f: string, i: number) => (
                      <span
                        key={i}
                        className="text-[12px] font-light bg-[#E3F0E8] text-[#3B8A52] border border-[#C0DCC8] rounded-full px-3 py-1"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence table */}
              {report.evidence?.length > 0 && (
                <div className="bg-[#F7F3EE] border border-[#E0D8CF] p-8">
                  <p className="text-[11px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase mb-5">
                    Evidence
                  </p>
                  <div className="divide-y divide-[#E0D8CF]">
                    {report.evidence.map((e: any, i: number) => (
                      <div key={i} className="flex gap-6 py-3">
                        <span className="text-[12px] font-medium text-[#D97B4F] w-24 flex-shrink-0 pt-0.5">
                          {e.source}
                        </span>
                        <span className="text-[13px] font-light text-[#6B5E52] leading-relaxed">
                          {e.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rule engine */}
              <div className="bg-[#F7F3EE] border border-[#E0D8CF] p-8">
                <p className="text-[11px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase mb-5">
                  Rule engine output
                </p>
                <div className="space-y-2">
                  {result.fraud_assessment?.rule_findings?.map(
                    (r: string, i: number) => (
                      <div
                        key={i}
                        className="text-[12px] font-light text-[#6B5E52] bg-[#EDE7DF] border border-[#D8CEBF] rounded-md px-4 py-2.5"
                      >
                        {r}
                      </div>
                    ),
                  )}
                </div>
              </div>

              {/* Investigator notes */}
              {report.investigator_notes && (
                <div className="bg-[#F5EDD8] border border-[#E8D5A0] rounded-b-lg p-8">
                  <p className="text-[11px] font-medium tracking-[0.2em] text-[#A87820] uppercase mb-3">
                    Investigator notes
                  </p>
                  <p className="text-[13px] font-light text-[#6B5E52] leading-relaxed">
                    {report.investigator_notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-[#E0D8CF] mt-8 pt-5 flex items-center justify-between">
            <span className="text-[11px] text-[#C4B8AC] tracking-wide">
              Sentinel AI — Sanctions & Intelligence Screening
            </span>
            <div className="flex gap-6">
              {[
                ["Feed", "/feed"],
                ["Report", "/report"],
                ["Graph", "/graph"],
                ["← Home", "/"],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="text-[11px] text-[#9B8E82] hover:text-[#1A1612] tracking-wide transition-colors no-underline"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
