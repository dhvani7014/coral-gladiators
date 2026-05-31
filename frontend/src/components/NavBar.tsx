"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/feed", label: "Feed", live: true },
  { href: "/investigate", label: "Investigate", live: false },
  { href: "/report", label: "Report", live: false },
  { href: "/graph", label: "Graph", live: false },
  { href: "/trace", label: "Trace", live: false },
];

const dimmed = [{ label: "Dashboard" }, { label: "Timeline" }];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center h-12 px-6 bg-[#0a0a0a] border-b border-[#1f1f1f] shrink-0">
      {/* Brand */}
      <Link
        href="/"
        className="font-mono text-[13px] font-medium tracking-widest text-[#e63535] mr-8 select-none hover:text-[#ff4444] transition-colors"
      >
        SENTINEL<span className="text-[#444]">/</span>AI
      </Link>

      {/* Active links */}
      <div className="flex items-stretch h-full">
        {links.map(({ href, label, live }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-1.5 px-3.5 font-mono text-[11px] tracking-widest uppercase border-b-2 transition-colors duration-150",
                active
                  ? "text-[#e63535] border-[#e63535]"
                  : "text-[#555] border-transparent hover:text-[#aaa]",
              ].join(" ")}
            >
              {live ? (
                <span
                  className={[
                    "w-[5px] h-[5px] rounded-full shrink-0",
                    active ? "bg-[#e63535] animate-pulse" : "bg-[#555]",
                  ].join(" ")}
                />
              ) : (
                <span
                  className={[
                    "w-[5px] h-[5px] rounded-full shrink-0",
                    active ? "bg-[#e63535]" : "bg-current",
                  ].join(" ")}
                />
              )}
              {label}
            </Link>
          );
        })}

        {/* Dimmed / not yet built */}
        {dimmed.map(({ label }) => (
          <span
            key={label}
            className="flex items-center px-3.5 font-mono text-[11px] tracking-widest uppercase text-[#2a2a2a] cursor-default select-none border-b-2 border-transparent"
          >
            {label}
          </span>
        ))}
      </div>

      {/* Spacer + status */}
      <div className="flex-1" />
      <span className="font-mono text-[10px] text-[#2a2a2a] tracking-wide">
        Coral · 4 sources
      </span>
    </nav>
  );
}
