"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";

/**
 * Filter controls that write to the URL. Keeping state in the query string
 * means a filtered view is shareable and the back button behaves.
 */

export interface FilterOption {
  value: string;
  label: string;
  color?: string;
  count?: number;
}

/** One multi-select group rendered as a row of toggle chips. */
export function ChipGroup({
  paramKey,
  label,
  options,
}: {
  paramKey: string;
  label: string;
  options: FilterOption[];
}) {
  const { values, toggle } = useUrlList(paramKey);
  if (options.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[11px] uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {options.map((option) => {
          const active = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(option.value)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] transition-colors",
                active
                  ? "border-series-1 bg-raised text-ink"
                  : "border-hairline bg-transparent text-ink-secondary hover:border-line hover:text-ink",
              )}
            >
              {option.color && (
                <span
                  aria-hidden
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
              )}
              {option.label}
              {option.count !== undefined && (
                <span className="tabular text-ink-muted">{option.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A debounced search box bound to ?q=. */
export function SearchBox({ placeholder = "Search…" }: { placeholder?: string }) {
  const searchParams = useSearchParams();
  const setParam = useSetParam();
  const initial = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initial);

  // Keep the box in step when the URL changes from elsewhere (nav, clear).
  useEffect(() => setValue(initial), [initial]);

  useEffect(() => {
    if (value === initial) return;
    const timer = setTimeout(() => setParam("q", value || null), 250);
    return () => clearTimeout(timer);
  }, [value, initial, setParam]);

  return (
    <input
      type="search"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-44 rounded border border-hairline bg-raised px-2 py-1 text-[12px] text-ink outline-none placeholder:text-ink-muted focus:border-series-1"
    />
  );
}

/** A single on/off flag bound to a query param. */
export function ToggleChip({
  paramKey,
  label,
}: {
  paramKey: string;
  label: string;
}) {
  const searchParams = useSearchParams();
  const setParam = useSetParam();
  const active = searchParams.get(paramKey) === "1";

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => setParam(paramKey, active ? null : "1")}
      className={clsx(
        "rounded border px-1.5 py-0.5 text-[11px] transition-colors",
        active
          ? "border-series-1 bg-raised text-ink"
          : "border-hairline text-ink-secondary hover:border-line hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

/** Clears every filter param, keeping the rest of the URL intact. */
export function ClearFilters({ keys }: { keys: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const anySet = keys.some((key) => searchParams.has(key));
  if (!anySet) return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const params = new URLSearchParams(searchParams.toString());
        for (const key of keys) params.delete(key);
        const query = params.toString();
        startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
      }}
      className="text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
    >
      Clear filters
    </button>
  );
}

/** Set or remove one query param without losing the others. */
function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
}

/** Read and toggle a comma-separated multi-value param. */
function useUrlList(key: string) {
  const searchParams = useSearchParams();
  const setParam = useSetParam();
  const raw = searchParams.get(key);
  // Memoised so the toggle callback is stable between renders.
  const values = useMemo(
    () => (raw ? raw.split(",").filter(Boolean) : []),
    [raw],
  );

  const toggle = useCallback(
    (value: string) => {
      const next = values.includes(value)
        ? values.filter((entry) => entry !== value)
        : [...values, value];
      setParam(key, next.length > 0 ? next.join(",") : null);
    },
    [values, key, setParam],
  );

  return { values, toggle };
}
