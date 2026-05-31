"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  sanctions: {
    total: number;
    top_countries: { name: string; count: number }[];
  };
  slack: {
    total: number;
    recent: {
      user_name: string;
      channel: string;
      message: string;
      timestamp: string;
    }[];
  };
  emails: {
    total: number;
  };
  sources: number;
}

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function timeAgo(iso: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getRiskColor(score: number) {
  if (score >= 70)
    return {
      text: "text-[#C0392B]",
      hex: "#C0392B",
      bg: "bg-[#F5E8E8]",
      border: "border-[#E8C8C8]",
    };
  if (score >= 40)
    return {
      text: "text-[#A87820]",
      hex: "#A87820",
      bg: "bg-[#F5EDD8]",
      border: "border-[#E8D5A0]",
    };
  return {
    text: "text-[#3B8A52]",
    hex: "#3B8A52",
    bg: "bg-[#E3F0E8]",
    border: "border-[#C0DCC8]",
  };
}

function getFlagStyle(f: string) {
  if (f === "FRAUD") return "bg-[#F5E8E8] text-[#C0392B] border-[#E8C8C8]";
  if (f === "HIGH_VALUE") return "bg-[#EDE8F5] text-[#7B58B8] border-[#D5C8EC]";
  return "bg-[#F5EDD8] text-[#A87820] border-[#E8D5A0]";
}

// ── Risk Bar ──────────────────────────────────────────────────────────────────
function RiskBar({ score }: { score: number }) {
  const { hex, text } = getRiskColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[3px] bg-[#E0D8CF] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: hex }}
        />
      </div>
      <span
        className={`font-playfair text-[13px] font-bold min-w-[28px] text-right ${text}`}
      >
        {score}
      </span>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  accentHex,
  wide = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accentHex: string;
  wide?: boolean;
}) {
  return (
    <div className="relative bg-[#F7F3EE] flex flex-col justify-between p-7 overflow-hidden">
      {/* Accent bar top */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: accentHex }}
      />
      <div>
        <div className="flex items-center gap-2 mb-5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: accentHex }}
          />
          <span className="text-[10px] font-medium tracking-[0.18em] text-[#9B8E82] uppercase font-outfit">
            {label}
          </span>
        </div>
        <div
          className={`font-playfair font-black leading-none tracking-tight ${wide ? "text-[32px]" : "text-[44px]"}`}
          style={{ color: accentHex }}
        >
          {value}
        </div>
      </div>
      {sub && (
        <div className="text-[11px] font-light text-[#C4B8AC] mt-4 font-outfit tracking-wide">
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState("");

  useEffect(() => {
    setNow(new Date().toLocaleString("en-US", { hour12: false }));
    fetch("http://localhost:8000/stats")
      .then((r) => r.json())
      .then((d) => {
        setStats(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const quickLinks = [
    {
      href: "/feed",
      code: "01",
      label: "Live Feed",
      badge: "Live",
      badgeStyle: "bg-[#F5EAE0] text-[#D97B4F] border-[#E8CDB8]",
    },
    {
      href: "/investigate",
      code: "02",
      label: "Investigate",
      badge: "6 agents",
      badgeStyle: "bg-[#E3EDF8] text-[#3B72B8] border-[#C8DCF0]",
    },
    {
      href: "/report",
      code: "03",
      label: "Report",
      badge: "Blocking",
      badgeStyle: "bg-[#F5EDD8] text-[#A87820] border-[#E8D5A0]",
    },
    {
      href: "/graph",
      code: "04",
      label: "Graph",
      badge: "Neo4j",
      badgeStyle: "bg-[#EDE8F5] text-[#7B58B8] border-[#D5C8EC]",
    },
    {
      href: "/trace",
      code: "05",
      label: "SQL Trace",
      badge: "Audit",
      badgeStyle: "bg-[#E3F0E8] text-[#3B8A52] border-[#C0DCC8]",
    },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Outfit:wght@300;400;500;600&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-outfit   { font-family: 'Outfit', sans-serif; }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes fade-up { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fade-up 0.35s ease forwards; }
        .vendor-row:hover  { background: #F0E9E0 !important; }
        .tx-row:hover      { background: #F0E9E0 !important; }
        .quick-card:hover .quick-arrow { opacity:1; transform:translateX(0); }
        .quick-card:hover .quick-num   { color:#D97B4F; }
        .quick-arrow { opacity:0; transform:translateX(-5px); transition:all 0.15s; }
        .quick-num   { transition:color 0.15s; }
        .sys-row:hover { background: #F0E9E0 !important; }
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
              Dashboard
            </span>
          </div>
          <div className="flex items-center gap-5">
            {now && (
              <span className="text-[10px] text-[#3A3430] tracking-widest font-outfit">
                {now}
              </span>
            )}
            <div className="flex items-center gap-2 bg-[#2A2420] border border-[#3A3430] rounded-full px-3 py-[5px]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#D97B4F] animate-pulse-dot" />
              <span className="text-[11px] text-[#D97B4F] tracking-wider font-medium">
                Module 06
              </span>
            </div>
          </div>
        </div>

        {/* ── Page hero ── */}
        <div className="px-12 pt-12 pb-10 border-b border-[#E0D8CF] grid grid-cols-[1fr_auto] items-end gap-10">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-6 bg-[#D97B4F]" style={{ height: "1.5px" }} />
              <span className="text-[11px] font-medium tracking-[0.18em] text-[#D97B4F] uppercase">
                System overview
              </span>
            </div>
            <h1 className="font-playfair text-[52px] font-black leading-[0.92] tracking-tight text-[#1A1612] mb-4">
              Command
              <br />
              <em className="text-[#8B5E3C]">Centre.</em>
            </h1>
            <p className="text-[14px] font-light text-[#6B5E52] leading-[1.75] max-w-[380px]">
              Live sanctions watchlist, internal Slack intelligence, and system
              health — powered by Coral federated SQL.
            </p>
          </div>
          {/* Live indicator */}
          <div className="flex flex-col items-end gap-3 pb-1">
            <div className="flex items-center gap-2 border border-[#E0D8CF] rounded-full px-4 py-2 bg-white">
              <div className="w-1.5 h-1.5 rounded-full bg-[#3B8A52] animate-pulse-dot" />
              <span className="text-[11px] text-[#3B8A52] tracking-widest font-outfit">
                System online
              </span>
            </div>
            <span className="text-[10px] text-[#C4B8AC] tracking-wide font-outfit">
              v0.1.0-dev
            </span>
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="text-center py-32">
            <div className="text-[11px] tracking-[0.2em] text-[#9B8E82] mb-6 uppercase">
              Loading stats…
            </div>
            <div className="flex justify-center gap-2">
              {["SANCTIONS", "SLACK", "EMAILS", "SOURCES"].map((s, i) => (
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

        {/* ── Error ── */}
        {!loading && error && (
          <div className="mx-12 mt-10 bg-[#F5E8E8] border border-[#E8C8C8] rounded-xl p-8 text-center">
            <div className="font-playfair text-4xl text-[#E8C8C8] mb-3">⚠</div>
            <p className="font-playfair text-xl font-bold text-[#C0392B] mb-2">
              Connection Error
            </p>
            <p className="text-[12px] font-light text-[#9B8E82]">
              {error} — is the backend running on port 8000?
            </p>
          </div>
        )}

        {stats && (
          <div className="px-12 py-10 pb-28 flex flex-col gap-10">
            {/* ── Stat cards ── */}
            <div className="fade-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-4 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                <span className="text-[10px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">
                  Key metrics
                </span>
              </div>
              <div className="grid grid-cols-4 border border-[#E0D8CF] rounded-xl overflow-hidden divide-x divide-[#E0D8CF]">
                <StatCard
                  label="Sanctioned entities"
                  value={stats.sanctions.total.toLocaleString()}
                  sub="global watchlist · OpenSanctions"
                  accentHex="#C0392B"
                />
                <StatCard
                  label="Slack messages"
                  value={stats.slack.total.toLocaleString()}
                  sub="live internal intelligence"
                  accentHex="#7B58B8"
                />
                <StatCard
                  label="Emails indexed"
                  value={stats.emails.total.toLocaleString()}
                  sub="internal communications"
                  accentHex="#3B72B8"
                />
                <StatCard
                  label="Active sources"
                  value={stats.sources}
                  sub="sanctions · slack · emails"
                  accentHex="#3B8A52"
                />
              </div>
            </div>

            {/* ── Two column ── */}
            <div
              className="grid grid-cols-2 gap-6 fade-up"
              style={{ animationDelay: "0.08s" }}
            >
              {/* Top sanctioned countries */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="w-4 bg-[#D97B4F]"
                    style={{ height: "1.5px" }}
                  />
                  <span className="text-[10px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">
                    Top sanctioned countries
                  </span>
                </div>
                <div className="border border-[#E0D8CF] rounded-xl overflow-hidden">
                  <div className="px-6 py-3 bg-[#EDE7DF] border-b border-[#E0D8CF] flex items-center justify-between">
                    <span className="text-[10px] tracking-[0.15em] text-[#9B8E82] font-outfit uppercase">
                      By entity count
                    </span>
                    <span className="text-[10px] text-[#C4B8AC] font-outfit">
                      OpenSanctions
                    </span>
                  </div>
                  {stats.sanctions.top_countries.map((c, i) => (
                    <div
                      key={c.name}
                      className="flex items-center gap-5 px-6 py-4 border-b border-[#E0D8CF] last:border-0"
                      style={{
                        background: i % 2 === 0 ? "#F7F3EE" : "#FFFFFF",
                      }}
                    >
                      <div className="font-playfair text-[22px] font-black text-[#E0D8CF] w-8 flex-shrink-0 leading-none">
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[#1A1612] mb-1">
                          {c.name || "Unknown"}
                        </div>
                        <div className="text-[11px] font-light text-[#9B8E82]">
                          {c.count.toLocaleString()} entities
                        </div>
                      </div>
                      <div className="w-[100px] flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-[3px] bg-[#E0D8CF] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#C0392B]"
                              style={{
                                width: `${Math.min(100, (c.count / (stats.sanctions.top_countries[0]?.count || 1)) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-[#C0392B] min-w-[40px] text-right">
                            {c.count.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Slack messages */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 bg-[#D97B4F]"
                      style={{ height: "1.5px" }}
                    />
                    <span className="text-[10px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">
                      Recent Slack intelligence
                    </span>
                  </div>
                </div>
                <div className="border border-[#E0D8CF] rounded-xl overflow-hidden">
                  <div className="px-6 py-3 bg-[#EDE7DF] border-b border-[#E0D8CF] flex items-center justify-between">
                    <span className="text-[10px] tracking-[0.15em] text-[#9B8E82] font-outfit uppercase">
                      Latest messages
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#7B58B8] animate-pulse-dot" />
                      <span className="text-[10px] font-semibold tracking-widest text-[#7B58B8] font-outfit">
                        LIVE
                      </span>
                    </div>
                  </div>
                  {stats.slack.recent.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-[11px] text-[#C4B8AC] font-outfit">
                        No messages yet
                      </p>
                    </div>
                  ) : (
                    stats.slack.recent.map((msg, i) => (
                      <div
                        key={i}
                        className="px-6 py-4 border-b border-[#E0D8CF] last:border-0"
                        style={{
                          background: i % 2 === 0 ? "#F7F3EE" : "#FFFFFF",
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-medium text-[#1A1612]">
                            {msg.user_name}
                          </span>
                          <span className="text-[10px] text-[#C4B8AC]">
                            {timeAgo(msg.timestamp)}
                          </span>
                        </div>
                        <div className="text-[11px] font-light text-[#9B8E82] mb-1">
                          #
                          {msg.channel.startsWith("C0")
                            ? "channel"
                            : msg.channel}
                        </div>
                        <div className="text-[12px] text-[#6B5E52] font-light leading-snug line-clamp-2">
                          {msg.message}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ── System status ── */}
            <div className="fade-up" style={{ animationDelay: "0.14s" }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-4 bg-[#D97B4F]" style={{ height: "1.5px" }} />
                <span className="text-[10px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">
                  System status
                </span>
              </div>
              <div className="border border-[#E0D8CF] rounded-xl overflow-hidden divide-x divide-[#E0D8CF] grid grid-cols-6">
                {[
                  { label: "Coral JSONL", val: "4 sources" },
                  { label: "Neo4j", val: "port 7687" },
                  { label: "FastAPI", val: "port 8000" },
                  { label: "Next.js", val: "port 3000" },
                  { label: "Groq", val: "llama-3.3-70b" },
                  { label: "Coral", val: "federated" },
                ].map((s, i) => (
                  <div
                    key={s.label}
                    className="sys-row px-5 py-4 flex items-start gap-3 transition-colors"
                    style={{ background: i % 2 === 0 ? "#F7F3EE" : "#FFFFFF" }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[#3B8A52] animate-pulse-dot mt-1 flex-shrink-0" />
                    <div>
                      <div className="text-[12px] font-medium text-[#1A1612] mb-0.5">
                        {s.label}
                      </div>
                      <div className="text-[10px] text-[#C4B8AC] font-outfit tracking-wide">
                        {s.val}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Quick access (module cards style) ── */}
            <div className="fade-up" style={{ animationDelay: "0.20s" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 bg-[#D97B4F]"
                    style={{ height: "1.5px" }}
                  />
                  <span className="text-[10px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">
                    Quick access
                  </span>
                </div>
                <span className="text-[11px] text-[#C4B8AC] tracking-wide font-outfit">
                  5 modules
                </span>
              </div>
              <div className="border border-[#E0D8CF] rounded-xl overflow-hidden grid grid-cols-5 divide-x divide-[#E0D8CF]">
                {quickLinks.map(
                  ({ href, code, label, badge, badgeStyle }, i) => (
                    <Link
                      key={href}
                      href={href}
                      className="quick-card flex flex-col p-6 bg-[#F7F3EE] hover:bg-[#F0E9E0] transition-colors duration-200 cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span className="quick-num text-[10px] font-medium tracking-[0.15em] text-[#C4B8AC]">
                          {code}
                        </span>
                        <span
                          className={`text-[10px] font-medium tracking-wide px-2.5 py-[3px] rounded-full border ${badgeStyle}`}
                        >
                          {code === "01" && (
                            <span
                              className="inline-block w-[5px] h-[5px] bg-[#D97B4F] rounded-full mr-[5px] animate-pulse-dot"
                              style={{ verticalAlign: "1px" }}
                            />
                          )}
                          {badge}
                        </span>
                      </div>
                      <div className="font-playfair text-[18px] font-bold text-[#1A1612] mb-1 leading-tight">
                        {label}
                      </div>
                      <div className="quick-arrow mt-auto pt-4 text-[11px] text-[#D97B4F] font-medium tracking-wide">
                        Open →
                      </div>
                    </Link>
                  ),
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="bg-white/50 backdrop-blur-sm px-12 py-5 flex items-center border-t border-[#E0D8CF] fixed bottom-0 left-0 right-0">
          <div className="flex justify-center w-full gap-8 flex-wrap">
            {[
              { key: "Coral", val: "3 sources" },
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
