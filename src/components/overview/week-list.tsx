import Link from "next/link";
import { Dot } from "@/components/ui/primitives";
import {
  channelColor,
  formatDate,
  SOURCE_LABEL,
  sourceColor,
  STATUS_BUCKET_COLOR,
} from "@/lib/presentation";
import { dayKey, itemDayKey } from "@/lib/derive";
import type { MediaItem } from "@/lib/types";

/** What goes out this week, grouped by day. */
export function WeekList({
  items,
  days,
}: {
  items: MediaItem[];
  days: Date[];
}) {
  const byDay = new Map<string, MediaItem[]>();
  for (const item of items) {
    const key = itemDayKey(item);
    if (!key) continue;
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }

  const todayKey = dayKey(new Date());

  return (
    <ul className="divide-y divide-hairline">
      {days.map((day) => {
        const key = dayKey(day);
        const dayItems = byDay.get(key) ?? [];
        const isToday = key === todayKey;

        return (
          <li key={key} className="flex gap-3 px-3 py-2">
            <div className="w-20 shrink-0">
              <p
                className={
                  isToday
                    ? "text-[12px] font-semibold text-ink"
                    : "text-[12px] text-ink-secondary"
                }
              >
                {formatDate(day)}
              </p>
              {isToday && <p className="text-[10px] text-series-1">Today</p>}
            </div>

            <div className="min-w-0 flex-1">
              {dayItems.length === 0 ? (
                <p className="text-[12px] text-ink-muted">Nothing scheduled</p>
              ) : (
                <ul className="space-y-1">
                  {dayItems.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-3 w-0.5 shrink-0 rounded"
                        style={{
                          backgroundColor:
                            item.channels.length > 0
                              ? channelColor(item.channels[0])
                              : sourceColor(item.source),
                        }}
                      />
                      <Link
                        href={`/content?q=${encodeURIComponent(item.title)}`}
                        className="min-w-0 flex-1 truncate text-[12px] text-ink hover:text-series-1"
                      >
                        {item.title}
                      </Link>
                      <span className="shrink-0 text-[11px] text-ink-muted">
                        {item.channels[0] ?? SOURCE_LABEL[item.source]}
                      </span>
                      {item.adIds.length > 0 && (
                        <span className="tabular shrink-0 rounded bg-raised px-1 text-[10px] text-ink-secondary">
                          {item.adIds.length} ad
                        </span>
                      )}
                      <Dot
                        color={STATUS_BUCKET_COLOR[item.status.bucket]}
                        className="shrink-0"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
