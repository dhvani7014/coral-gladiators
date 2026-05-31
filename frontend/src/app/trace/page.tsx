"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

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
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const SOURCE_STYLES: Record<string, string> = {
  transactions: "bg-[#F5EDD8] text-[#A87820] border border-[#E8D5A0]",
  sanctions: "bg-[#F5E8E8] text-[#C0392B] border border-[#E8C8C8]",
  emails: "bg-[#E3EDF8] text-[#3B72B8] border border-[#C8DCF0]",
  slack_logs: "bg-[#EDE8F5] text-[#7B58B8] border border-[#D5C8EC]",
  coral_traces: "bg-[#EDE7DF] text-[#9B8E82] border border-[#D8CEBF]",
};

function getSourceStyle(s: string): string {
  return (
    SOURCE_STYLES[s.toLowerCase()] ??
    "bg-[#E3F0E8] text-[#3B8A52] border border-[#C0DCC8]"
  );
}

function getExecColor(ms: number): string {
  if (ms > 1000) return "text-[#C0392B]";
  if (ms > 300) return "text-[#A87820]";
  return "text-[#3B8A52]";
}

// ─── SQL Block ────────────────────────────────────────────────────────────────

function SqlBlock({ sql }: { sql: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = sql.length > 120 ? sql.slice(0, 120) + "…" : sql;

  const highlight = (text: string) => {
    const keywords =
      /\b(SELECT|FROM|WHERE|JOIN|LEFT|INNER|ON|AND|OR|NOT|IN|LIKE|LIMIT|OFFSET|ORDER BY|GROUP BY|HAVING|INSERT|UPDATE|DELETE|WITH|AS|DISTINCT|COUNT|SUM|AVG|MAX|MIN|CASE|WHEN|THEN|ELSE|END|NULL|IS|BETWEEN|EXISTS)\b/gi;
    const parts = text.split(keywords);
    return parts.map((part, i) =>
      keywords.test(part) ? (
        <span key={i} className="text-[#D97B4F] font-semibold">
          {part}
        </span>
      ) : (
        <span key={i} className="text-[#9B8E82]">
          {part}
        </span>
      ),
    );
  };

  return (
    <div>
      <pre className="m-0 text-[12px] leading-relaxed whitespace-pre-wrap break-words bg-transparent font-outfit">
        {highlight(expanded ? sql : preview)}
      </pre>
      {sql.length > 120 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[11px] text-[#D97B4F] hover:text-[#8B5E3C] transition-colors font-outfit tracking-wide"
        >
          {expanded ? "▲ collapse" : "▼ expand"}
        </button>
      )}
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
  const [filterSource, setFilterSource] = useState("all");
  const [filterCache, setFilterCache] = useState("all");
  const [clearing, setClearing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const LIMIT = 20;

  const fetchTraces = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(
        `http://localhost:8000/traces?limit=${LIMIT}&offset=${offset}`,
      );
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

  const filtered = traces.filter((t) => {
    const sources = parseSources(t.sources_hit);
    const sourceMatch =
      filterSource === "all" ||
      sources.some((s) => s.toLowerCase() === filterSource);
    const cacheMatch =
      filterCache === "all" ||
      (filterCache === "hit" && t.cache_hit === true) ||
      (filterCache === "miss" && t.cache_hit === false);
    return sourceMatch && cacheMatch;
  });

  const avgMs =
    traces.length > 0
      ? Math.round(
          traces.reduce((a, t) => a + (t.execution_ms ?? 0), 0) / traces.length,
        )
      : 0;
  const cacheHits = traces.filter((t) => t.cache_hit === true).length;
  const multiSrc = traces.filter(
    (t) => parseSources(t.sources_hit).length > 1,
  ).length;
  const allSources = Array.from(
    new Set(
      traces.flatMap((t) =>
        parseSources(t.sources_hit).map((s) => s.toLowerCase()),
      ),
    ),
  ).sort();
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Outfit:wght@300;400;500;600&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-outfit   { font-family: 'Outfit', sans-serif; }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .animate-pulse-dot  { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes fade-in   { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fade-in 0.25s ease forwards; }
        .trace-row { transition: background 0.15s; }
        .trace-row:hover { background: #F0E9E0 !important; }
      `}</style>

      <div className="font-outfit bg-[#F7F3EE] min-h-screen text-[#1A1612]">
        {/* ── Top bar ── */}
        <div className="bg-[#1A1612] flex items-center justify-between px-12 h-[52px] sticky top-0 z-50">
          <div className="flex items-center gap-6">
            <Link href="/">
              <span className="font-outfit font-semibold text-sm tracking-widest text-[#F7F3EE] uppercase cursor-pointer">
                Sentinel
              </span>
            </Link>
            <div className="w-px h-4 bg-[#3A3430]" />
            <span className="text-[11px] text-[#6B5E52] tracking-wide">
              SQL Trace
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-3 py-[5px] rounded-full border text-[11px] font-medium tracking-wider transition-all
                ${
                  autoRefresh
                    ? "bg-[#2A2420] border-[#D97B4F]/40 text-[#D97B4F]"
                    : "bg-[#2A2420] border-[#3A3430] text-[#6B5E52] hover:text-[#9B8E82]"
                }`}
            >
              {autoRefresh && (
                <div className="w-1.5 h-1.5 rounded-full bg-[#D97B4F] animate-pulse-dot" />
              )}
              {autoRefresh ? "Live" : "Auto-refresh"}
            </button>
            <button
              onClick={fetchTraces}
              className="flex items-center gap-2 px-3 py-[5px] rounded-full bg-[#2A2420] border border-[#3A3430] text-[11px] font-medium tracking-wider text-[#9B8E82] hover:text-[#F7F3EE] transition-all"
            >
              ↺ Refresh
            </button>
            <button
              onClick={clearTraces}
              disabled={clearing}
              className="flex items-center gap-2 px-3 py-[5px] rounded-full bg-[#2A2420] border border-[#C0392B]/30 text-[11px] font-medium tracking-wider text-[#C0392B] hover:border-[#C0392B]/60 transition-all disabled:opacity-40"
            >
              {clearing ? "Clearing…" : "Clear log"}
            </button>
            <div className="flex items-center gap-2 bg-[#2A2420] border border-[#3A3430] rounded-full px-3 py-[5px]">
              <span className="text-[11px] text-[#D97B4F] tracking-wider font-medium">
                Module 05
              </span>
            </div>
          </div>
        </div>

        {/* ── Page header ── */}
        <div className="px-12 pt-12 pb-10 border-b border-[#E0D8CF]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-6 bg-[#D97B4F]" style={{ height: "1.5px" }} />
            <span className="text-[11px] font-medium tracking-[0.18em] text-[#D97B4F] uppercase">
              Federated query audit log
            </span>
          </div>
          <div className="flex items-end justify-between gap-10">
            <div>
              <h1 className="font-playfair text-[52px] font-black leading-[0.92] tracking-tight text-[#1A1612] mb-4">
                SQL <em className="text-[#8B5E3C]">Trace.</em>
              </h1>
              <p className="text-[14px] font-light text-[#6B5E52] leading-[1.75] max-w-[400px]">
                Every Coral federated query — sources hit, execution timing, and
                cache status.
              </p>
            </div>

            {/* Stat chips */}
            <div className="flex items-baseline gap-2 flex-wrap justify-end">
              {[
                { num: total, lbl: "Total queries" },
                { num: `${avgMs}ms`, lbl: "Avg latency" },
                { num: cacheHits, lbl: "Cache hits" },
                { num: multiSrc, lbl: "Multi-source" },
              ].map(({ num, lbl }) => (
                <div
                  key={lbl}
                  className="flex items-baseline gap-2 bg-[#EDE7DF] border border-[#D8CEBF] rounded-md px-4 py-2.5 whitespace-nowrap"
                >
                  <span className="font-playfair text-[20px] font-bold text-[#1A1612]">
                    {num}
                  </span>
                  <span className="text-[10px] text-[#9B8E82] tracking-wide font-normal">
                    {lbl}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="px-12 py-4 border-b border-[#E0D8CF] flex items-center gap-4 flex-wrap bg-[#F7F3EE]">
          <div className="flex items-center gap-2">
            <div className="w-3 bg-[#D97B4F]" style={{ height: "1.5px" }} />
            <span className="text-[10px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">
              Filter
            </span>
          </div>

          {/* Source filter */}
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="bg-white border border-[#E0D8CF] rounded-md px-3 py-1.5 text-[12px] text-[#4A3E35] font-outfit outline-none focus:border-[#D97B4F] transition-colors cursor-pointer"
          >
            <option value="all">All sources</option>
            {allSources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Cache filter */}
          <select
            value={filterCache}
            onChange={(e) => setFilterCache(e.target.value)}
            className="bg-white border border-[#E0D8CF] rounded-md px-3 py-1.5 text-[12px] text-[#4A3E35] font-outfit outline-none focus:border-[#D97B4F] transition-colors cursor-pointer"
          >
            <option value="all">Cache: all</option>
            <option value="hit">Cache: hit</option>
            <option value="miss">Cache: miss</option>
          </select>

          <span className="ml-auto text-[11px] text-[#C4B8AC] tracking-wide font-outfit">
            {filtered.length} of {traces.length} shown
          </span>
        </div>

        {/* ── Content ── */}
        <div className="px-12 py-8 pb-28">
          {/* Loading */}
          {loading && (
            <div className="text-center py-32">
              <div className="text-[11px] tracking-[0.2em] text-[#9B8E82] mb-6 uppercase">
                Loading traces…
              </div>
              <div className="flex justify-center gap-2">
                {["SQL", "CACHE", "TIMING", "SOURCES"].map((s, i) => (
                  <div
                    key={s}
                    className="px-3 py-1.5 border border-[#D8CEBF] rounded-full text-[10px] tracking-widest text-[#C4B8AC] font-outfit"
                    style={{
                      animation: `pulse-dot 1.5s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="bg-[#F5E8E8] border border-[#E8C8C8] rounded-xl p-8 text-center">
              <div className="font-playfair text-4xl text-[#E8C8C8] mb-3">
                ⚠
              </div>
              <p className="font-playfair text-xl font-bold text-[#C0392B] mb-2">
                Connection Error
              </p>
              <p className="text-[12px] font-light text-[#9B8E82] mb-1">
                {error}
              </p>
              <p className="text-[11px] text-[#C4B8AC]">
                Is the backend running on port 8000?
              </p>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-32">
              <div className="font-playfair text-7xl text-[#E0D8CF] mb-5">
                ⬡
              </div>
              <div className="text-[11px] tracking-[0.2em] text-[#C4B8AC] font-outfit uppercase mb-2">
                No traces found
              </div>
              {total === 0 && (
                <p className="text-[12px] font-light text-[#C4B8AC]">
                  Run an investigation to populate the log.
                </p>
              )}
            </div>
          )}

          {/* Table */}
          {!loading && !error && filtered.length > 0 && (
            <div className="border border-[#E0D8CF] rounded-xl overflow-hidden">
              {/* Table header */}
              <div
                className="grid bg-[#EDE7DF] border-b border-[#E0D8CF] px-6 py-3"
                style={{
                  gridTemplateColumns: "48px 1fr 200px 90px 80px 110px",
                }}
              >
                {["#", "SQL Query", "Sources Hit", "Exec", "Cache", "Time"].map(
                  (h) => (
                    <div
                      key={h}
                      className="text-[10px] font-medium tracking-[0.15em] text-[#9B8E82] uppercase font-outfit"
                    >
                      {h}
                    </div>
                  ),
                )}
              </div>

              {/* Rows */}
              {filtered.map((trace, idx) => {
                const sources = parseSources(trace.sources_hit);
                const isMulti = sources.length > 1;
                return (
                  <div
                    key={trace.id}
                    className="trace-row fade-in grid border-b border-[#E0D8CF] px-6 py-4 items-start gap-3"
                    style={{
                      gridTemplateColumns: "48px 1fr 200px 90px 80px 110px",
                      background: idx % 2 === 0 ? "#F7F3EE" : "#FFFFFF",
                    }}
                  >
                    {/* Row number */}
                    <div className="text-[11px] text-[#C4B8AC] font-outfit pt-0.5">
                      {offset + idx + 1}
                    </div>

                    {/* SQL */}
                    <div>
                      {isMulti && (
                        <div className="inline-flex items-center gap-1.5 bg-[#EDE8F5] border border-[#D5C8EC] rounded-full px-2.5 py-0.5 mb-2">
                          <span className="text-[9px] font-semibold tracking-widest text-[#7B58B8] font-outfit">
                            ⬡ FEDERATED · {sources.length} SOURCES
                          </span>
                        </div>
                      )}
                      <SqlBlock sql={trace.query_text ?? "—"} />
                    </div>

                    {/* Sources */}
                    <div className="flex flex-wrap gap-1.5 content-start">
                      {sources.length > 0 ? (
                        sources.map((s) => (
                          <span
                            key={s}
                            className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wide border font-outfit ${getSourceStyle(s)}`}
                          >
                            {s.toUpperCase()}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-[#C4B8AC]">—</span>
                      )}
                    </div>

                    {/* Exec ms */}
                    <div className="pt-0.5">
                      {trace.execution_ms != null ? (
                        <span
                          className={`font-playfair text-[18px] font-bold ${getExecColor(trace.execution_ms)}`}
                        >
                          {trace.execution_ms}
                          <span className="text-[10px] text-[#C4B8AC] font-outfit font-normal ml-0.5">
                            ms
                          </span>
                        </span>
                      ) : (
                        <span className="text-[#C4B8AC]">—</span>
                      )}
                    </div>

                    {/* Cache */}
                    <div className="pt-1">
                      {trace.cache_hit === true ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-widest bg-[#E3F0E8] text-[#3B8A52] border border-[#C0DCC8] font-outfit">
                          HIT
                        </span>
                      ) : trace.cache_hit === false ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-widest bg-[#F5EDD8] text-[#A87820] border border-[#E8D5A0] font-outfit">
                          MISS
                        </span>
                      ) : (
                        <span className="text-[#C4B8AC] text-[11px]">—</span>
                      )}
                    </div>

                    {/* Time */}
                    <div>
                      <div className="text-[12px] text-[#6B5E52] font-outfit">
                        {formatTime(trace.created_at)}
                      </div>
                      <div className="text-[10px] text-[#C4B8AC] font-outfit mt-0.5">
                        {formatDate(trace.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Pagination inside table frame */}
              {totalPages > 1 && (
                <div className="bg-[#EDE7DF] border-t border-[#E0D8CF] px-6 py-3 flex items-center justify-between">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                    disabled={offset === 0}
                    className="text-[11px] font-medium tracking-wide text-[#9B8E82] hover:text-[#D97B4F] transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-outfit"
                  >
                    ← Prev
                  </button>
                  <span className="text-[11px] text-[#C4B8AC] tracking-widest font-outfit">
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setOffset(offset + LIMIT)}
                    disabled={offset + LIMIT >= total}
                    className="text-[11px] font-medium tracking-wide text-[#9B8E82] hover:text-[#D97B4F] transition-colors disabled:opacity-30 disabled:cursor-not-allowed font-outfit"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Source legend ── */}
          {!loading && !error && (
            <div className="mt-8 flex items-center gap-6 flex-wrap border border-[#E0D8CF] rounded-xl px-6 py-4 bg-white">
              <div className="flex items-center gap-2">
                <div className="w-3 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                <span className="text-[10px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase font-outfit">
                  Source Legend
                </span>
              </div>
              {Object.entries(SOURCE_STYLES).map(([src, style]) => (
                <span key={src} className="flex items-center gap-2">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wide border font-outfit ${style}`}
                  >
                    {src.toUpperCase()}
                  </span>
                </span>
              ))}
              <span className="ml-auto text-[10px] text-[#C4B8AC] font-outfit tracking-wide">
                ⬡ Federated = query spans multiple sources
              </span>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="bg-white/50 backdrop-blur-sm px-12 py-5 fixed bottom-0 left-0 right-0 border-t border-[#E0D8CF]">
          <div className="flex justify-center w-full gap-8 flex-wrap">
            {[
              { key: "Coral", val: "4 sources" },
              { key: "Neo4j", val: "port 7687" },
              { key: "API", val: "port 8000" },
              { key: "Model", val: "GROQ - llama-3.3-70b-versatile" },
              { key: "Developed by", val: "Partha Chakraborty, Dhvani Dave" },
            ].map(({ key, val }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] tracking-widest text-[#3A3430] uppercase">
                  {key}
                </span>
                <div className="w-px h-2.5 bg-[#3A3430]" />
                <span className="text-[10px] text-[#6B5E52] tracking-wide">
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
