"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "../actions";

const links = [
  { href: "/", label: "Arena" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/playbook", label: "Playbook" },
  { href: "/field-guide", label: "Troops & towers" },
  { href: "/how-to-play", label: "How to play" },
];

const item = "flex items-center border-b-2 border-transparent text-[13px] font-medium text-sand hover:text-parchment aria-[current=page]:border-jade aria-[current=page]:text-parchment";


/** The signed-in account as one menu: your profile, and signing out. */
function AccountMenu({ handle, current }: { handle: string; current: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <div ref={ref} className="relative flex flex-none items-stretch">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-current={current ? "page" : undefined} onClick={() => setOpen((o) => !o)} className={`${item} cursor-pointer gap-1`}>
        @{handle}
        <svg aria-hidden viewBox="0 0 12 12" className={`size-3 fill-none stroke-current stroke-[1.5] transition-transform ${open ? "rotate-180" : ""}`}><path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1.5 w-44 rounded-lg border border-bronze bg-walnut p-1 text-[13px] shadow-xl shadow-black/40">
          <Link role="menuitem" href={`/players/${handle}`} onClick={() => setOpen(false)} className="block rounded-md px-2.5 py-1.5 text-parchment hover:bg-elevated">Your profile</Link>
          <div className="my-1 border-t border-bronze" />
          <form action={signOut}><button role="menuitem" className="block w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left text-parchment hover:bg-elevated">Sign out</button></form>
        </div>
      )}
    </div>
  );
}

/** The site's frame: the destinations on the left, and once signed in, the account on the right. */
export function SiteNav({ handle }: { handle: string | null }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="border-b border-bronze bg-walnut">
      {/* The bar shares its edges with the page below it (.site-frame). On a phone the links scroll sideways and the account stays put. */}
      <div className="site-frame flex h-[47px] items-stretch gap-4 whitespace-nowrap sm:gap-6">
        <Link href="/" className="hidden flex-none items-center gap-2 text-[14px] font-semibold text-parchment sm:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-6" />Tower Defender
        </Link>
        <div className="flex min-w-0 flex-1 items-stretch gap-5 overflow-x-auto [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)] [scrollbar-width:none] sm:gap-6 md:[mask-image:none]">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={item}>{label}</Link>
          ))}
        </div>
        {handle && <AccountMenu handle={handle} current={pathname === `/players/${handle}`} />}
      </div>
    </nav>
  );
}
