"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Button, Dot, EmptyState } from "@/components/ui/primitives";
import { ItemDrawer } from "@/components/item/drawer";
import {
  channelColor,
  sourceColor,
  STATUS_BUCKET_COLOR,
} from "@/lib/presentation";
import { dayKey, itemDayKey } from "@/lib/derive";
import type { AdWithRefs, MediaItem, Person } from "@/lib/types";
import type { StatusOption } from "@/lib/status-options";

/**
 * Month and week calendar over the three media databases. Everything is
 * computed from the item list the server already sent, so switching months
 * is instant and never re-queries Notion.
 */

type Mode = "month" | "week";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function CalendarView({
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
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState(() => startOfToday());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const item of items) {
      const key = itemDayKey(item);
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.title.localeCompare(b.title));
    }
    return map;
  }, [items]);

  const days = useMemo(
    () => (mode === "month" ? monthGrid(anchor) : weekGrid(anchor)),
    [mode, anchor],
  );

  const undated = useMemo(
    () => items.filter((item) => !item.publishDate),
    [items],
  );

  const selected = selectedId
    ? (items.find((item) => item.id === selectedId) ?? null)
    : null;

  const step = (direction: number) => {
    const next = new Date(anchor);
    if (mode === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * 7);
    setAnchor(next);
  };

  const todayKey = dayKey(new Date());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => step(-1)} title="Previous">
            ←
          </Button>
          <Button size="sm" onClick={() => setAnchor(startOfToday())}>
            Today
          </Button>
          <Button size="sm" onClick={() => step(1)} title="Next">
            →
          </Button>
        </div>

        <h2 className="text-[13px] font-medium">
          {mode === "month"
            ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
            : weekLabel(anchor)}
        </h2>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant={mode === "month" ? "primary" : "default"}
            onClick={() => setMode("month")}
          >
            Month
          </Button>
          <Button
            size="sm"
            variant={mode === "week" ? "primary" : "default"}
            onClick={() => setMode("week")}
          >
            Week
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
        <div className="grid grid-cols-7 border-b border-hairline">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-ink-muted"
            >
              {weekday}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day);
            const dayItems = byDay.get(key) ?? [];
            const inMonth = mode === "week" || day.getMonth() === anchor.getMonth();
            const isToday = key === todayKey;

            return (
              <div
                key={key}
                className={clsx(
                  "border-b border-r border-hairline p-1.5",
                  mode === "month" ? "min-h-[104px]" : "min-h-[240px]",
                  !inMonth && "bg-plane/40",
                )}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className={clsx(
                      "tabular text-[11px]",
                      isToday
                        ? "rounded bg-series-1 px-1 font-medium text-white"
                        : inMonth
                          ? "text-ink-secondary"
                          : "text-ink-muted",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {dayItems.length > 3 && mode === "month" && (
                    <span className="tabular text-[10px] text-ink-muted">
                      {dayItems.length}
                    </span>
                  )}
                </div>

                <ul className="space-y-1">
                  {(mode === "month" ? dayItems.slice(0, 3) : dayItems).map(
                    (item) => (
                      <li key={item.id}>
                        <CalendarChip
                          item={item}
                          onClick={() => setSelectedId(item.id)}
                        />
                      </li>
                    ),
                  )}
                  {mode === "month" && dayItems.length > 3 && (
                    <li className="px-1 text-[10px] text-ink-muted">
                      +{dayItems.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-lg border border-hairline bg-surface">
          <header className="border-b border-hairline px-3 py-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-secondary">
              No publish date ({undated.length})
            </h2>
          </header>
          <ul className="flex flex-wrap gap-1.5 p-2">
            {undated.map((item) => (
              <li key={item.id}>
                <CalendarChip item={item} onClick={() => setSelectedId(item.id)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 && (
        <EmptyState
          title="Nothing matches these filters."
          hint="Clear a filter, or check that the publish date property is mapped in Setup."
        />
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

/** One item on a day cell: colour by channel, label always present. */
function CalendarChip({
  item,
  onClick,
}: {
  item: MediaItem;
  onClick: () => void;
}) {
  const color =
    item.channels.length > 0
      ? channelColor(item.channels[0])
      : sourceColor(item.source);

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${item.title} · ${item.status.name ?? "No status"}`}
      className="flex w-full items-center gap-1 rounded border border-hairline bg-raised px-1 py-0.5 text-left transition-colors hover:bg-hover"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <span className="min-w-0 flex-1 truncate text-[11px] text-ink">
        {item.title}
      </span>
      {item.adIds.length > 0 && (
        <span
          className="tabular shrink-0 rounded bg-surface px-1 text-[10px] text-ink-secondary"
          title={`${item.adIds.length} ad${item.adIds.length > 1 ? "s" : ""} placed here`}
        >
          {item.adIds.length} ad
        </span>
      )}
      <Dot
        color={STATUS_BUCKET_COLOR[item.status.bucket]}
        className="shrink-0"
      />
    </button>
  );
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

/** Six Monday-started weeks covering the anchor's month. */
function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function weekGrid(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function weekLabel(anchor: Date): string {
  const start = startOfWeek(anchor);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startLabel = `${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)}`;
  const endLabel = `${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)}`;
  return `${startLabel} – ${endLabel} ${end.getFullYear()}`;
}
