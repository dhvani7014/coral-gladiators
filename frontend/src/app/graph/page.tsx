"use client";

import { useEffect, useRef, useState } from "react";

const NEO4J_HTTP = "http://localhost:7474";
const NEO4J_USER = "neo4j";
const NEO4J_PASS = "sentinel123";

const NODE_COLORS: Record<string, { bg: string; border: string }> = {
    Entity: { bg: "#ef4444", border: "#b91c1c" },
    Transaction: { bg: "#4b5563", border: "#374151" },
    SanctionList: { bg: "#f97316", border: "#c2410c" },
    Email: { bg: "#3b82f6", border: "#1d4ed8" },
    SlackMessage: { bg: "#8b5cf6", border: "#6d28d9" },
};

const PRESET_QUERIES = [
    { label: "Full Graph", cypher: "MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 100" },
    { label: "Fraud Chain", cypher: "MATCH (e:Entity)-[:INITIATED]->(t:Transaction)-[:SENT_TO]->(v:Entity) RETURN e,t,v LIMIT 50" },
    { label: "Sanctioned", cypher: "MATCH (e:Entity)-[:INITIATED]->(t:Transaction)-[:INVOLVES_SANCTIONED]->(v:Entity) RETURN e,t,v" },
    { label: "Emails", cypher: "MATCH (e:Entity)-[:SENT_EMAIL]->(m:Email) RETURN e,m LIMIT 30" },
    { label: "Slack", cypher: "MATCH (e:Entity)-[:POSTED]->(s:SlackMessage) RETURN e,s" },
];

// ── Neo4j HTTP query ────────────────────────────────────────────────────────

async function runCypher(cypher: string) {
    const auth = btoa(`${NEO4J_USER}:${NEO4J_PASS}`);
    const res = await fetch(`${NEO4J_HTTP}/db/neo4j/tx/commit`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${auth}`,
            "Accept": "application/json",
        },
        body: JSON.stringify({ statements: [{ statement: cypher }] }),
    });
    if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}: ${await res.text()}`);
    return res.json();
}

// ── Parse Neo4j HTTP response into vis-network nodes/edges ──────────────────

function parseResponse(data: any) {
    const nodesMap = new Map<string, any>();
    const edgesMap = new Map<string, any>();

    for (const result of data.results ?? []) {
        for (const row of result.data ?? []) {
            for (const cell of row.graph?.nodes ?? []) {
                if (nodesMap.has(cell.id)) continue;
                const label = cell.labels?.[0] ?? "Node";
                const props = cell.properties ?? {};
                const colors = NODE_COLORS[label] ?? { bg: "#6b7280", border: "#4b5563" };
                const caption =
                    props.name ?? props.transaction_id ?? props.subject ??
                    props.message ?? props.source ?? cell.id;

                nodesMap.set(cell.id, {
                    id: cell.id,
                    label: String(caption).slice(0, 30),
                    title: Object.entries(props)
                        .map(([k, v]) => `<b>${k}</b>: ${v}`)
                        .join("<br>"),
                    color: {
                        background: colors.bg, border: colors.border,
                        highlight: { background: colors.bg, border: "#fff" }
                    },
                    font: { color: "#f3f4f6", size: 12, face: "monospace" },
                    size: label === "SanctionList" ? 30 : label === "Entity" ? 22 : 14,
                    shape: "dot",
                    _label: label,
                    _props: props,
                });
            }

            for (const cell of row.graph?.relationships ?? []) {
                const key = cell.id;
                if (edgesMap.has(key)) continue;
                edgesMap.set(key, {
                    id: key,
                    from: cell.startNode,
                    to: cell.endNode,
                    label: cell.type,
                    font: { color: "#9ca3af", size: 9, face: "monospace", align: "middle" },
                    color: { color: "#374151", highlight: "#6b7280" },
                    arrows: { to: { enabled: true, scaleFactor: 0.5 } },
                    smooth: { type: "curvedCW", roundness: 0.15 },
                    _type: cell.type,
                    _props: cell.properties ?? {},
                });
            }
        }
    }

    return {
        nodes: Array.from(nodesMap.values()),
        edges: Array.from(edgesMap.values()),
    };
}

// ── Load vis-network from CDN ───────────────────────────────────────────────

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

// ── Component ───────────────────────────────────────────────────────────────

export default function GraphPage() {
    const canvasRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<any>(null);
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [nodeCount, setNodeCount] = useState(0);
    const [edgeCount, setEdgeCount] = useState(0);
    const [selected, setSelected] = useState<Record<string, any> | null>(null);
    const [query, setQuery] = useState(PRESET_QUERIES[0].cypher);

    const buildGraph = async (cypher: string) => {
        if (!canvasRef.current) return;
        setStatus("loading");
        setSelected(null);

        try {
            // 1. query Neo4j over HTTP
            const raw = await runCypher(
                // ask for graph format
                cypher.includes("RETURN")
                    ? cypher.replace(/RETURN\s+/i, "RETURN ")
                    : cypher
            );

            // Neo4j HTTP needs graph format — re-run with graph result dataContents
            const auth = btoa(`${NEO4J_USER}:${NEO4J_PASS}`);
            const res2 = await fetch(`${NEO4J_HTTP}/db/neo4j/tx/commit`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Basic ${auth}`,
                    "Accept": "application/json",
                },
                body: JSON.stringify({
                    statements: [{
                        statement: cypher,
                        resultDataContents: ["graph"],
                    }],
                }),
            });
            const data = await res2.json();

            if (data.errors?.length > 0) {
                throw new Error(data.errors[0].message);
            }

            const { nodes, edges } = parseResponse(data);

            if (nodes.length === 0) {
                setStatus("ready");
                setNodeCount(0);
                setEdgeCount(0);
                return;
            }

            // 2. load vis-network
            const vis = await loadVis();

            // 3. destroy old network
            if (networkRef.current) {
                networkRef.current.destroy();
                networkRef.current = null;
            }

            // 4. render
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
                    interaction: {
                        hover: true,
                        tooltipDelay: 80,
                        zoomView: true,
                        dragView: true,
                    },
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

    useEffect(() => {
        buildGraph(query);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 font-mono flex flex-col">

            {/* Top bar */}
            <div className="border-b border-gray-800 px-8 py-4 flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-white">Graph Explorer</h1>
                    <p className="text-gray-500 text-xs mt-0.5">Neo4j relationship network · SentinelAI</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                    {status === "loading" && <span className="text-blue-400 animate-pulse">● Rendering...</span>}
                    {status === "ready" && (
                        <>
                            <span className="text-green-400">● Connected</span>
                            <span className="text-gray-500">{nodeCount} nodes · {edgeCount} edges</span>
                        </>
                    )}
                    {status === "error" && (
                        <span className="text-red-400">● Error — see panel</span>
                    )}
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 65px)" }}>

                {/* Sidebar */}
                <div className="w-56 border-r border-gray-800 flex flex-col gap-5 p-4 overflow-y-auto flex-shrink-0">

                    <div>
                        <p className="text-xs font-bold text-gray-500 tracking-widest mb-2">VIEWS</p>
                        <div className="space-y-1">
                            {PRESET_QUERIES.map(pq => (
                                <button
                                    key={pq.label}
                                    onClick={() => { setQuery(pq.cypher); buildGraph(pq.cypher); }}
                                    className="w-full text-left text-xs px-3 py-2 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
                                >
                                    {pq.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-bold text-gray-500 tracking-widest mb-2">NODE TYPES</p>
                        <div className="space-y-2">
                            {Object.entries(NODE_COLORS).map(([label, c]) => (
                                <div key={label} className="flex items-center gap-2 text-xs text-gray-400">
                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.bg }} />
                                    {label}
                                </div>
                            ))}
                        </div>
                    </div>

                    {selected && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-gray-500 tracking-widest">SELECTED</p>
                                <button onClick={() => setSelected(null)} className="text-xs text-gray-600 hover:text-gray-400">✕</button>
                            </div>
                            <div className="bg-gray-900 rounded-lg p-3 space-y-2">
                                {Object.entries(selected).map(([k, v]) => (
                                    <div key={k}>
                                        <p className="text-xs text-gray-500">{k}</p>
                                        <p className="text-xs text-gray-200 break-all">
                                            {typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Graph canvas */}
                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Cypher bar */}
                    <div className="border-b border-gray-800 p-3 flex gap-2 flex-shrink-0">
                        <input
                            className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-green-400 placeholder-gray-600 focus:outline-none focus:border-gray-600 font-mono"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && buildGraph(query)}
                            placeholder="MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 100"
                        />
                        <button
                            onClick={() => buildGraph(query)}
                            disabled={status === "loading"}
                            className="bg-white text-gray-950 px-4 py-2 rounded text-xs font-bold hover:bg-gray-200 disabled:opacity-30 transition-colors"
                        >
                            Run
                        </button>
                    </div>

                    {/* Canvas */}
                    <div className="flex-1 relative overflow-hidden bg-gray-950">
                        {status === "loading" && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                <p className="text-gray-500 text-sm animate-pulse">Loading graph...</p>
                            </div>
                        )}
                        {status === "error" && (
                            <div className="absolute inset-0 flex items-center justify-center z-10">
                                <div className="text-center space-y-3 p-8">
                                    <p className="text-red-400 text-sm font-bold">Graph Error</p>
                                    <p className="text-gray-500 text-xs max-w-sm break-all">{errorMsg}</p>
                                    <button
                                        onClick={() => buildGraph(query)}
                                        className="text-xs bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded text-gray-300"
                                    >
                                        Retry
                                    </button>
                                </div>
                            </div>
                        )}
                        {status === "ready" && nodeCount === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                <p className="text-gray-600 text-sm">No nodes returned for this query</p>
                            </div>
                        )}
                        <div ref={canvasRef} className="w-full h-full" />
                    </div>
                </div>
            </div>
        </div>
    );
}