"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "../actions";

const links = [
  { href: "/", label: "Arena" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/playbook", label: "Playbook" },
  { href: "/field-guide", label: "Troops & towers" },
  { href: "/how-to-play", label: "How to play" },
];

const item = "flex items-center border-b-2 border-transparent text-sm font-medium text-sand hover:text-parchment aria-[current=page]:border-jade aria-[current=page]:text-parchment";

/** The site's frame: the destinations on the left, the account on the right. */
export function SiteNav({ handle }: { handle: string | null }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="border-b border-bronze bg-walnut">
      {/* As wide as the widest page (a match), so the bar reads as the site's frame. On a phone the links scroll sideways and the account stays put. */}
      <div className="mx-auto flex h-[47px] max-w-[1120px] items-stretch gap-4 px-4 whitespace-nowrap sm:gap-7">
        <Link href="/" className="hidden flex-none items-center gap-2 font-semibold text-parchment sm:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-6" />Tower Defender
        </Link>
        <div className="flex min-w-0 flex-1 items-stretch gap-5 overflow-x-auto [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)] [scrollbar-width:none] sm:gap-7 sm:[mask-image:none]">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={item}>{label}</Link>
          ))}
        </div>
        <div className="flex flex-none items-center gap-4">
          {handle ? (
            <>
              <Link href={`/players/${handle}`} aria-current={pathname === `/players/${handle}` ? "page" : undefined} className={`${item} self-stretch`}>@{handle}</Link>
              <form action={signOut} className="flex items-center"><button className="cursor-pointer text-sm text-sand hover:text-parchment">Sign out</button></form>
            </>
          ) : (
            <Link href="/#sign-in" className="rounded-md bg-jade px-3 py-1 text-sm font-semibold text-charcoal hover:bg-[#93d3c3]">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
