"use client";

import { useMemo, useState } from "react";
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
import { parseDate } from "@/lib/derive";
import {
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

  const sorted = useMemo(() => sortItems(items, sort), [items, sort]);

  const groups = useMemo(() => {
    if (grouping === "none") {
      return [{ key: "all", label: null as string | null, items: sorted }];
    }
    return STATUS_BUCKETS.map((bucket) => ({
      key: bucket,
      label: STATUS_BUCKET_LABELS[bucket],
      items: sorted.filter((item) => item.status.bucket === bucket),
    })).filter((group) => group.items.length > 0);
  }, [sorted, grouping]);

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
          {items.length} items
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
