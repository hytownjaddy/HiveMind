"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "./nav";

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="mt-6 flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-hive-amber"
                : "rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
