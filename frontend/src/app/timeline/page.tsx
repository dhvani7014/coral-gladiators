"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const TYPE_CONFIG = {
    transaction: {
        color: "border-[#D97B4F]",
        badge: "bg-[#F5EAE0] text-[#D97B4F] border border-[#E8CDB8]",
        dot: "bg-[#D97B4F]",
        label: "TRANSACTION",
        accentText: "text-[#D97B4F]",
        cardBg: "bg-[#FDF8F4]",
    },
    email: {
        color: "border-[#3B72B8]",
        badge: "bg-[#E3EDF8] text-[#3B72B8] border border-[#C8DCF0]",
        dot: "bg-[#3B72B8]",
        label: "EMAIL",
        accentText: "text-[#3B72B8]",
        cardBg: "bg-[#F4F7FD]",
    },
    slack: {
        color: "border-[#7B58B8]",
        badge: "bg-[#EDE8F5] text-[#7B58B8] border border-[#D5C8EC]",
        dot: "bg-[#7B58B8]",
        label: "SLACK",
        accentText: "text-[#7B58B8]",
        cardBg: "bg-[#F8F6FD]",
    },
    sanction: {
        color: "border-[#B83B3B]",
        badge: "bg-[#F5E3E3] text-[#B83B3B] border border-[#F0C8C8]",
        dot: "bg-[#B83B3B]",
        label: "SANCTIONS HIT",
        accentText: "text-[#B83B3B]",
        cardBg: "bg-[#FDF4F4]",
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
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function EventCard({
    event,
    index,
    side,
}: {
    event: TimelineEvent;
    index: number;
    side: "left" | "right";
}) {
    const [expanded, setExpanded] = useState(false);
    const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.transaction;

    return (
        <div
            className={`relative w-[44%] ${side === "left" ? "mr-auto pr-6" : "ml-auto pl-6"}`}
        >
            {/* Arrow pointer toward center spine */}
            <div
                className={`absolute top-6 ${side === "left"
                        ? "right-0 border-l-8 border-l-[#E0D8CF] border-y-[6px] border-y-transparent"
                        : "left-0 border-r-8 border-r-[#E0D8CF] border-y-[6px] border-y-transparent"
                    }`}
                style={{ width: 0, height: 0 }}
            />

            {/* Card */}
            <div
                className={`border border-[#E0D8CF] rounded-md ${cfg.cardBg} hover:bg-[#F0E9E0] transition-colors duration-200 cursor-pointer border-t-[3px] ${cfg.color} shadow-sm`}
                onClick={() => setExpanded(!expanded)}
            >
                <div className="p-5">
                    {/* Index + badge row */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                            <span className={`text-[10px] font-medium tracking-[0.15em] ${cfg.accentText}`}>
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className={`text-[10px] font-medium tracking-[0.12em] px-2.5 py-[3px] rounded-full ${cfg.badge}`}>
                                {cfg.label}
                            </span>
                        </div>
                        <button className="text-[#C4B8AC] hover:text-[#9B8E82] text-[10px] transition-colors">
                            {expanded ? "▲" : "▼"}
                        </button>
                    </div>

                    {/* Timestamp */}
                    <p className="text-[11px] text-[#C4B8AC] tracking-wide mb-2">
                        {formatTimestamp(event.timestamp)}
                    </p>

                    {/* Title */}
                    <p className="font-playfair text-[16px] font-bold text-[#1A1612] leading-snug mb-1">
                        {event.title}
                    </p>

                    {/* Summary */}
                    <p className="text-[12px] font-light text-[#9B8E82] leading-relaxed">
                        {event.summary}
                    </p>

                    {/* Expanded raw detail */}
                    {expanded && (
                        <div className="mt-4 pt-4 border-t border-[#E0D8CF]">
                            <p className="text-[10px] font-medium tracking-[0.18em] text-[#C4B8AC] uppercase mb-2">
                                Raw Detail
                            </p>
                            <pre className="text-[11px] text-[#6B5E52] font-mono bg-[#EDE7DF] border border-[#D8CEBF] rounded p-3 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
                                {JSON.stringify(event.detail, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatPill({
    label,
    value,
    accentClass,
}: {
    label: string;
    value: number;
    accentClass: string;
}) {
    return (
        <div className="flex items-baseline gap-2 bg-[#EDE7DF] border border-[#D8CEBF] rounded-md px-4 py-2.5">
            <span className={`font-playfair text-[22px] font-bold ${accentClass}`}>{value}</span>
            <span className="text-[11px] text-[#9B8E82] tracking-wide font-normal">{label}</span>
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
            const res = await fetch(`http://localhost:8000/evidence/${encodeURIComponent(name)}`);
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

    const typeCounts = events.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const filteredEvents =
        filter === "all" ? events : events.filter((e) => e.type === filter);

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Outfit:wght@300;400;500;600&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-outfit  { font-family: 'Outfit', sans-serif; }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin 0.9s linear infinite; }

        /* ── centre spine ── */
        .spine-wrap { position: relative; }
        .spine-wrap::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 0; bottom: 0;
          width: 1px;
          background: #E0D8CF;
          transform: translateX(-50%);
        }

        /* ── step connector arrows between cards ── */
        .step-row { position: relative; display: flex; align-items: flex-start; margin-bottom: 0; }

        /* dot on spine */
        .spine-dot {
          position: absolute;
          left: 50%;
          transform: translate(-50%, 22px);
          width: 10px; height: 10px;
          border-radius: 50%;
          border: 2px solid #F7F3EE;
          z-index: 2;
        }

        /* diagonal arrow between consecutive steps */
        .step-arrow {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 3;
        }
        .step-arrow-line {
          width: 1px;
          background: #D8CEBF;
        }
        .step-arrow-head {
          width: 0; height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top: 6px solid #D8CEBF;
        }
      `}</style>

            <div className="font-outfit bg-[#F7F3EE] min-h-screen text-[#1A1612]">

                {/* ── Top bar ── */}
                <div className="bg-[#1A1612] flex items-center justify-between px-12 h-[52px]">
                    <div className="flex items-center gap-6">
                        <Link href="/">
                            <span className="font-outfit font-semibold text-sm tracking-widest text-[#F7F3EE] uppercase cursor-pointer hover:text-[#D97B4F] transition-colors">
                                Sentinel
                            </span>
                        </Link>
                        <div className="w-px h-4 bg-[#3A3430]" />
                        <span className="text-[11px] text-[#6B5E52] tracking-wide">Evidence Timeline</span>
                    </div>
                    <div className="flex items-center gap-5">
                        <div className="flex items-center gap-2 bg-[#2A2420] border border-[#3A3430] rounded-full px-3 py-[5px]">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#D97B4F] animate-pulse-dot" />
                            <span className="text-[11px] text-[#D97B4F] tracking-wider font-medium">System online</span>
                        </div>
                        <span className="text-[11px] text-[#3A3430] tracking-wide">v0.1.0-dev</span>
                    </div>
                </div>

                {/* ── Hero ── */}
                <div className="px-12 pt-12 pb-10 border-b border-[#E0D8CF]">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-6 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                        <span className="text-[11px] font-medium tracking-[0.18em] text-[#D97B4F] uppercase">Module 07</span>
                    </div>
                    <div className="flex items-end justify-between gap-8">
                        <div>
                            <h1 className="font-playfair text-[52px] font-black leading-[0.92] tracking-tight text-[#1A1612] mb-4">
                                Evidence<br />
                                <em className="text-[#8B5E3C]">Timeline.</em>
                            </h1>
                            <p className="text-[14px] font-light text-[#6B5E52] leading-[1.75] max-w-[440px]">
                                Chronological reconstruction of all fraud evidence for any target entity — transactions, emails, Slack, and sanctions unified in one view.
                            </p>
                        </div>

                        {/* Search */}
                        <form onSubmit={handleSearch} className="flex gap-2 items-stretch pb-1">
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Entity name — e.g. Zenith LLC"
                                className="w-[280px] bg-[#EDE7DF] border border-[#D8CEBF] rounded-md px-4 py-2.5 text-[13px] font-light text-[#1A1612] placeholder-[#C4B8AC] focus:outline-none focus:border-[#D97B4F] transition-colors"
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-[#1A1612] hover:bg-[#2A2420] disabled:bg-[#9B8E82] disabled:cursor-not-allowed text-[#F7F3EE] text-[12px] font-medium tracking-[0.15em] uppercase px-6 py-2.5 rounded-md transition-colors"
                            >
                                {loading ? "Loading" : "Search"}
                            </button>
                        </form>
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="px-12 py-10 pb-28">

                    {/* Loading */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-28 gap-5">
                            <div className="w-8 h-8 rounded-full border-2 border-[#E0D8CF] border-t-[#D97B4F] animate-spin-slow" />
                            <div className="text-center">
                                <p className="text-[14px] font-light text-[#6B5E52]">
                                    Querying all sources for{" "}
                                    <span className="text-[#D97B4F] font-medium">{entity}</span>
                                </p>
                                <p className="text-[11px] text-[#C4B8AC] tracking-[0.15em] uppercase mt-1">
                                    transactions · emails · slack · sanctions
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && !loading && (
                        <div className="bg-[#F5E3E3] border border-[#E8C8C8] rounded-md p-5 mb-8 max-w-xl mx-auto">
                            <p className="text-[13px] font-medium text-[#B83B3B] mb-1 tracking-wide">
                                Failed to load timeline
                            </p>
                            <p className="text-[12px] font-light text-[#9B5E5E]">{error}</p>
                            <p className="text-[11px] text-[#C4B8AC] mt-2">
                                Make sure the backend is running on port 8000.
                            </p>
                        </div>
                    )}

                    {/* Results */}
                    {!loading && events.length > 0 && (
                        <>
                            {/* Entity + stats */}
                            <div className="mb-8">
                                <p className="text-[11px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase mb-1">
                                    Target entity
                                </p>
                                <p className="font-playfair text-[30px] font-bold text-[#1A1612] mb-5">{entity}</p>
                                <div className="flex flex-wrap gap-2">
                                    <StatPill label="Total events" value={events.length} accentClass="text-[#1A1612]" />
                                    {(Object.keys(TYPE_CONFIG) as EventType[]).map((type) =>
                                        typeCounts[type] ? (
                                            <StatPill
                                                key={type}
                                                label={TYPE_CONFIG[type].label}
                                                value={typeCounts[type]}
                                                accentClass={TYPE_CONFIG[type].accentText}
                                            />
                                        ) : null
                                    )}
                                </div>
                            </div>

                            {/* Filter tabs */}
                            <div className="flex gap-2 flex-wrap mb-10 pb-8 border-b border-[#E0D8CF]">
                                {(["all", ...Object.keys(TYPE_CONFIG)] as (EventType | "all")[]).map((t) => {
                                    const count = t === "all" ? events.length : typeCounts[t] || 0;
                                    if (t !== "all" && !count) return null;
                                    const isActive = filter === t;
                                    return (
                                        <button
                                            key={t}
                                            onClick={() => setFilter(t)}
                                            className={`text-[11px] font-medium tracking-[0.12em] px-3.5 py-[6px] rounded-full border transition-colors duration-150 ${isActive
                                                    ? "bg-[#1A1612] border-[#1A1612] text-[#F7F3EE]"
                                                    : "bg-[#EDE7DF] border-[#D8CEBF] text-[#9B8E82] hover:text-[#1A1612] hover:border-[#C4B8AC]"
                                                }`}
                                        >
                                            {t === "all"
                                                ? `All  ${count}`
                                                : `${TYPE_CONFIG[t as EventType].label}  ${count}`}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Count label */}
                            <div className="flex items-center gap-3 mb-10">
                                <span className="text-[11px] font-medium tracking-[0.2em] text-[#C4B8AC] uppercase">
                                    Oldest first — {filteredEvents.length} events
                                </span>
                                <div className="flex-1 h-px bg-[#E0D8CF]" />
                            </div>

                            {/* ── Two-column alternating timeline ── */}
                            <div className="spine-wrap">
                                {filteredEvents.map((event, i) => {
                                    const side = i % 2 === 0 ? "left" : "right";
                                    const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.transaction;
                                    const isLast = i === filteredEvents.length - 1;

                                    return (
                                        <div key={i} className="relative">
                                            {/* Row with card */}
                                            <div className="step-row py-5">
                                                {/* Spine dot */}
                                                <div className={`spine-dot ${cfg.dot}`} />

                                                <EventCard event={event} index={i} side={side} />
                                            </div>

                                            {/* Arrow connector between steps */}
                                            {!isLast && (
                                                <div
                                                    className="step-arrow"
                                                    style={{ top: "calc(100% - 24px)" }}
                                                >
                                                    <div className="step-arrow-line" style={{ height: 24 }} />
                                                    <div className="step-arrow-head" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* End cap on spine */}
                                <div className="relative flex justify-center pt-6 pb-4">
                                    <div className="absolute left-1/2 -top-1 w-3 h-3 rounded-full bg-[#E0D8CF] border-2 border-[#F7F3EE]" style={{ transform: "translateX(-50%)" }} />
                                    <p className="text-[11px] text-[#C4B8AC] tracking-wide font-light mt-4">
                                        End of timeline — {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} shown
                                        {filter !== "all" && ` · filtered by ${filter}`}
                                    </p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Empty state */}
                    {!loading && !error && events.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-28 gap-3 text-center">
                            <p className="font-playfair text-[28px] font-bold text-[#D8CEBF]">No evidence found.</p>
                            <p className="text-[13px] font-light text-[#C4B8AC]">
                                No records match &ldquo;{entity}&rdquo; across any data source.
                            </p>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="bg-white/50 backdrop-blur-sm px-12 py-5 fixed bottom-0 left-0 right-0 border-t border-[#E0D8CF]">
                    <div className="flex justify-center w-full gap-8 flex-wrap">
                        {[
                            { key: "Coral", val: "4 sources" }
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
        </>
    );
}
