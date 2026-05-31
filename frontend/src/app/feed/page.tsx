"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const BACKEND = "http://localhost:8000";

interface SanctionItem {
  entity_name: string;
  country: string;
  sanction_type: string;
  listed_date: string;
  source: string;
}

interface SlackItem {
  message_id: string;
  user_name: string;
  channel: string;
  message: string;
  timestamp: string;
}

function timeAgo(ts: string) {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  if (isNaN(diff)) return ts.slice(0, 10);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 365) return `${d}d ago`;
  return ts.slice(0, 10);
}

function countryFlag(country: string) {
  if (!country || country === "Unknown") return "🌐";
  const code = country.toUpperCase().slice(0, 2);
  try {
    return code
      .split("")
      .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
      .join("");
  } catch {
    return "🌐";
  }
}

type Tab = "sanctions" | "slack";

export default function FeedPage() {
  const [tab, setTab] = useState<Tab>("sanctions");
  const [sanctions, setSanctions] = useState<SanctionItem[]>([]);
  const [slack, setSlack] = useState<SlackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const knownIds = useRef<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchFeed() {
    try {
      const [sanctRes, slackRes] = await Promise.all([
        fetch(`${BACKEND}/feed/sanctions?limit=100`),
        fetch(`${BACKEND}/feed/slack?limit=100`),
      ]);
      const sanctData = await sanctRes.json();
      const slackData = await slackRes.json();

      const sanctItems: SanctionItem[] = sanctData.items || [];
      const slackItems: SlackItem[] = slackData.items || [];

      // Detect new slack messages
      const freshIds = new Set(
        slackItems
          .filter((s) => !knownIds.current.has(s.message_id))
          .map((s) => s.message_id),
      );
      if (freshIds.size > 0) {
        setNewIds(freshIds);
        setTimeout(() => setNewIds(new Set()), 2000);
      }
      knownIds.current = new Set(slackItems.map((s) => s.message_id));

      setSanctions(sanctItems);
      setSlack(slackItems);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.error("Feed fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFeed();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchFeed, 5000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh]);

  const filteredSanctions = sanctions.filter(
    (s) =>
      !search ||
      s.entity_name.toLowerCase().includes(search.toLowerCase()) ||
      s.country.toLowerCase().includes(search.toLowerCase()) ||
      s.sanction_type.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredSlack = slack.filter(
    (s) =>
      !search ||
      s.message.toLowerCase().includes(search.toLowerCase()) ||
      s.user_name.toLowerCase().includes(search.toLowerCase()) ||
      s.channel.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Outfit:wght@300;400;500;600&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-outfit  { font-family: 'Outfit', sans-serif; }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes flash-new { 0% { background-color: #D97B4F18; } 100% { background-color: transparent; } }
        .flash-new { animation: flash-new 2s ease-out forwards; }
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
              Live Intelligence Feed
            </span>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdated && (
              <span className="text-[10px] text-[#3A3430] tracking-widest uppercase">
                Updated {lastUpdated}
              </span>
            )}
            <button
              onClick={fetchFeed}
              className="text-[11px] text-[#6B5E52] hover:text-[#F7F3EE] tracking-wide transition-colors bg-transparent border-none cursor-pointer"
            >
              ↻ Refresh
            </button>
            <button
              onClick={() => setAutoRefresh((r) => !r)}
              className={`flex items-center gap-2 border rounded-full px-3 py-[5px] text-[11px] font-medium tracking-wide transition-colors cursor-pointer bg-transparent ${
                autoRefresh
                  ? "border-[#D97B4F]/40 text-[#D97B4F]"
                  : "border-[#3A3430] text-[#3A3430] hover:text-[#6B5E52]"
              }`}
            >
              {autoRefresh && (
                <div className="w-1.5 h-1.5 rounded-full bg-[#D97B4F] animate-pulse-dot" />
              )}
              {autoRefresh ? "Live" : "Paused"}
            </button>
          </div>
        </div>

        {/* Page header */}
        <div className="px-12 pt-12 pb-10 border-b border-[#E0D8CF]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-6 bg-[#D97B4F]" style={{ height: "1.5px" }} />
            <span className="text-[11px] font-medium tracking-[0.18em] text-[#D97B4F] uppercase">
              Real-time intelligence
            </span>
          </div>
          <div className="flex items-end justify-between gap-8">
            <h1 className="font-playfair text-[52px] font-black leading-[0.92] tracking-tight text-[#1A1612]">
              Live <em className="italic text-[#8B5E3C]">Feed.</em>
            </h1>
            {/* Stat pills */}
            <div className="flex items-center gap-3 pb-1">
              <div className="flex items-baseline gap-2 bg-[#F5EAE0] border border-[#E8CDB8] rounded-md px-4 py-2.5">
                <span className="font-playfair text-[20px] font-bold text-[#C06030]">
                  {sanctions.length.toLocaleString()}
                </span>
                <span className="text-[11px] text-[#C06030]/70 tracking-wide">
                  Sanctioned entities
                </span>
              </div>
              <div className="flex items-baseline gap-2 bg-[#EDE8F5] border border-[#D5C8EC] rounded-md px-4 py-2.5">
                <span className="font-playfair text-[20px] font-bold text-[#7B58B8]">
                  {slack.length}
                </span>
                <span className="text-[11px] text-[#7B58B8]/70 tracking-wide">
                  Slack messages
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-12 py-8 pb-24">
          {/* Search + tabs */}
          <div className="flex items-center justify-between mb-6 gap-4">
            <div className="flex gap-px border border-[#E0D8CF] rounded-md overflow-hidden">
              {(["sanctions", "slack"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-6 py-2 text-[11px] font-medium tracking-widest uppercase border-none cursor-pointer transition-colors ${
                    tab === t
                      ? "bg-[#1A1612] text-[#F7F3EE]"
                      : "bg-[#F7F3EE] text-[#9B8E82] hover:bg-[#EDE7DF]"
                  }`}
                >
                  {t === "sanctions"
                    ? `Sanctions (${sanctions.length.toLocaleString()})`
                    : `Slack (${slack.length})`}
                </button>
              ))}
            </div>
            <input
              className="bg-white border border-[#E0D8CF] rounded-lg px-4 py-2 text-[13px] text-[#1A1612] placeholder-[#C4B8AC] focus:outline-none focus:border-[#D97B4F] transition-colors font-outfit w-64"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-16 text-[#C4B8AC] text-sm tracking-widest">
              Loading feed…
            </div>
          )}

          {/* Sanctions tab */}
          {!loading && tab === "sanctions" && (
            <div className="border border-[#E0D8CF] rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[2.5fr_1fr_2fr_1fr] gap-4 px-6 py-3 bg-[#EDE7DF] border-b border-[#E0D8CF]">
                {["Entity", "Country", "Sanction Program", "Source"].map(
                  (h) => (
                    <span
                      key={h}
                      className="text-[10px] font-medium tracking-[0.15em] text-[#9B8E82] uppercase"
                    >
                      {h}
                    </span>
                  ),
                )}
              </div>
              <div className="divide-y divide-[#E0D8CF] max-h-[600px] overflow-y-auto">
                {filteredSanctions.length === 0 && (
                  <div className="text-center py-12 text-[#C4B8AC] text-sm">
                    No results.
                  </div>
                )}
                {filteredSanctions.map((s, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[2.5fr_1fr_2fr_1fr] gap-4 px-6 py-3.5 items-center bg-[#F7F3EE] hover:bg-[#F0E9E0] transition-colors"
                  >
                    {/* Entity name */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D97B4F] flex-shrink-0" />
                      <span className="text-[13px] font-medium text-[#1A1612] truncate">
                        {s.entity_name}
                      </span>
                    </div>
                    {/* Country */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-base leading-none">
                        {countryFlag(s.country)}
                      </span>
                      <span className="text-[12px] text-[#9B8E82] font-light">
                        {s.country}
                      </span>
                    </div>
                    {/* Sanction type */}
                    <span className="text-[12px] text-[#6B5E52] font-light truncate">
                      {s.sanction_type || "—"}
                    </span>
                    {/* Source */}
                    <span className="text-[11px] text-[#C4B8AC] tracking-wide">
                      {s.source}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Slack tab */}
          {!loading && tab === "slack" && (
            <div className="border border-[#E0D8CF] rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1.2fr_1fr_3fr_1fr] gap-4 px-6 py-3 bg-[#EDE7DF] border-b border-[#E0D8CF]">
                {["User", "Channel", "Message", "Time"].map((h) => (
                  <span
                    key={h}
                    className="text-[10px] font-medium tracking-[0.15em] text-[#9B8E82] uppercase"
                  >
                    {h}
                  </span>
                ))}
              </div>
              <div className="divide-y divide-[#E0D8CF] max-h-[600px] overflow-y-auto">
                {filteredSlack.length === 0 && (
                  <div className="text-center py-12 text-[#C4B8AC] text-sm">
                    No messages yet.
                  </div>
                )}
                {filteredSlack.map((s) => {
                  const isNew = newIds.has(s.message_id);
                  return (
                    <div
                      key={s.message_id}
                      className={`grid grid-cols-[1.2fr_1fr_3fr_1fr] gap-4 px-6 py-3.5 items-center bg-[#F7F3EE] hover:bg-[#F0E9E0] transition-colors ${isNew ? "flash-new" : ""}`}
                    >
                      {/* User */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-[#EDE8F5] border border-[#D5C8EC] flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-bold text-[#7B58B8]">
                            {s.user_name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-[13px] font-medium text-[#1A1612] truncate">
                          {s.user_name}
                        </span>
                      </div>
                      {/* Channel */}
                      <span className="text-[12px] text-[#9B8E82] font-light truncate">
                        #{s.channel.startsWith("C0") ? "channel" : s.channel}
                      </span>
                      {/* Message */}
                      <span className="text-[13px] text-[#6B5E52] font-light leading-snug line-clamp-2">
                        {s.message}
                      </span>
                      {/* Time */}
                      <span className="text-[11px] text-[#C4B8AC]">
                        {timeAgo(s.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white/50 backdrop-blur-sm px-12 py-5 fixed bottom-0 left-0 right-0 border-t border-[#E0D8CF]">
          <div className="flex justify-center w-full gap-8 flex-wrap">
            {[
              {
                key: "Sanctions",
                val: `${sanctions.length.toLocaleString()} entities`,
              },
              { key: "Slack", val: `${slack.length} messages` },
              { key: "Source", val: "OpenSanctions · Slack API" },
              { key: "Powered by", val: "Coral federated SQL" },
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
