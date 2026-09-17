"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Dot } from "@/components/ui/primitives";
import { placeAd } from "@/lib/notion/mutations";
import {
  channelColor,
  formatDate,
  formatRelative,
  SOURCE_LABEL,
  sourceColor,
  STATUS_BUCKET_COLOR,
} from "@/lib/presentation";
import { parseDate } from "@/lib/derive";
import type { AdWithRefs, MediaItem } from "@/lib/types";

/**
 * Pick the piece of media an ad runs on. Only main content and shorts are
 * offered: clips never carry sponsorships.
 */
export function PlacePicker({
  ad,
  candidates,
  onClose,
}: {
  ad: AdWithRefs;
  candidates: MediaItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Upcoming items first, since an ad almost always goes on something not yet
   * published; already-published items stay reachable at the bottom.
   */
  const ordered = useMemo(() => {
    const now = Date.now();
    const search = query.trim().toLowerCase();
    return candidates
      .filter(
        (item) =>
          item.source !== "clips" &&
          (!search || item.title.toLowerCase().includes(search)),
      )
      .map((item) => {
        const date = parseDate(item.publishDate);
        const time = date ? date.getTime() : null;
        const upcoming = time !== null && time >= now;
        return { item, time, upcoming };
      })
      .sort((a, b) => {
        if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
        if (a.time === null) return b.time === null ? 0 : 1;
        if (b.time === null) return -1;
        return a.upcoming ? a.time - b.time : b.time - a.time;
      })
      .slice(0, 60);
  }, [candidates, query]);

  const assign = (target: { source: "content" | "shorts"; id: string } | null) => {
    setError(null);
    startTransition(async () => {
      const result = await placeAd(ad.id, target);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Place ${ad.title}`}
        className="fixed left-1/2 top-16 z-40 flex max-h-[75vh] w-full max-w-lg -translate-x-1/2 flex-col rounded-lg border border-hairline bg-surface shadow-2xl"
      >
        <header className="border-b border-hairline px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-ink-muted">
            Place ad
          </p>
          <h2 className="mt-0.5 text-[14px] font-semibold leading-snug">
            {ad.title}
          </h2>
          {ad.company && (
            <p className="mt-0.5 text-[12px] text-ink-muted">{ad.company.title}</p>
          )}
        </header>

        <div className="border-b border-hairline px-4 py-2">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search content and shorts…"
            aria-label="Search content and shorts"
            className="w-full rounded border border-line bg-raised px-2 py-1.5 text-[12px] text-ink outline-none placeholder:text-ink-muted focus:border-series-1"
          />
        </div>

        {error && (
          <p className="border-b border-hairline px-4 py-2 text-[12px] text-critical">
            {error}
          </p>
        )}

        <ul className="flex-1 overflow-y-auto">
          {ordered.length === 0 && (
            <li className="px-4 py-6 text-center text-[12px] text-ink-muted">
              Nothing matches that search.
            </li>
          )}
          {ordered.map(({ item, upcoming }) => {
            const current = ad.placement?.id === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={pending || current}
                  onClick={() =>
                    assign({
                      source: item.source as "content" | "shorts",
                      id: item.id,
                    })
                  }
                  className="flex w-full items-center gap-2 border-b border-hairline px-4 py-2 text-left transition-colors hover:bg-raised disabled:opacity-60"
                >
                  <span
                    aria-hidden
                    className="h-7 w-0.5 shrink-0 rounded"
                    style={{
                      backgroundColor:
                        item.channels.length > 0
                          ? channelColor(item.channels[0])
                          : sourceColor(item.source),
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-ink">
                      {item.title}
                    </span>
                    {/*
                      Chunks are spaced rather than dot-separated: this line
                      wraps, and a wrapped row must never open with a stray
                      separator.
                    */}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-muted">
                      <span className="whitespace-nowrap">
                        {SOURCE_LABEL[item.source]}
                      </span>
                      {item.channels.length > 0 && (
                        <span className="whitespace-nowrap">{item.channels[0]}</span>
                      )}
                      <span className="whitespace-nowrap">
                        {formatDate(item.publishDate)}
                        {item.publishDate && ` (${formatRelative(item.publishDate)})`}
                      </span>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Dot color={STATUS_BUCKET_COLOR[item.status.bucket]} />
                        {item.status.name ?? "No status"}
                      </span>
                      {item.adIds.length > 0 && (
                        <span className="whitespace-nowrap text-warning">
                          {item.adIds.length} ad already here
                        </span>
                      )}
                    </span>
                  </span>
                  {current && (
                    <span className="shrink-0 text-[11px] text-ink-muted">
                      Current
                    </span>
                  )}
                  {!current && upcoming && (
                    <span className="shrink-0 text-[11px] text-good">Upcoming</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-2.5">
          {ad.placement ? (
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => assign(null)}
            >
              Unassign
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </footer>
      </div>
    </>
  );
}

