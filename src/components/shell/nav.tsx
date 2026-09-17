"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/", label: "Overview", key: "overview" },
  { href: "/calendar", label: "Calendar", key: "calendar" },
  { href: "/ads", label: "Ads", key: "ads" },
  { href: "/content", label: "Content", key: "content" },
  { href: "/companies", label: "Companies", key: "companies" },
];

/**
 * Horizontal navigation for narrow screens, where the left rail is hidden.
 */
export function MobileNav() {
  const pathname = usePathname();
  const all = [...LINKS, { href: "/setup", label: "Setup", key: "setup" }];

  return (
    <nav
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-hairline px-4 py-1.5 md:hidden"
      aria-label="Main"
    >
      {all.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.key}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "shrink-0 rounded px-2 py-1 text-[12px] transition-colors",
              active
                ? "bg-raised font-medium text-ink"
                : "text-ink-secondary hover:bg-raised hover:text-ink",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.key}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "rounded px-2.5 py-1.5 text-[13px] transition-colors",
              active
                ? "bg-raised font-medium text-ink"
                : "text-ink-secondary hover:bg-raised hover:text-ink",
            )}
          >
            {link.label}
          </Link>
        );
      })}

      <div className="my-2 border-t border-hairline" />

      <Link
        href="/setup"
        aria-current={pathname.startsWith("/setup") ? "page" : undefined}
        className={clsx(
          "rounded px-2.5 py-1.5 text-[13px] transition-colors",
          pathname.startsWith("/setup")
            ? "bg-raised font-medium text-ink"
            : "text-ink-muted hover:bg-raised hover:text-ink",
        )}
      >
        Setup
      </Link>
    </nav>
  );
}
