"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Dot, EmptyState } from "@/components/ui/primitives";
import { ItemDrawer } from "@/components/item/drawer";
import {
  channelColor,
  formatDate,
  formatRelative,
  SOURCE_LABEL,
  sourceColor,
  STATUS_BUCKET_COLOR,
} from "@/lib/presentation";
import { formatCount, parseDate } from "@/lib/derive";
import {
  hasMetrics,
  STATUS_BUCKETS,
  STATUS_BUCKET_LABELS,
  type AdWithRefs,
  type MediaItem,
  type Person,
  type StatusBucket,
} from "@/lib/types";
import type { StatusOption } from "@/lib/status-options";

type Grouping = "none" | "status";
type SortKey = "date" | "title" | "status";

const PAGE_SIZE = 100;

/**
 * One table over all three media databases. Grouping by status gives the
 * pipeline read without needing a drag-and-drop board.
 */
export function ContentTable({
  items,
  ads,
  statusOptionsBySource,
  people,
}: {
  items: MediaItem[];
  ads: AdWithRefs[];
  statusOptionsBySource: Record<string, StatusOption[]>;
  people: Person[];
}) {
  const [grouping, setGrouping] = useState<Grouping>("none");
  const [sort, setSort] = useState<SortKey>("date");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => sortItems(items, sort), [items, sort]);

  // The column only earns its width if something is actually recorded.
  const showMetrics = useMemo(
    () => items.some((item) => hasMetrics(item.metrics)),
    [items],
  );

  // A few thousand rows in one DOM tree makes scrolling and filtering crawl,
  // so the flat view pages. Grouping by status splits the list small enough
  // that paging it too would just hide rows for no gain.
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  const groups = useMemo(() => {
    if (grouping === "none") {
      const start = currentPage * PAGE_SIZE;
      return [
        {
          key: "all",
          label: null as string | null,
          items: sorted.slice(start, start + PAGE_SIZE),
        },
      ];
    }
    return STATUS_BUCKETS.map((bucket) => ({
      key: bucket,
      label: STATUS_BUCKET_LABELS[bucket],
      items: sorted.filter((item) => item.status.bucket === bucket),
    })).filter((group) => group.items.length > 0);
  }, [sorted, grouping, currentPage]);

  // Changing how the list is built invalidates whatever page you were on.
  useEffect(() => setPage(0), [grouping, sort, items.length]);

  const selected = selectedId
    ? (items.find((item) => item.id === selectedId) ?? null)
    : null;

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing matches these filters."
        hint="Clear a filter, or check the mapping in Setup."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-ink-muted">
          Group
        </span>
        <Button
          size="sm"
          variant={grouping === "none" ? "primary" : "default"}
          onClick={() => setGrouping("none")}
        >
          Flat
        </Button>
        <Button
          size="sm"
          variant={grouping === "status" ? "primary" : "default"}
          onClick={() => setGrouping("status")}
        >
          By status
        </Button>

        <span className="ml-3 text-[11px] uppercase tracking-wider text-ink-muted">
          Sort
        </span>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          aria-label="Sort by"
          className="rounded border border-line bg-raised px-1.5 py-1 text-[11px] text-ink outline-none focus:border-series-1"
        >
          <option value="date">Publish date</option>
          <option value="title">Title</option>
          <option value="status">Status</option>
        </select>

        <span className="tabular ml-auto text-[11px] text-ink-muted">
          {grouping === "none" && sorted.length > PAGE_SIZE
            ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, sorted.length)} of ${sorted.length}`
            : `${items.length} items`}
        </span>
      </div>

      {groups.map((group) => (
        <section
          key={group.key}
          className="overflow-hidden rounded-lg border border-hairline bg-surface"
        >
          {group.label && (
            <header className="flex items-center gap-2 border-b border-hairline px-3 py-1.5">
              <Dot color={STATUS_BUCKET_COLOR[group.key as StatusBucket]} />
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-secondary">
                {group.label}
              </h2>
              <span className="tabular text-[11px] text-ink-muted">
                {group.items.length}
              </span>
            </header>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline text-[11px] uppercase tracking-wider text-ink-muted">
                  <th className="px-3 py-1.5 font-normal">Title</th>
                  <th className="px-3 py-1.5 font-normal">Source</th>
                  <th className="px-3 py-1.5 font-normal">Channel</th>
                  <th className="px-3 py-1.5 font-normal">Publishes</th>
                  <th className="px-3 py-1.5 font-normal">Status</th>
                  <th className="px-3 py-1.5 font-normal">Owner</th>
                  {showMetrics && (
                    <th className="px-3 py-1.5 text-right font-normal">Reach</th>
                  )}
                  <th className="px-3 py-1.5 font-normal">Ads</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className="cursor-pointer border-b border-hairline last:border-b-0 hover:bg-raised"
                  >
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-3.5 w-0.5 shrink-0 rounded"
                          style={{
                            backgroundColor:
                              item.channels.length > 0
                                ? channelColor(item.channels[0])
                                : sourceColor(item.source),
                          }}
                        />
                        <span className="max-w-[340px] truncate text-[12px] text-ink">
                          {item.title}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-ink-secondary">
                      {SOURCE_LABEL[item.source]}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-ink-secondary">
                      {item.channels.join(", ") || "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="tabular whitespace-nowrap text-[11px] text-ink-secondary">
                        {formatDate(item.publishDate)}
                      </span>
                      {item.publishDate && (
                        <span className="ml-1.5 text-[11px] text-ink-muted">
                          {formatRelative(item.publishDate)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-secondary">
                        <Dot color={STATUS_BUCKET_COLOR[item.status.bucket]} />
                        {item.status.name ?? "Not set"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-ink-secondary">
                      {item.owners.map((owner) => owner.name).join(", ") || (
                        <span className="text-ink-muted">Unassigned</span>
                      )}
                    </td>
                    {showMetrics && (
                      <td
                        className="tabular px-3 py-1.5 text-right text-[11px] text-ink-secondary"
                        title={metricTitle(item)}
                      >
                        {formatCount(item.metrics.views ?? item.metrics.opens)}
                      </td>
                    )}
                    <td className="px-3 py-1.5">
                      {item.adIds.length > 0 ? (
                        <span className="tabular rounded bg-raised px-1 text-[11px] text-ink-secondary">
                          {item.adIds.length}
                        </span>
                      ) : (
                        <span className="text-[11px] text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {grouping === "none" && pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 py-1">
          <Button
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Previous
          </Button>
          <span className="tabular text-[11px] text-ink-muted">
            Page {currentPage + 1} of {pageCount}
          </span>
          <Button
            size="sm"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next →
          </Button>
        </div>
      )}

      {selected && (
        <ItemDrawer
          item={selected}
          ads={ads}
          statusOptions={statusOptionsBySource[selected.source] ?? []}
          people={people}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

/** Spell the numbers out on hover, since the column shows a compact form. */
function metricTitle(item: MediaItem): string {
  const parts: string[] = [];
  if (item.metrics.views !== null) {
    parts.push(`${item.metrics.views.toLocaleString()} views`);
  }
  if (item.metrics.opens !== null) {
    parts.push(`${item.metrics.opens.toLocaleString()} opens`);
  }
  if (item.metrics.clicks !== null) {
    parts.push(`${item.metrics.clicks.toLocaleString()} clicks`);
  }
  return parts.join(" · ") || "Nothing recorded";
}

const BUCKET_ORDER: Record<StatusBucket, number> = {
  inProgress: 0,
  scheduled: 1,
  planned: 2,
  published: 3,
  cancelled: 4,
};

function sortItems(items: MediaItem[], sort: SortKey): MediaItem[] {
  const copy = [...items];

  if (sort === "title") {
    return copy.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sort === "status") {
    return copy.sort((a, b) => {
      const rank = BUCKET_ORDER[a.status.bucket] - BUCKET_ORDER[b.status.bucket];
      if (rank !== 0) return rank;
      return a.title.localeCompare(b.title);
    });
  }

  // Soonest upcoming first, then undated, then most recently published.
  const now = Date.now();
  return copy.sort((a, b) => {
    const aTime = parseDate(a.publishDate)?.getTime() ?? null;
    const bTime = parseDate(b.publishDate)?.getTime() ?? null;
    const aUpcoming = aTime !== null && aTime >= now;
    const bUpcoming = bTime !== null && bTime >= now;

    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    if (aTime === null) return bTime === null ? a.title.localeCompare(b.title) : 1;
    if (bTime === null) return -1;
    return aUpcoming ? aTime - bTime : bTime - aTime;
  });
}
