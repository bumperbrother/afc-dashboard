import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Small hand-rolled primitives. Keeping these in one file makes the dense
 * look consistent without pulling in a component library.
 */

export function Card({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className={clsx(
        "rounded-lg border border-hairline bg-surface",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-secondary">
            {title}
          </h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** A coloured dot plus a label. Identity is never colour alone. */
export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-hairline bg-raised px-1.5 py-0.5 text-[11px] text-ink-secondary",
        className,
      )}
    >
      {color && <Dot color={color} />}
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "default",
  size = "md",
  disabled,
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-[12px]",
        variant === "primary" &&
          "border-transparent bg-series-1 text-white hover:brightness-110",
        variant === "default" &&
          "border-line bg-raised text-ink hover:bg-hover",
        variant === "ghost" &&
          "border-transparent bg-transparent text-ink-secondary hover:bg-raised hover:text-ink",
        variant === "danger" &&
          "border-line bg-raised text-critical hover:bg-hover",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
      <p className="text-[13px] text-ink-secondary">{title}</p>
      {hint && <p className="max-w-md text-[12px] text-ink-muted">{hint}</p>}
    </div>
  );
}

/** A short explanatory line above a dense view. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-ink-muted">{children}</p>;
}

export function Notice({
  tone = "warning",
  children,
}: {
  tone?: "warning" | "critical" | "info";
  children: ReactNode;
}) {
  const color =
    tone === "critical"
      ? "var(--color-critical)"
      : tone === "info"
        ? "var(--color-series-1)"
        : "var(--color-warning)";

  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-[12px] text-ink-secondary"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
