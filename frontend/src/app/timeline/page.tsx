"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const TYPE_CONFIG = {
    transaction: {
        icon: "💸",
        color: "border-yellow-500",
        badge: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
        dot: "bg-yellow-500",
        label: "TRANSACTION",
    },
    email: {
        icon: "✉️",
        color: "border-blue-500",
        badge: "bg-blue-500/10 text-blue-400 border border-blue-500/30",
        dot: "bg-blue-500",
        label: "EMAIL",
    },
    slack: {
        icon: "💬",
        color: "border-purple-500",
        badge: "bg-purple-500/10 text-purple-400 border border-purple-500/30",
        dot: "bg-purple-500",
        label: "SLACK",
    },
    sanction: {
        icon: "🚨",
        color: "border-red-500",
        badge: "bg-red-500/10 text-red-400 border border-red-500/30",
        dot: "bg-red-500",
        label: "SANCTIONS HIT",
    },
} as const;

type EventType = keyof typeof TYPE_CONFIG;

interface TimelineEvent {
    type: EventType;
    timestamp: string | null;
    title: string;
    summary: string;
    detail: Record<string, unknown>;
}

function formatTimestamp(ts: string | null) {
    if (!ts) return "Unknown date";
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function EventCard({ event, index }: { event: TimelineEvent; index: number }) {
    const [expanded, setExpanded] = useState(false);
    const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.transaction;

    return (
        <div className={`relative ml-4 border-l-2 pl-6 pb-8 ${cfg.color}`}>
            {/* Timeline dot */}
            <div
                className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-2 border-[#020817] ${cfg.dot}`}
            />

            {/* Event number */}
            <div className="absolute -left-8 top-1 text-[10px] font-mono text-[#333]">
                {String(index + 1).padStart(2, "0")}
            </div>

            {/* Card */}
            <div
                className="bg-[#0d1117] border border-[#1e2433] rounded-lg p-4 cursor-pointer hover:border-[#2a3040] transition-all duration-150"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="text-lg leading-none mt-0.5 flex-shrink-0">
                            {cfg.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span
                                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${cfg.badge}`}
                                >
                                    {cfg.label}
                                </span>
                                <span className="text-[11px] text-[#444] font-mono">
                                    {formatTimestamp(event.timestamp)}
                                </span>
                            </div>
                            <p className="text-sm text-[#ccc] font-semibold leading-snug">
                                {event.title}
                            </p>
                            <p className="text-xs text-[#555] mt-1 leading-relaxed">
                                {event.summary}
                            </p>
                        </div>
                    </div>
                    <button className="text-[#333] hover:text-[#666] text-sm leading-none flex-shrink-0 mt-1 transition-colors">
                        {expanded ? "▲" : "▼"}
                    </button>
                </div>

                {/* Expanded detail */}
                {expanded && (
                    <div className="mt-4 pt-4 border-t border-[#1e2433]">
                        <p className="text-[10px] font-mono text-[#444] mb-2">
                            RAW DETAIL
                        </p>
                        <pre className="text-xs text-[#aaa] font-mono bg-[#060a10] border border-[#1e2433] rounded p-3 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
                            {JSON.stringify(event.detail, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatPill({
    label,
    value,
    color,
}: {
    label: string;
    value: number;
    color: string;
}) {
    return (
        <div className="flex flex-col items-center bg-[#0d1117] border border-[#1e2433] rounded-lg px-5 py-3">
            <span className={`text-2xl font-bold font-mono ${color}`}>{value}</span>
            <span className="text-[10px] font-mono text-[#444] mt-0.5">{label}</span>
        </div>
    );
}

export default function TimelinePage() {
    const searchParams = useSearchParams();
    const initialEntity = searchParams.get("entity") || "Zenith LLC";

    const [input, setInput] = useState(initialEntity);
    const [entity, setEntity] = useState(initialEntity);
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<EventType | "all">("all");

    async function fetchTimeline(name: string) {
        setLoading(true);
        setError(null);
        setEvents([]);
        try {
            const res = await fetch(
                `http://localhost:8000/evidence/${encodeURIComponent(name)}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status} — backend unreachable`);
            const data = await res.json();
            setEvents(data.events || []);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to load timeline");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchTimeline(initialEntity);
    }, [initialEntity]);

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = input.trim();
        if (!trimmed) return;
        setEntity(trimmed);
        setFilter("all");
        fetchTimeline(trimmed);
    }

    const typeCounts = events.reduce(
        (acc, e) => {
            acc[e.type] = (acc[e.type] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );

    const filteredEvents =
        filter === "all" ? events : events.filter((e) => e.type === filter);

    return (
        <div className="h-full overflow-y-auto bg-[#020817] text-white">
            <div className="max-w-3xl mx-auto px-6 py-8">

                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[#e63535] font-mono text-xs font-bold tracking-widest">
                            SENTINELAI
                        </span>
                        <span className="text-[#2a2a2a]">/</span>
                        <span className="text-[#444] font-mono text-xs tracking-widest">
                            EVIDENCE TIMELINE
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold font-mono text-white">
                        Evidence Timeline
                    </h1>
                    <p className="text-[#555] text-sm mt-1 font-mono">
                        Chronological reconstruction of all evidence for a target entity.
                        Each event is a data point in the fraud story.
                    </p>
                </div>

                {/* Search bar */}
                <form onSubmit={handleSearch} className="mb-8 flex gap-2">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Entity name — e.g. Zenith LLC"
                        className="flex-1 bg-[#0d1117] border border-[#1e2433] rounded px-4 py-2.5 text-sm font-mono text-white placeholder-[#2a2a2a] focus:outline-none focus:border-[#e63535] transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-[#e63535] hover:bg-[#cc2020] disabled:bg-[#5a1010] disabled:cursor-not-allowed text-white font-mono text-sm font-bold px-6 py-2.5 rounded transition-colors"
                    >
                        {loading ? "..." : "LOAD"}
                    </button>
                </form>

                {/* Loading state */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <div className="w-8 h-8 border-2 border-[#e63535] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#444] font-mono text-sm">
                            Querying all data sources for{" "}
                            <span className="text-[#e63535]">{entity}</span>...
                        </p>
                        <p className="text-[#2a2a2a] font-mono text-xs">
                            transactions · emails · slack · sanctions
                        </p>
                    </div>
                )}

                {/* Error state */}
                {error && !loading && (
                    <div className="bg-red-950/30 border border-red-500/20 rounded-lg p-4 mb-6">
                        <p className="text-red-400 font-mono text-sm font-bold mb-1">
                            ⚠ FAILED TO LOAD TIMELINE
                        </p>
                        <p className="text-red-400/70 font-mono text-xs">{error}</p>
                        <p className="text-[#444] font-mono text-xs mt-2">
                            Make sure the backend is running on port 8000.
                        </p>
                    </div>
                )}

                {/* Stats + filter bar */}
                {!loading && events.length > 0 && (
                    <>
                        {/* Entity + stat pills */}
                        <div className="mb-6">
                            <p className="text-[10px] font-mono text-[#444] mb-1 tracking-widest">
                                TARGET ENTITY
                            </p>
                            <p className="text-xl font-bold font-mono text-[#e63535] mb-4">
                                {entity}
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <StatPill
                                    label="TOTAL EVENTS"
                                    value={events.length}
                                    color="text-white"
                                />
                                {(Object.keys(TYPE_CONFIG) as EventType[]).map((type) =>
                                    typeCounts[type] ? (
                                        <StatPill
                                            key={type}
                                            label={TYPE_CONFIG[type].label}
                                            value={typeCounts[type]}
                                            color={
                                                type === "transaction"
                                                    ? "text-yellow-400"
                                                    : type === "email"
                                                        ? "text-blue-400"
                                                        : type === "slack"
                                                            ? "text-purple-400"
                                                            : "text-red-400"
                                            }
                                        />
                                    ) : null
                                )}
                            </div>
                        </div>

                        {/* Filter tabs */}
                        <div className="flex gap-2 mb-8 flex-wrap">
                            {(["all", ...Object.keys(TYPE_CONFIG)] as (EventType | "all")[]).map(
                                (t) => {
                                    const count =
                                        t === "all" ? events.length : typeCounts[t] || 0;
                                    if (t !== "all" && !count) return null;
                                    const isActive = filter === t;
                                    return (
                                        <button
                                            key={t}
                                            onClick={() => setFilter(t)}
                                            className={`font-mono text-xs px-3 py-1.5 rounded border transition-colors ${isActive
                                                    ? "bg-[#e63535]/10 border-[#e63535]/40 text-[#e63535]"
                                                    : "bg-[#0d1117] border-[#1e2433] text-[#555] hover:text-[#aaa] hover:border-[#333]"
                                                }`}
                                        >
                                            {t === "all"
                                                ? `ALL (${count})`
                                                : `${TYPE_CONFIG[t as EventType].label} (${count})`}
                                        </button>
                                    );
                                }
                            )}
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3 mb-8">
                            <div className="h-px flex-1 bg-[#1e2433]" />
                            <span className="text-[#2a2a2a] font-mono text-[10px] tracking-widest">
                                OLDEST FIRST — {filteredEvents.length} EVENTS
                            </span>
                            <div className="h-px flex-1 bg-[#1e2433]" />
                        </div>

                        {/* Timeline events */}
                        <div className="pl-8">
                            {filteredEvents.map((event, i) => (
                                <EventCard key={i} event={event} index={i} />
                            ))}

                            {/* End cap */}
                            <div className="relative ml-4 pl-6 border-l-2 border-[#1e2433]">
                                <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-[#1e2433]" />
                                <p className="text-[#2a2a2a] font-mono text-xs pb-4">
                                    END OF TIMELINE — {filteredEvents.length} events shown
                                    {filter !== "all" && ` (filtered: ${filter})`}
                                </p>
                            </div>
                        </div>
                    </>
                )}

                {/* Empty state */}
                {!loading && !error && events.length === 0 && (
                    <div className="text-center py-24">
                        <p className="text-[#2a2a2a] font-mono text-sm mb-2">
                            NO EVIDENCE FOUND
                        </p>
                        <p className="text-[#1e2433] font-mono text-xs">
                            No records match &quot;{entity}&quot; in any data source.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}