import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/analytics/index", label: "Card Index" },
  { href: "/analytics/arbitrage", label: "Arbitrage" },
  { href: "/analytics/signals", label: "Signals" },
  { href: "/portfolio/performance", label: "Portfolio" },
];

export function AnalyticsNav() {
  return (
    <nav className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
