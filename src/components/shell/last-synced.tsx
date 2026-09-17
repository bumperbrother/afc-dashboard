"use client";

import { useEffect, useState } from "react";
import { formatSince } from "@/lib/presentation";

/**
 * Rendered on the client so the relative time keeps ticking, and so it never
 * mismatches between the server render and the browser.
 */
export function LastSynced({ fetchedAt }: { fetchedAt: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(formatSince(fetchedAt));
    update();
    const timer = setInterval(update, 20_000);
    return () => clearInterval(timer);
  }, [fetchedAt]);

  return (
    <span className="text-[11px] text-ink-muted">
      {label ? `Synced ${label}` : "Synced"}
    </span>
  );
}
