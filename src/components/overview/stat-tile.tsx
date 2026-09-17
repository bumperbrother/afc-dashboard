import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * A single headline number. No plot, no sparkline: one figure, its label, and
 * one line of context. The accent is a thin left rule, so the number itself
 * stays in text ink and is never colour-coded alone.
 */
export function StatTile({
  label,
  value,
  context,
  href,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  context?: ReactNode;
  href?: string;
  tone?: "neutral" | "good" | "warning" | "critical";
}) {
  const accent = {
    neutral: "var(--color-line)",
    good: "var(--color-good)",
    warning: "var(--color-warning)",
    critical: "var(--color-critical)",
  }[tone];

  const body = (
    <div
      className={clsx(
        "h-full rounded-lg border border-hairline bg-surface px-3 py-2.5 transition-colors",
        href && "hover:bg-raised",
      )}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <p className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-1 text-[24px] font-semibold leading-none text-ink">{value}</p>
      {context && (
        <p className="mt-1.5 text-[11px] leading-snug text-ink-secondary">
          {context}
        </p>
      )}
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  );
}
