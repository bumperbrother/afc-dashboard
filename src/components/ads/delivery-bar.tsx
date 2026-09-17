import type { DeliverySummary } from "@/lib/derive";

/**
 * A stacked bar showing how far a sponsor's obligations have got: owed,
 * placed, published. Segments are separated by a 2px surface gap and the
 * counts are always written out, so the bar is never the only signal.
 */
export function DeliveryBar({
  summary,
  width = 160,
}: {
  summary: DeliverySummary;
  width?: number;
}) {
  const active = summary.owed + summary.placed + summary.published;
  if (active === 0) {
    return (
      <span className="text-[11px] text-ink-muted">No live obligations</span>
    );
  }

  const segments = [
    { key: "published", value: summary.published, color: "var(--color-good)", label: "published" },
    { key: "placed", value: summary.placed, color: "var(--color-series-4)", label: "placed" },
    { key: "owed", value: summary.owed, color: "var(--color-critical)", label: "owed" },
  ].filter((segment) => segment.value > 0);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <div
        className="flex h-2 max-w-full gap-[2px] overflow-hidden rounded-[3px]"
        style={{ width }}
        role="img"
        aria-label={segments
          .map((segment) => `${segment.value} ${segment.label}`)
          .join(", ")}
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="h-full rounded-[3px]"
            style={{
              backgroundColor: segment.color,
              flexGrow: segment.value,
              flexBasis: 0,
            }}
          />
        ))}
      </div>
      <span className="tabular whitespace-nowrap text-[11px] text-ink-secondary">
        {summary.published} live · {summary.placed} placed · {summary.owed} owed
      </span>
    </div>
  );
}
