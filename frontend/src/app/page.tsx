import Link from "next/link";

const modules = [
  {
    href: "/feed",
    code: "01",
    label: "Live Feed",
    desc: "Real-time flagged transaction stream. Auto-polls every 5s.",
    stat: "LIVE",
    statColor: "#e63535",
    live: true,
  },
  {
    href: "/investigate",
    code: "02",
    label: "Investigate",
    desc: "Run a full 6-agent pipeline against any vendor or entity.",
    stat: "6 AGENTS",
    statColor: "#22d3ee",
    live: false,
  },
  {
    href: "/report",
    code: "03",
    label: "Report",
    desc: "Structured fraud report with risk gauge and evidence trail.",
    stat: "BLOCKING",
    statColor: "#f59e0b",
    live: false,
  },
  {
    href: "/graph",
    code: "04",
    label: "Graph",
    desc: "Neo4j relationship map. Entities, transactions, sanctions.",
    stat: "NEO4J",
    statColor: "#a855f7",
    live: false,
  },
  {
    href: "/trace",
    code: "05",
    label: "SQL Trace",
    desc: "Coral federated query audit log with timing and cache status.",
    stat: "AUDIT",
    statColor: "#22c55e",
    live: false,
  },
  {
    href: "/dashboard",
    code: "06",
    label: "Dashboard",
    desc: "System overview — exposure, top vendors, query stats.",
    stat: "OVERVIEW",
    statColor: "#378add",
    live: false,
  },
  {
    href: "/timeline",
    code: "07",
    label: "Evidence Timeline",
    desc: "Chronological reconstruction of all fraud evidence for any entity.",
    stat: "TIMELINE",
    statColor: "#f97316",
    live: false,
  },
];
const dimmed = [
  { code: "06", label: "Dashboard", desc: "Coming soon" },
  { code: "07", label: "Timeline", desc: "Coming soon" },
];

export default function Home() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .home-root {
          min-height: 100vh;
          background: #020817;
          font-family: 'IBM Plex Sans', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 32px;
          position: relative;
          overflow: hidden;
        }

        .grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        .scan-line {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: rgba(230, 53, 53, 0.15);
          animation: scan 8s linear infinite;
          pointer-events: none;
        }
        @keyframes scan {
          0%   { top: 0; }
          100% { top: 100%; }
        }

        .home-inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 960px;
        }

        .brand-row {
          display: flex;
          align-items: baseline;
          gap: 16px;
          margin-bottom: 8px;
        }

        .brand {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 48px;
          font-weight: 500;
          letter-spacing: -0.02em;
          color: #f1f5f9;
          line-height: 1;
        }
        .brand em { color: #e63535; font-style: normal; }
        .brand-slash { color: #1e293b; }

        .brand-version {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: #334155;
          letter-spacing: 0.1em;
          padding: 3px 8px;
          border: 1px solid #1e293b;
          border-radius: 3px;
        }

        .tagline {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          color: #475569;
          letter-spacing: 0.05em;
          margin-bottom: 56px;
        }
        .tagline span { color: #e63535; }

        .modules-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1px;
          background: #0f172a;
          border: 1px solid #0f172a;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 1px;
        }

        .module-card {
          background: #020817;
          padding: 28px;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: background 0.15s;
          cursor: pointer;
          position: relative;
        }
        .module-card::after {
          content: '';
          position: absolute;
          bottom: 0; left: 28px; right: 28px;
          height: 1px;
          background: #0f172a;
        }
        .module-card:hover { background: #0a1628; }
        .module-card:hover .module-arrow { opacity: 1; transform: translateX(0); }

        .module-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .module-code {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          color: #1e293b;
          letter-spacing: 0.15em;
        }

        .module-stat {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.12em;
          padding: 3px 7px;
          border-radius: 2px;
        }

        .live-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #e63535;
          margin-right: 5px;
          animation: blink 1.5s ease-in-out infinite;
          vertical-align: middle;
        }
        @keyframes blink {
          0%,100% { opacity: 1; }
          50% { opacity: 0.2; }
        }

        .module-label {
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 20px;
          font-weight: 500;
          color: #f1f5f9;
          letter-spacing: -0.01em;
        }

        .module-desc {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: #475569;
          line-height: 1.6;
        }

        .module-arrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: #334155;
          opacity: 0;
          transform: translateX(-4px);
          transition: all 0.15s;
          margin-top: auto;
        }

        .dimmed-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1px;
          background: #0a0a0a;
          border: 1px solid #0a0a0a;
          border-radius: 0 0 8px 8px;
          overflow: hidden;
        }

        .module-card-dim {
          background: #020817;
          padding: 20px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .dim-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: #1e293b;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .dim-badge {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px;
          color: #0f172a;
          border: 1px solid #0f172a;
          padding: 2px 7px;
          border-radius: 2px;
          letter-spacing: 0.1em;
        }

        .footer-row {
          margin-top: 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .footer-stat {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          color: #1e293b;
          letter-spacing: 0.1em;
        }
        .footer-stat span { color: #334155; }
      `}</style>

      <div className="home-root">
        <div className="grid-bg" />
        <div className="scan-line" />

        <div className="home-inner">
          {/* Brand */}
          <div className="brand-row">
            <div className="brand">
              <em>SENTINEL</em><span className="brand-slash">/</span>AI
            </div>
            <div className="brand-version">v0.1.0-dev</div>
          </div>
          <div className="tagline">
            Fraud investigation system — <span>6-agent pipeline</span> · PostgreSQL · Neo4j · Groq
          </div>

          {/* Module cards */}
          <div className="modules-grid">
            {modules.map(({ href, code, label, desc, stat, statColor, live }) => (
              <Link key={href} href={href} className="module-card">
                <div className="module-top">
                  <span className="module-code">{code}</span>
                  <span
                    className="module-stat"
                    style={{
                      color: statColor,
                      background: `${statColor}12`,
                      border: `1px solid ${statColor}30`,
                    }}
                  >
                    {live && <span className="live-dot" />}
                    {stat}
                  </span>
                </div>
                <div className="module-label">{label}</div>
                <div className="module-desc">{desc}</div>
                <div className="module-arrow">→ open</div>
              </Link>
            ))}
          </div>

          {/* Dimmed / coming soon */}
          <div className="dimmed-grid">
            {dimmed.map(({ code, label }) => (
              <div key={code} className="module-card-dim">
                <span className="dim-label">{code} — {label}</span>
                <span className="dim-badge">SOON</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="footer-row">
            <span className="footer-stat">
              SENTINELDB · <span>port 5433</span>
            </span>
            <span className="footer-stat">
              NEO4J · <span>port 7687</span>
            </span>
            <span className="footer-stat">
              API · <span>port 8000</span>
            </span>
            <span className="footer-stat">
              GROQ · <span>llama-3.3-70b-versatile</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}