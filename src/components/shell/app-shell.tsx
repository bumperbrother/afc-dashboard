import Link from "next/link";
import type { ReactNode } from "react";
import { MobileNav, Nav } from "./nav";
import { RefreshButton } from "./refresh-button";
import { LastSynced } from "./last-synced";
import { Notice } from "@/components/ui/primitives";
import type { Snapshot } from "@/lib/types";

/**
 * The frame every page sits in: a left rail for navigation, a top bar for
 * sync state, and a scrolling content column.
 */
export function AppShell({
  snapshot,
  title,
  subtitle,
  toolbar,
  children,
}: {
  snapshot: Snapshot;
  title: string;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-48 shrink-0 flex-col border-r border-hairline bg-surface px-3 py-4 md:flex">
        <Link href="/" className="mb-5 block px-2.5">
          <span className="block text-[13px] font-semibold leading-tight tracking-tight">
            AFC
          </span>
          <span className="block text-[11px] leading-tight text-ink-muted">
            Command Center
          </span>
        </Link>

        <Nav />

        <div className="mt-auto px-2.5 pt-4">
          {snapshot.isMock && (
            <p className="mb-2 text-[11px] text-warning">Sample data</p>
          )}
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="text-[11px] text-ink-muted transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-hairline bg-plane/95 backdrop-blur">
          <div className="px-4">
            <MobileNav />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
              {subtitle && (
                <div className="text-[12px] text-ink-muted">{subtitle}</div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {snapshot.isMock && (
                <span className="text-[11px] text-warning md:hidden">Sample data</span>
              )}
              <LastSynced fetchedAt={snapshot.fetchedAt} />
              <RefreshButton />
              <form action="/api/logout" method="post" className="md:hidden">
                <button
                  type="submit"
                  className="text-[11px] text-ink-muted transition-colors hover:text-ink"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          {toolbar && (
            <div className="border-t border-hairline px-4 py-2">{toolbar}</div>
          )}
        </header>

        <main className="flex-1 px-4 py-4">
          {snapshot.warnings.length > 0 && (
            <div className="mb-4">
              <Notice tone="warning">
                <p className="font-medium text-ink">
                  Some data could not be loaded.
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {snapshot.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <p className="mt-1.5">
                  <Link href="/setup" className="text-series-1 hover:underline">
                    Open Setup
                  </Link>{" "}
                  to check the connection and property mapping.
                </p>
              </Notice>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
