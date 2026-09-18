"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
import type { AdWithRefs } from "@/lib/types";
import {
  searchPlacementTargets,
  type PlacementCandidate,
} from "@/app/ads/actions";

/**
 * Pick the piece of media an ad runs on. Only main content and shorts are
 * offered: clips never carry sponsorships.
 */
export function PlacePicker({
  ad,
  onClose,
}: {
  ad: AdWithRefs;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlacementCandidate[]>([]);
  const [loading, setLoading] = useState(true);
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
   * Results come from the server, debounced, so the page never has to carry
   * every content row just in case someone opens this dialog.
   */
  const runSearch = useCallback((term: string) => {
    let cancelled = false;
    setLoading(true);
    searchPlacementTargets(term)
      .then((found) => {
        if (!cancelled) setResults(found);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load placement options.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(query), query === "" ? 0 : 200);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

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
          {loading && results.length === 0 && (
            <li className="px-4 py-6 text-center text-[12px] text-ink-muted">
              Searching…
            </li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-4 py-6 text-center text-[12px] text-ink-muted">
              Nothing matches that search.
            </li>
          )}
          {results.map((item) => {
            const current = ad.placement?.id === item.id;
            const upcoming = item.upcoming;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={pending || current}
                  onClick={() => assign({ source: item.source, id: item.id })}
                  className="flex w-full items-center gap-2 border-b border-hairline px-4 py-2 text-left transition-colors hover:bg-raised disabled:opacity-60"
                >
                  <span
                    aria-hidden
                    className="h-7 w-0.5 shrink-0 rounded"
                    style={{
                      backgroundColor: item.channel
                        ? channelColor(item.channel)
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
                      {item.channel && (
                        <span className="whitespace-nowrap">{item.channel}</span>
                      )}
                      <span className="whitespace-nowrap">
                        {formatDate(item.publishDate)}
                        {item.publishDate && ` (${formatRelative(item.publishDate)})`}
                      </span>
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <Dot
                          color={
                            STATUS_BUCKET_COLOR[
                              item.statusBucket as keyof typeof STATUS_BUCKET_COLOR
                            ] ?? "var(--color-ink-muted)"
                          }
                        />
                        {item.statusName ?? "No status"}
                      </span>
                      {item.adCount > 0 && (
                        <span className="whitespace-nowrap text-warning">
                          {item.adCount} ad already here
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

