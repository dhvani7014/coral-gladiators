"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const NEO4J_HTTP = "http://localhost:7474";
const NEO4J_USER = "neo4j";
const NEO4J_PASS = "sentinel123";

const NODE_COLORS: Record<string, { bg: string; border: string; label: string; style: string }> = {
    Entity: { bg: "#D97B4F", border: "#8B5E3C", label: "Entity", style: "bg-[#F5EAE0] text-[#D97B4F] border border-[#E8CDB8]" },
    Transaction: { bg: "#A87820", border: "#7A5810", label: "Transaction", style: "bg-[#F5EDD8] text-[#A87820] border border-[#E8D5A0]" },
    SanctionList: { bg: "#C0392B", border: "#8B1A1A", label: "Sanction", style: "bg-[#F5E8E8] text-[#C0392B] border border-[#E8C8C8]" },
    Email: { bg: "#3B72B8", border: "#1A4A8A", label: "Email", style: "bg-[#E3EDF8] text-[#3B72B8] border border-[#C8DCF0]" },
    SlackMessage: { bg: "#7B58B8", border: "#5A3A8A", label: "Slack", style: "bg-[#EDE8F5] text-[#7B58B8] border border-[#D5C8EC]" },
};

const PRESET_QUERIES = [
    { label: "Full Graph", code: "01", cypher: "MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 100" },
    { label: "Fraud Chain", code: "02", cypher: "MATCH (e:Entity)-[:INITIATED]->(t:Transaction)-[:SENT_TO]->(v:Entity) RETURN e,t,v LIMIT 50" },
    { label: "Sanctioned", code: "03", cypher: "MATCH (e:Entity)-[:INITIATED]->(t:Transaction)-[:INVOLVES_SANCTIONED]->(v:Entity) RETURN e,t,v" },
    { label: "Emails", code: "04", cypher: "MATCH (e:Entity)-[:SENT_EMAIL]->(m:Email) RETURN e,m LIMIT 30" },
    { label: "Slack", code: "05", cypher: "MATCH (e:Entity)-[:POSTED]->(s:SlackMessage) RETURN e,s" },
];

// ── Neo4j HTTP query ──────────────────────────────────────────────────────────
async function runCypher(cypher: string) {
    const auth = btoa(`${NEO4J_USER}:${NEO4J_PASS}`);
    const res = await fetch(`${NEO4J_HTTP}/db/neo4j/tx/commit`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${auth}`,
            "Accept": "application/json",
        },
        body: JSON.stringify({
            statements: [{ statement: cypher, resultDataContents: ["graph"] }],
        }),
    });
    if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Parse response ────────────────────────────────────────────────────────────
function parseResponse(data: any) {
    const nodesMap = new Map<string, any>();
    const edgesMap = new Map<string, any>();

    for (const result of data.results ?? []) {
        for (const row of result.data ?? []) {
            for (const cell of row.graph?.nodes ?? []) {
                if (nodesMap.has(cell.id)) continue;
                const label = cell.labels?.[0] ?? "Node";
                const props = cell.properties ?? {};
                const colors = NODE_COLORS[label] ?? { bg: "#9B8E82", border: "#6B5E52" };
                const caption =
                    props.name ?? props.transaction_id ?? props.subject ??
                    props.message ?? props.source ?? cell.id;

                nodesMap.set(cell.id, {
                    id: cell.id,
                    label: String(caption).slice(0, 28),
                    title: Object.entries(props).map(([k, v]) => `<b>${k}</b>: ${v}`).join("<br>"),
                    color: {
                        background: colors.bg,
                        border: colors.border,
                        highlight: { background: colors.bg, border: "#1A1612" },
                    },
                    font: { color: "#F7F3EE", size: 11, face: "Outfit, sans-serif" },
                    size: label === "SanctionList" ? 28 : label === "Entity" ? 20 : 13,
                    shape: "dot",
                    _label: label,
                    _props: props,
                });
            }

            for (const cell of row.graph?.relationships ?? []) {
                if (edgesMap.has(cell.id)) continue;
                edgesMap.set(cell.id, {
                    id: cell.id,
                    from: cell.startNode,
                    to: cell.endNode,
                    label: cell.type,
                    font: { color: "#9B8E82", size: 9, face: "Outfit, sans-serif", align: "middle" },
                    color: { color: "#D8CEBF", highlight: "#D97B4F" },
                    arrows: { to: { enabled: true, scaleFactor: 0.5 } },
                    smooth: { type: "curvedCW", roundness: 0.15 },
                    _type: cell.type,
                    _props: cell.properties ?? {},
                });
            }
        }
    }

    return { nodes: Array.from(nodesMap.values()), edges: Array.from(edgesMap.values()) };
}

// ── Load vis-network ──────────────────────────────────────────────────────────
function loadVis(): Promise<any> {
    return new Promise((resolve, reject) => {
        if ((window as any).vis) { resolve((window as any).vis); return; }
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.9/dist/vis-network.min.css";
        document.head.appendChild(link);
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.9/dist/vis-network.min.js";
        script.onload = () => (window as any).vis ? resolve((window as any).vis) : reject(new Error("vis not on window"));
        script.onerror = () => reject(new Error("Failed to load vis-network"));
        document.head.appendChild(script);
    });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GraphPage() {
    const canvasRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<any>(null);
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [nodeCount, setNodeCount] = useState(0);
    const [edgeCount, setEdgeCount] = useState(0);
    const [selected, setSelected] = useState<Record<string, any> | null>(null);
    const [query, setQuery] = useState(PRESET_QUERIES[0].cypher);
    const [activePreset, setActivePreset] = useState(0);

    const buildGraph = async (cypher: string) => {
        if (!canvasRef.current) return;
        setStatus("loading");
        setSelected(null);

        try {
            const data = await runCypher(cypher);
            if (data.errors?.length > 0) throw new Error(data.errors[0].message);

            const { nodes, edges } = parseResponse(data);

            const vis = await loadVis();
            if (networkRef.current) { networkRef.current.destroy(); networkRef.current = null; }

            const network = new vis.Network(
                canvasRef.current,
                { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) },
                {
                    physics: {
                        enabled: true,
                        solver: "forceAtlas2Based",
                        forceAtlas2Based: { gravitationalConstant: -60, springLength: 130, springConstant: 0.05 },
                        stabilization: { iterations: 150, updateInterval: 25 },
                    },
                    interaction: { hover: true, tooltipDelay: 80, zoomView: true, dragView: true },
                    nodes: { borderWidth: 2 },
                    edges: { width: 1.5 },
                }
            );

            network.on("click", (params: any) => {
                if (params.nodes?.length > 0) {
                    const id = params.nodes[0];
                    const node = nodes.find((n: any) => n.id === id);
                    if (node) setSelected({ _label: node._label, ...node._props });
                } else if (params.edges?.length > 0) {
                    const id = params.edges[0];
                    const edge = edges.find((e: any) => e.id === id);
                    if (edge) setSelected({ _type: edge._type, ...edge._props });
                } else {
                    setSelected(null);
                }
            });

            networkRef.current = network;
            setNodeCount(nodes.length);
            setEdgeCount(edges.length);
            setStatus("ready");

        } catch (err: any) {
            setErrorMsg(err.message ?? String(err));
            setStatus("error");
        }
    };

    useEffect(() => { buildGraph(query); }, []);

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Outfit:wght@300;400;500;600&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-outfit   { font-family: 'Outfit', sans-serif; }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 2s linear infinite; }
        .preset-btn:hover .preset-arrow { opacity: 1; transform: translateX(0); }
        .preset-btn:hover .preset-num  { color: #D97B4F; }
        .preset-arrow { opacity: 0; transform: translateX(-4px); transition: all 0.15s; }
        .preset-num   { transition: color 0.15s; }

        /* Override vis-network tooltip to match theme */
        .vis-tooltip {
          font-family: 'Outfit', sans-serif !important;
          font-size: 12px !important;
          background: #1A1612 !important;
          border: 1px solid #3A3430 !important;
          color: #C4B8AC !important;
          border-radius: 6px !important;
          padding: 8px 10px !important;
        }
      `}</style>

            <div className="font-outfit bg-[#F7F3EE] text-[#1A1612] flex flex-col" style={{ height: "100vh" }}>

                {/* ── Top bar ── */}
                <div className="bg-[#1A1612] flex items-center justify-between px-12 h-[52px] flex-shrink-0">
                    <div className="flex items-center gap-6">
                        <Link href="/">
                            <span className="font-outfit font-semibold text-sm tracking-widest text-[#F7F3EE] uppercase cursor-pointer">
                                Sentinel
                            </span>
                        </Link>
                        <div className="w-px h-4 bg-[#3A3430]" />
                        <span className="text-[11px] text-[#6B5E52] tracking-wide">Graph Explorer</span>
                    </div>
                    <div className="flex items-center gap-5">
                        {status === "loading" && (
                            <div className="flex items-center gap-2 bg-[#2A2420] border border-[#3A3430] rounded-full px-3 py-[5px]">
                                <div className="w-1.5 h-1.5 rounded-full border border-[#D97B4F] animate-spin-slow" />
                                <span className="text-[11px] text-[#D97B4F] tracking-wider font-medium">Rendering…</span>
                            </div>
                        )}
                        {status === "ready" && (
                            <div className="flex items-center gap-2 bg-[#2A2420] border border-[#3A3430] rounded-full px-3 py-[5px]">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#3B8A52] animate-pulse-dot" />
                                <span className="text-[11px] text-[#3B8A52] tracking-wider font-medium">Connected</span>
                            </div>
                        )}
                        {status === "error" && (
                            <div className="flex items-center gap-2 bg-[#2A2420] border border-[#3A3430] rounded-full px-3 py-[5px]">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#C0392B]" />
                                <span className="text-[11px] text-[#C0392B] tracking-wider font-medium">Error</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 bg-[#2A2420] border border-[#3A3430] rounded-full px-3 py-[5px]">
                            <span className="text-[11px] text-[#D97B4F] tracking-wider font-medium">Module 04</span>
                        </div>
                    </div>
                </div>

                {/* ── Page header ── */}
                <div className="px-12 pt-8 pb-6 border-b border-[#E0D8CF] flex-shrink-0 grid grid-cols-[1fr_auto] items-end gap-8">
                    <div>
                        <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-6 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                            <span className="text-[11px] font-medium tracking-[0.18em] text-[#D97B4F] uppercase">
                                Neo4j relationship network
                            </span>
                        </div>
                        <h1 className="font-playfair text-[42px] font-black leading-[0.95] tracking-tight text-[#1A1612]">
                            Graph <em className="text-[#8B5E3C]">Explorer.</em>
                        </h1>
                    </div>

                    {/* Stats strip */}
                    {status === "ready" && (
                        <div className="flex items-baseline gap-2">
                            {[
                                { num: nodeCount, lbl: "Nodes" },
                                { num: edgeCount, lbl: "Edges" },
                            ].map(({ num, lbl }) => (
                                <div key={lbl} className="flex items-baseline gap-2 bg-[#EDE7DF] border border-[#D8CEBF] rounded-md px-4 py-2.5 whitespace-nowrap">
                                    <span className="font-playfair text-[22px] font-bold text-[#1A1612]">{num}</span>
                                    <span className="text-[11px] text-[#9B8E82] tracking-wide font-normal">{lbl}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Main layout ── */}
                <div className="flex flex-1 overflow-hidden">

                    {/* ── Sidebar ── */}
                    <div className="w-56 border-r border-[#E0D8CF] flex flex-col flex-shrink-0 overflow-y-auto bg-[#F7F3EE]">

                        {/* Preset views */}
                        <div className="border-b border-[#E0D8CF]">
                            <div className="px-5 py-3 flex items-center gap-2">
                                <div className="w-3 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                                <span className="text-[10px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">Views</span>
                            </div>
                            {PRESET_QUERIES.map((pq, i) => (
                                <button
                                    key={pq.label}
                                    onClick={() => { setActivePreset(i); setQuery(pq.cypher); buildGraph(pq.cypher); }}
                                    className={`preset-btn w-full text-left flex items-center justify-between px-5 py-3 border-b border-[#E0D8CF] transition-colors duration-150
                    ${activePreset === i ? "bg-[#EDE7DF]" : "hover:bg-[#F0E9E0]"}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="preset-num text-[10px] font-medium tracking-[0.12em] text-[#C4B8AC]">{pq.code}</span>
                                        <span className="text-[12px] font-medium text-[#4A3E35]">{pq.label}</span>
                                    </div>
                                    <span className="preset-arrow text-[11px] text-[#D97B4F]">→</span>
                                </button>
                            ))}
                        </div>

                        {/* Node legend */}
                        <div className="border-b border-[#E0D8CF]">
                            <div className="px-5 py-3 flex items-center gap-2">
                                <div className="w-3 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                                <span className="text-[10px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">Node Types</span>
                            </div>
                            <div className="px-5 pb-4 flex flex-col gap-2.5">
                                {Object.entries(NODE_COLORS).map(([label, c]) => (
                                    <div key={label} className="flex items-center gap-2.5">
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border" style={{ backgroundColor: c.bg, borderColor: c.border }} />
                                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${c.style}`}>{c.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Selected node panel */}
                        {selected && (
                            <div className="flex-1">
                                <div className="px-5 py-3 flex items-center justify-between border-b border-[#E0D8CF]">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                                        <span className="text-[10px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">Selected</span>
                                    </div>
                                    <button
                                        onClick={() => setSelected(null)}
                                        className="text-[11px] text-[#C4B8AC] hover:text-[#D97B4F] transition-colors"
                                    >✕</button>
                                </div>
                                <div className="px-5 py-4 flex flex-col gap-3">
                                    {Object.entries(selected).map(([k, v]) => (
                                        <div key={k}>
                                            <p className="text-[10px] tracking-[0.12em] text-[#C4B8AC] uppercase mb-0.5">{k}</p>
                                            <p className="text-[12px] font-light text-[#4A3E35] break-all leading-snug">
                                                {typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Empty selected hint */}
                        {!selected && status === "ready" && (
                            <div className="px-5 py-5">
                                <p className="text-[11px] font-light text-[#C4B8AC] leading-relaxed">
                                    Click any node or edge to inspect its properties.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ── Graph canvas area ── */}
                    <div className="flex-1 flex flex-col overflow-hidden">

                        {/* Cypher bar */}
                        <div className="border-b border-[#E0D8CF] px-6 py-3 flex gap-3 flex-shrink-0 bg-[#F7F3EE]">
                            <div className="flex items-center gap-2 text-[10px] text-[#C4B8AC] tracking-widest uppercase flex-shrink-0 self-center">
                                Cypher
                                <div className="w-px h-3 bg-[#E0D8CF]" />
                            </div>
                            <input
                                className="flex-1 bg-white border border-[#E0D8CF] rounded-md px-4 py-2.5 text-[12px] text-[#4A3E35] font-outfit outline-none focus:border-[#D97B4F] transition-colors placeholder:text-[#C4B8AC]"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && buildGraph(query)}
                                placeholder="MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 100"
                            />
                            <button
                                onClick={() => buildGraph(query)}
                                disabled={status === "loading"}
                                className={`px-6 py-2.5 rounded-md text-[11px] font-semibold tracking-widest transition-all whitespace-nowrap
                  ${status === "loading"
                                        ? "bg-[#EDE7DF] text-[#C4B8AC] cursor-not-allowed"
                                        : "bg-[#1A1612] hover:bg-[#2A2420] text-[#F7F3EE] cursor-pointer"
                                    }`}
                            >
                                {status === "loading" ? "RUNNING…" : "RUN"}
                            </button>
                        </div>

                        {/* Canvas */}
                        <div className="flex-1 relative overflow-hidden bg-[#FDFAF7]">

                            {/* Subtle dot-grid background */}
                            <div className="absolute inset-0 pointer-events-none" style={{
                                backgroundImage: "radial-gradient(circle, #D8CEBF 1px, transparent 1px)",
                                backgroundSize: "28px 28px",
                                opacity: 0.5,
                            }} />

                            {/* Loading overlay */}
                            {status === "loading" && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none gap-5">
                                    <div className="flex gap-2">
                                        {["ENTITY", "TXNS", "GRAPH", "EDGES", "LAYOUT"].map((s, i) => (
                                            <div key={s}
                                                className="px-3 py-1.5 border border-[#D8CEBF] rounded-full text-[10px] tracking-widest text-[#C4B8AC] font-outfit bg-white/60"
                                                style={{ animation: `agent-pulse 1.5s ease-in-out ${i * 0.2}s infinite` }}
                                            >
                                                {s}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-[11px] tracking-[0.2em] text-[#C4B8AC] uppercase font-outfit">
                                        Building relationship map…
                                    </p>
                                </div>
                            )}

                            {/* Error overlay */}
                            {status === "error" && (
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <div className="text-center bg-white border border-[#E0D8CF] rounded-xl p-10 shadow-sm max-w-sm mx-auto">
                                        <div className="font-playfair text-5xl text-[#E0D8CF] mb-4">⚠</div>
                                        <p className="font-playfair text-xl font-bold text-[#C0392B] mb-2">Graph Error</p>
                                        <p className="text-[12px] font-light text-[#9B8E82] break-all mb-6 leading-relaxed">{errorMsg}</p>
                                        <button
                                            onClick={() => buildGraph(query)}
                                            className="px-6 py-2.5 bg-[#1A1612] hover:bg-[#2A2420] text-[#F7F3EE] rounded-md text-[11px] font-semibold tracking-widest transition-all"
                                        >
                                            RETRY
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Empty state */}
                            {status === "ready" && nodeCount === 0 && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none gap-3">
                                    <div className="font-playfair text-6xl text-[#E0D8CF]">⬡</div>
                                    <p className="text-[11px] tracking-[0.2em] text-[#C4B8AC] uppercase font-outfit">
                                        No nodes returned for this query
                                    </p>
                                </div>
                            )}

                            <div ref={canvasRef} className="w-full h-full" />
                        </div>
                    </div>
                </div>

                {/* ── Footer (identical to home) ── */}
                <div className="bg-white/50 backdrop-blur-sm px-12 py-4 flex items-center border-t border-[#E0D8CF] flex-shrink-0">
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

            <style>{`
        @keyframes agent-pulse {
          0%, 100% { opacity: 0.25; }
          50%       { opacity: 1; border-color: #D97B4F; color: #D97B4F; }
        }
      `}</style>
        </>
    );
}