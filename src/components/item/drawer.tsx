"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import clsx from "clsx";
import { Badge, Button, Dot } from "@/components/ui/primitives";
import {
  AD_STATE_COLOR,
  channelColor,
  formatDate,
  formatRelative,
  SOURCE_LABEL,
  sourceColor,
  STATUS_BUCKET_COLOR,
  toDateInputValue,
} from "@/lib/presentation";
import {
  placeAd,
  updateOwner,
  updatePublishDate,
  updateStatus,
} from "@/lib/notion/mutations";
import {
  AD_STATE_LABELS,
  hasMetrics,
  type AdWithRefs,
  type MediaItem,
  type Person,
} from "@/lib/types";
import type { StatusOption } from "@/lib/status-options";

/**
 * The right-hand editor. Everything in here writes straight to Notion and
 * then refreshes the page data, so the drawer and the view behind it never
 * disagree about what a record says.
 */
export function ItemDrawer({
  item,
  ads,
  statusOptions,
  people,
  onClose,
}: {
  item: MediaItem;
  ads: AdWithRefs[];
  statusOptions: StatusOption[];
  people: Person[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = (action: () => Promise<{ ok: boolean; error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  const itemAds = ads.filter((ad) => item.adIds.includes(ad.id));

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="fixed right-0 top-0 z-40 flex h-screen w-full max-w-md flex-col border-l border-hairline bg-surface shadow-2xl"
      >
        <header className="flex items-start gap-2 border-b border-hairline px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Badge color={sourceColor(item.source)}>
                {SOURCE_LABEL[item.source]}
              </Badge>
              {item.channels.map((channel) => (
                <Badge key={channel} color={channelColor(channel)}>
                  {channel}
                </Badge>
              ))}
            </div>
            <h2 className="text-[14px] font-semibold leading-snug">{item.title}</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} title="Close (Esc)">
            Close
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {error && (
            <p
              className="mb-3 rounded border border-hairline px-2 py-1.5 text-[12px] text-critical"
              style={{ borderLeft: "3px solid var(--color-critical)" }}
            >
              {error}
            </p>
          )}

          <Field label="Status">
            {statusOptions.length > 0 ? (
              <select
                value={item.status.name ?? ""}
                disabled={pending}
                onChange={(event) =>
                  run(() => updateStatus(item.source, item.id, event.target.value))
                }
                className="w-full rounded border border-line bg-raised px-2 py-1.5 text-[12px] text-ink outline-none focus:border-series-1"
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
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
                <Dot color={STATUS_BUCKET_COLOR[item.status.bucket]} />
                {item.status.name ?? "Not set"}
              </span>
            )}
          </Field>

          <Field label="Publish date">
            <div className="flex items-center gap-2">
              <input
                type="date"
                defaultValue={toDateInputValue(item.publishDate)}
                disabled={pending}
                onChange={(event) =>
                  run(() =>
                    updatePublishDate(
                      item.source,
                      item.id,
                      event.target.value || null,
                    ),
                  )
                }
                className="rounded border border-line bg-raised px-2 py-1.5 text-[12px] text-ink outline-none focus:border-series-1"
              />
              <span className="text-[11px] text-ink-muted">
                {item.publishDate ? formatRelative(item.publishDate) : "no date"}
              </span>
            </div>
          </Field>

          <Field label="Owner">
            {people.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {people.map((person) => {
                  const active = item.owners.some((owner) => owner.id === person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      aria-pressed={active}
                      disabled={pending}
                      onClick={() => {
                        const next = active
                          ? item.owners
                              .filter((owner) => owner.id !== person.id)
                              .map((owner) => owner.id)
                          : [...item.owners.map((owner) => owner.id), person.id];
                        run(() => updateOwner(item.source, item.id, next));
                      }}
                      className={clsx(
                        "rounded border px-1.5 py-0.5 text-[11px] transition-colors",
                        active
                          ? "border-series-1 bg-raised text-ink"
                          : "border-hairline text-ink-secondary hover:border-line hover:text-ink",
                      )}
                    >
                      {person.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="text-[12px] text-ink-muted">
                {item.owners.map((owner) => owner.name).join(", ") || "Unassigned"}
              </span>
            )}
          </Field>

          <Field label={`Ads on this ${SOURCE_LABEL[item.source].toLowerCase()}`}>
            {itemAds.length === 0 ? (
              <p className="text-[12px] text-ink-muted">
                {item.source === "clips"
                  ? "Clips do not carry sponsorships."
                  : "No ads placed here yet."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {itemAds.map((ad) => (
                  <li
                    key={ad.id}
                    className="flex items-start justify-between gap-2 rounded border border-hairline bg-raised px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] text-ink">{ad.title}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                        <Dot color={AD_STATE_COLOR[ad.state]} />
                        {AD_STATE_LABELS[ad.state]}
                        {ad.company && <span>· {ad.company.title}</span>}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(() => placeAd(ad.id, null))}
                      title="Remove this ad from this item"
                    >
                      Unassign
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          {hasMetrics(item.metrics) && (
            <Field label="Performance">
              <dl className="space-y-1 text-[11px]">
                {item.metrics.views !== null && (
                  <Row label="Views">{item.metrics.views.toLocaleString()}</Row>
                )}
                {item.metrics.opens !== null && (
                  <Row label="Opens">{item.metrics.opens.toLocaleString()}</Row>
                )}
                {item.metrics.clicks !== null && (
                  <Row label="Clicks">{item.metrics.clicks.toLocaleString()}</Row>
                )}
              </dl>
            </Field>
          )}

          <dl className="mt-4 space-y-1.5 border-t border-hairline pt-3 text-[11px]">
            <Row label="Publishes">{formatDate(item.publishDate)}</Row>
            {item.externalUrl && (
              <Row label="Link">
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-series-1 hover:underline"
                >
                  Open published piece
                </a>
              </Row>
            )}
          </dl>
        </div>

        <footer className="border-t border-hairline px-4 py-2.5">
          <a
            href={item.notionUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-series-1 hover:underline"
          >
            Open in Notion ↗
          </a>
        </footer>
      </aside>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <p className="mb-1 text-[11px] uppercase tracking-wider text-ink-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right text-ink-secondary">{children}</dd>
    </div>
  );
}
