import Link from "next/link";

const modules = [
  {
    href: "/feed",
    code: "01",
    label: "Live Feed",
    desc: "Real-time flagged transaction stream. Auto-polls every 5s.",
    badge: "Live",
    badgeStyle: "bg-[#F5EAE0] text-[#D97B4F] border border-[#E8CDB8]",
    live: true,
  },
  {
    href: "/investigate",
    code: "02",
    label: "Investigate",
    desc: "Run a full 6-agent pipeline against any vendor or entity.",
    badge: "6 agents",
    badgeStyle: "bg-[#E3EDF8] text-[#3B72B8] border border-[#C8DCF0]",
  },
  {
    href: "/report",
    code: "03",
    label: "Report",
    desc: "Structured fraud report with risk gauge and full evidence trail.",
    badge: "Blocking",
    badgeStyle: "bg-[#F5EDD8] text-[#A87820] border border-[#E8D5A0]",
  },
  {
    href: "/graph",
    code: "04",
    label: "Graph",
    desc: "Relationship map of entities, transactions, and sanctions.",
    badge: "Neo4j",
    badgeStyle: "bg-[#EDE8F5] text-[#7B58B8] border border-[#D5C8EC]",
  },
  {
    href: "/trace",
    code: "05",
    label: "SQL Trace",
    desc: "Federated query audit log with timing and cache status.",
    badge: "Audit",
    badgeStyle: "bg-[#E3F0E8] text-[#3B8A52] border border-[#C0DCC8]",
  },
  {
    href: "/dashboard",
    code: "06",
    label: "Dashboard",
    desc: "System overview — exposure, top vendors, query statistics.",
    badge: "Overview",
    badgeStyle: "bg-[#E0F0F0] text-[#2A8080] border border-[#B0D8D8]",
  },
];

const timelineSteps = [
  { text: "Pick any vendor, account, or entity ID", active: true },
  {
    text: "All evidence events sorted chronologically across sources",
    active: false,
  },
  {
    text: "Drill into transactions, flags, and agent findings at each point",
    active: false,
  },
];

export default function Home() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Outfit:wght@300;400;500;600&display=swap');
        .font-playfair { font-family: 'Playfair Display', serif; }
        .font-outfit { font-family: 'Outfit', sans-serif; }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        .card-arrow { opacity: 0; transform: translateX(-6px); transition: all 0.18s; }
        .module-card:hover .card-arrow { opacity: 1; transform: translateX(0); }
        .module-card:hover .card-num { color: #D97B4F; }
        .timeline-left:hover .card-arrow { opacity: 1; transform: translateX(0); }
        .timeline-left:hover .tl-num { color: #D97B4F; }
      `}</style>

      <div className="font-outfit bg-[#F7F3EE] min-h-screen text-[#1A1612]">
        {/* Top bar */}
        <div className="bg-[#1A1612] flex items-center justify-between px-12 h-[52px]">
          <div className="flex items-center gap-6">
            <span className="font-outfit font-semibold text-sm tracking-widest text-[#F7F3EE] uppercase">
              Sentinel
            </span>
            <div className="w-px h-4 bg-[#3A3430]" />
            <span className="text-[11px] text-[#6B5E52] tracking-wide">
              Fraud Investigation System
            </span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 bg-[#2A2420] border border-[#3A3430] rounded-full px-3 py-[5px]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#D97B4F] animate-pulse-dot" />
              <span className="text-[11px] text-[#D97B4F] tracking-wider font-medium">
                System online
              </span>
            </div>
            <span className="text-[11px] text-[#3A3430] tracking-wide">
              v0.1.0-dev
            </span>
          </div>
        </div>

        {/* Hero */}
        <div className="px-12 pt-16 pb-14 grid grid-cols-[1fr_auto] items-end gap-10 border-b border-[#E0D8CF]">
          <div>
            <div className="flex items-center gap-2.5 mb-5">
              <div
                className="w-6 h-px bg-[#D97B4F]"
                style={{ height: "1.5px" }}
              />
              <span className="text-[11px] font-medium tracking-[0.18em] text-[#D97B4F] uppercase">
                AI-powered detection
              </span>
            </div>
            <h1 className="font-playfair text-[68px] font-black leading-[0.92] tracking-tight text-[#1A1612] mb-7">
              Follow the
              <br />
              <em className="text-[#8B5E3C]">money.</em>
            </h1>
            <p className="text-[15px] font-light text-[#6B5E52] leading-[1.75] max-w-[420px]">
              A six-agent AI pipeline for real-time financial fraud
              investigation — built on PostgreSQL, Neo4j graph traversal, and
              Groq inference.
            </p>
          </div>
          <div className="flex flex-row gap-2 items-end pb-1">
            {[
              { num: "6", lbl: "Active agents" },
              { num: "Neo4j", lbl: "Graph engine" },
              { num: "70B", lbl: "LLaMA via Groq" },
            ].map(({ num, lbl }) => (
              <div
                key={lbl}
                className="flex items-baseline gap-2 bg-[#EDE7DF] border border-[#D8CEBF] rounded-md px-4 py-2.5 whitespace-nowrap"
              >
                <span className="font-playfair text-[22px] font-bold text-[#1A1612]">
                  {num}
                </span>
                <span className="text-[11px] text-[#9B8E82] tracking-wide font-normal">
                  {lbl}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Modules */}
        <div className="px-12 pb-12">
          <div className="flex items-center justify-between py-8 border-b border-[#E0D8CF] mb-px">
            <span className="text-[11px] font-medium tracking-[0.2em] text-[#9B8E82] uppercase">
              Modules
            </span>
            <span className="text-[11px] text-[#C4B8AC] tracking-wide">
              7 active &nbsp;·&nbsp; 1 coming soon
            </span>
          </div>

          <div className="grid grid-cols-3">
            {modules.map(
              ({ href, code, label, desc, badge, badgeStyle, live }, i) => (
                <Link
                  key={href}
                  href={href}
                  className={`module-card flex flex-col border-b border-[#E0D8CF] p-7 bg-[#F7F3EE] hover:bg-[#F0E9E0] transition-colors duration-200 cursor-pointer
                  ${(i + 1) % 3 !== 0 ? "border-r border-[#E0D8CF]" : ""}`}
                >
                  <div className="flex items-center justify-between mb-[18px]">
                    <span className="card-num text-[11px] font-medium tracking-[0.15em] text-[#C4B8AC] transition-colors duration-200">
                      {code}
                    </span>
                    <span
                      className={`text-[10px] font-medium tracking-wide px-2.5 py-[3px] rounded-full ${badgeStyle}`}
                    >
                      {live && (
                        <span
                          className="inline-block w-[5px] h-[5px] bg-[#D97B4F] rounded-full mr-[5px] animate-pulse-dot"
                          style={{ verticalAlign: "1px" }}
                        />
                      )}
                      {badge}
                    </span>
                  </div>
                  <div className="font-playfair text-[22px] font-bold text-[#1A1612] mb-2 leading-tight">
                    {label}
                  </div>
                  <div className="text-[13px] font-light text-[#9B8E82] leading-[1.65] flex-1">
                    {desc}
                  </div>
                  <div className="card-arrow mt-5 text-[12px] text-[#D97B4F] font-medium tracking-wide">
                    Open module →
                  </div>
                </Link>
              ),
            )}

            {/* Evidence Timeline — full-width card */}
            <div className="col-span-3 grid grid-cols-[1fr_2fr]">
              <Link
                href="/timeline"
                className="timeline-left flex flex-col p-7 border-r border-[#E0D8CF] bg-[#F7F3EE] hover:bg-[#F0E9E0] transition-colors duration-200"
              >
                <div className="flex items-center justify-between mb-[18px]">
                  <span className="tl-num text-[11px] font-medium tracking-[0.15em] text-[#C4B8AC] transition-colors duration-200">
                    07
                  </span>
                  <span className="text-[10px] font-medium tracking-wide px-2.5 py-[3px] rounded-full bg-[#F5EBE0] text-[#C06030] border border-[#E8CEB0]">
                    Timeline
                  </span>
                </div>
                <div className="font-playfair text-[22px] font-bold text-[#1A1612] mb-2 leading-tight">
                  Evidence Timeline
                </div>
                <div className="text-[13px] font-light text-[#9B8E82] leading-[1.65] flex-1">
                  Chronological reconstruction of all fraud evidence for any
                  entity.
                </div>
                <div className="card-arrow mt-5 text-[12px] text-[#D97B4F] font-medium tracking-wide">
                  Open module →
                </div>
              </Link>
              <div className="flex flex-col justify-center p-8 bg-[#F0E9E0]">
                <div className="text-[11px] text-[#C4B8AC] tracking-[0.12em] uppercase mb-3.5">
                  How it works
                </div>
                <div className="flex flex-col gap-2.5">
                  {timelineSteps.map(({ text, active }) => (
                    <div key={text} className="flex items-start gap-3">
                      <div
                        className={`w-1.5 h-1.5 rounded-full mt-[5px] shrink-0 ${
                          active ? "bg-[#D97B4F]" : "bg-[#C4B8AC]"
                        }`}
                      />
                      <span className="text-[13px] text-[#6B5E52] font-light leading-relaxed">
                        {text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Coming soon */}
          <div className="border-t border-[#E0D8CF] mt-20">
            {/* <div className="flex items-center justify-between px-7 py-3.5">
              <span className="text-[12px] text-[#C4B8AC] tracking-wide">
                08 — Risk Scoring Engine
              </span>
              <span className="text-[10px] tracking-widest text-[#C4B8AC] border border-[#DDD4C8] px-2 py-[2px] rounded-full">
                Coming soon
              </span>
            </div> */}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white/50 backdrop-blur-sm px-12 py-5 flex items-center justify-between flex-wrap gap-4 fixed bottom-0 left-0 right-0">
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
