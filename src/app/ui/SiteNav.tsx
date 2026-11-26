"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Arena" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/playbook", label: "Playbook" },
  { href: "/field-guide", label: "Troops & towers" },
  { href: "/how-to-play", label: "How to play" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="border-b border-bronze bg-walnut">
      {/* As wide as the widest page (a match), so the bar reads as the site's frame. On a phone the links scroll sideways. */}
      <div className="mx-auto flex h-[47px] max-w-[1120px] items-stretch gap-5 overflow-x-auto px-4 whitespace-nowrap [scrollbar-width:none] sm:gap-7">
        <Link href="/" className="hidden items-center font-semibold text-parchment sm:flex">Tower Defender</Link>
        {links.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
            className="flex items-center border-b-2 border-transparent text-sm font-medium text-sand hover:text-parchment aria-[current=page]:border-jade aria-[current=page]:text-parchment">
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
