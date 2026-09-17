"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button, Dot, EmptyState } from "@/components/ui/primitives";
import { DeliveryBar } from "./delivery-bar";
import { PlacePicker } from "./place-picker";
import { updateStatus } from "@/lib/notion/mutations";
import { summarizeDelivery } from "@/lib/derive";
import {
  AD_STATE_COLOR,
  formatDate,
  formatRelative,
  SOURCE_LABEL,
  STATUS_BUCKET_COLOR,
} from "@/lib/presentation";
import { AD_STATE_LABELS, type AdWithRefs, type MediaItem } from "@/lib/types";
import type { StatusOption } from "@/lib/status-options";

/**
 * The delivery tracker: every ad we owe, grouped by sponsor, with what it is
 * placed on and whether that is going to happen on time.
 */
export function AdsTable({
  ads,
  candidates,
  statusOptions,
}: {
  ads: AdWithRefs[];
  candidates: MediaItem[];
  statusOptions: StatusOption[];
}) {
  const [placing, setPlacing] = useState<AdWithRefs | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const groups = useMemo(() => groupByCompany(ads), [ads]);

  if (ads.length === 0) {
    return (
      <EmptyState
        title="No ads match these filters."
        hint="Clear a filter, or check the ads database mapping in Setup."
      />
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        const summary = summarizeDelivery(group.ads);

        return (
          <section
            key={group.key}
            className="overflow-hidden rounded-lg border border-hairline bg-surface"
          >
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-3 py-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(group.key)) next.delete(group.key);
                    else next.add(group.key);
                    return next;
                  })
                }
                className="flex items-center gap-1.5 text-[13px] font-semibold text-ink hover:text-series-1"
              >
                <span aria-hidden className="text-[10px] text-ink-muted">
                  {isCollapsed ? "▶" : "▼"}
                </span>
                {group.name}
              </button>

              <span className="tabular text-[11px] text-ink-muted">
                {group.ads.length} ad{group.ads.length === 1 ? "" : "s"}
              </span>

              {summary.overdue > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-critical">
                  <Dot color="var(--color-critical)" />
                  {summary.overdue} overdue
                </span>
              )}

              <div className="ml-auto">
                <DeliveryBar summary={summary} />
              </div>
            </header>

            {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] table-fixed border-collapse text-left">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[13%]" />
                    <col className="w-[27%]" />
                    <col className="w-[11%]" />
                    <col className="w-[12%]" />
                    <col className="w-[7%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-hairline text-[11px] uppercase tracking-wider text-ink-muted">
                      <th className="px-3 py-1.5 font-normal">Ad</th>
                      <th className="px-3 py-1.5 font-normal">State</th>
                      <th className="px-3 py-1.5 font-normal">Placed on</th>
                      <th className="px-3 py-1.5 font-normal">Due</th>
                      <th className="px-3 py-1.5 font-normal">Status</th>
                      <th className="px-3 py-1.5 font-normal" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.ads.map((ad) => (
                      <AdRow
                        key={ad.id}
                        ad={ad}
                        statusOptions={statusOptions}
                        onPlace={() => setPlacing(ad)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {placing && (
        <PlacePicker
          ad={placing}
          candidates={candidates}
          onClose={() => setPlacing(null)}
        />
      )}
    </div>
  );
}

function AdRow({
  ad,
  statusOptions,
  onPlace,
}: {
  ad: AdWithRefs;
  statusOptions: StatusOption[];
  onPlace: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const changeStatus = (optionName: string) => {
    setError(null);
    startTransition(async () => {
      const result = await updateStatus("ads", ad.id, optionName);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  const needsAttention =
    ad.state === "overdue" || ad.state === "placedUnscheduled";

  return (
    <tr
      className={clsx(
        "border-b border-hairline align-top last:border-b-0 hover:bg-raised",
        pending && "opacity-60",
      )}
    >
      <td className="px-3 py-2">
        <a
          href={ad.notionUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[12px] text-ink hover:text-series-1 hover:underline"
        >
          {ad.title}
        </a>
        {ad.adType && (
          <span className="ml-1.5 text-[11px] text-ink-muted">{ad.adType}</span>
        )}
        {error && <p className="mt-0.5 text-[11px] text-critical">{error}</p>}
        {ad.notes && (
          <p className="mt-0.5 text-[11px] text-ink-muted">{ad.notes}</p>
        )}
      </td>

      <td className="px-3 py-2">
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 whitespace-nowrap text-[11px]",
            needsAttention ? "text-ink" : "text-ink-secondary",
          )}
        >
          <Dot color={AD_STATE_COLOR[ad.state]} />
          {AD_STATE_LABELS[ad.state]}
        </span>
      </td>

      <td className="px-3 py-2">
        {ad.placedOn ? (
          <div className="min-w-0">
            <a
              href={ad.placedOn.notionUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-[12px] text-ink-secondary hover:text-series-1 hover:underline"
            >
              {ad.placedOn.title}
            </a>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
              <span>{SOURCE_LABEL[ad.placedOn.source]}</span>
              <span>· {formatDate(ad.placedOn.publishDate)}</span>
              <Dot color={STATUS_BUCKET_COLOR[ad.placedOn.status.bucket]} />
              <span>{ad.placedOn.status.name ?? "No status"}</span>
            </p>
          </div>
        ) : (
          <span className="text-[11px] text-ink-muted">Not placed</span>
        )}
      </td>

      <td className="px-3 py-2">
        <span className="tabular whitespace-nowrap text-[11px] text-ink-secondary">
          {formatDate(ad.dueDate)}
        </span>
        {ad.dueDate && (
          <span
            className={clsx(
              "block text-[11px]",
              ad.state === "overdue" ? "text-critical" : "text-ink-muted",
            )}
          >
            {formatRelative(ad.dueDate)}
          </span>
        )}
      </td>

      <td className="px-3 py-2">
        {statusOptions.length > 0 ? (
          <select
            value={ad.status.name ?? ""}
            disabled={pending}
            onChange={(event) => changeStatus(event.target.value)}
            aria-label={`Status for ${ad.title}`}
            className="rounded border border-line bg-raised px-1.5 py-1 text-[11px] text-ink outline-none focus:border-series-1"
          >
            <option value="" disabled>
              Not set
            </option>
            {statusOptions.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[11px] text-ink-secondary">
            {ad.status.name ?? "Not set"}
          </span>
        )}
      </td>

      <td className="px-3 py-2 text-right">
        <Button size="sm" onClick={onPlace} disabled={pending}>
          {ad.placedOn ? "Move" : "Place"}
        </Button>
      </td>
    </tr>
  );
}

interface Group {
  key: string;
  name: string;
  ads: AdWithRefs[];
}

/** Group ads by sponsor, sponsors with overdue work first. */
function groupByCompany(ads: AdWithRefs[]): Group[] {
  const groups = new Map<string, Group>();

  for (const ad of ads) {
    const key = ad.companyId ?? "__none";
    const name = ad.company?.title ?? "No sponsor";
    const existing = groups.get(key);
    if (existing) existing.ads.push(ad);
    else groups.set(key, { key, name, ads: [ad] });
  }

  const ordered = [...groups.values()];
  for (const group of ordered) {
    group.ads.sort((a, b) => stateRank(a) - stateRank(b));
  }

  return ordered.sort((a, b) => {
    const aOverdue = a.ads.filter((ad) => ad.state === "overdue").length;
    const bOverdue = b.ads.filter((ad) => ad.state === "overdue").length;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;
    return a.name.localeCompare(b.name);
  });
}

/** Sort the most urgent states to the top of each sponsor's block. */
function stateRank(ad: AdWithRefs): number {
  const order: Record<string, number> = {
    overdue: 0,
    placedUnscheduled: 1,
    dueSoon: 2,
    unplaced: 3,
    placedUpcoming: 4,
    live: 5,
    cancelled: 6,
  };
  return order[ad.state] ?? 9;
}
