"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button, Card, Notice } from "@/components/ui/primitives";
import { saveMappingAction, type SetupState } from "@/app/setup/actions";
import { ROLE_TYPES, type SchemaProperty } from "@/lib/mapping/heuristics";
import type { Mapping } from "@/lib/mapping/schema";
import {
  AD_BUCKETS,
  AD_BUCKET_LABELS,
  STATUS_BUCKETS,
  STATUS_BUCKET_LABELS,
} from "@/lib/types";

/**
 * Maps each Notion property to the role the dashboard expects. Every dropdown
 * is filtered to property types Notion will accept for that role, so a saved
 * mapping cannot ask for something impossible.
 */

type Role = { key: string; label: string; hint: string; required?: boolean };

const MEDIA_ROLES: Role[] = [
  { key: "title", label: "Title", hint: "The name of the piece", required: true },
  { key: "status", label: "Status", hint: "Where it is in production", required: true },
  { key: "publishDate", label: "Publish date", hint: "When it goes out", required: true },
  { key: "owner", label: "Owner", hint: "Who is responsible" },
  { key: "url", label: "Published link", hint: "Link to the live piece" },
  { key: "views", label: "Views", hint: "View or play count, if tracked" },
  { key: "opens", label: "Opens", hint: "Newsletter opens or recipients" },
  { key: "clicks", label: "Clicks", hint: "Click-throughs, if tracked" },
];

const CONTENT_ROLES: Role[] = [
  ...MEDIA_ROLES,
  {
    key: "channel",
    label: "Channel",
    hint: "Newsletter / podcast / YouTube",
    required: true,
  },
];

const CHILD_ROLES: Role[] = [
  ...MEDIA_ROLES,
  { key: "parent", label: "Parent content", hint: "The item this came from" },
];

const AD_ROLES: Role[] = [
  { key: "title", label: "Title", hint: "The ad record's name", required: true },
  { key: "status", label: "Status", hint: "Owed / placed / published", required: true },
  { key: "company", label: "Company", hint: "Relation to the sponsor", required: true },
  {
    key: "placementContent",
    label: "Placed on (content)",
    hint: "Relation to main content",
    required: true,
  },
  {
    key: "placementShorts",
    label: "Placed on (short)",
    hint: "Relation to shorts",
  },
  { key: "dueDate", label: "Due date", hint: "When we owe it by" },
  { key: "adType", label: "Ad type", hint: "Mid-roll, newsletter primary…" },
  { key: "notes", label: "Notes", hint: "Anything worth seeing in the tracker" },
];

const COMPANY_ROLES: Role[] = [
  { key: "title", label: "Name", hint: "The sponsor's name", required: true },
  { key: "status", label: "Status", hint: "Active, paused, renewal due…" },
  { key: "contact", label: "Contact", hint: "Who we talk to" },
  { key: "url", label: "Website", hint: "Their site" },
];

const SECTIONS: Array<{
  key: keyof Omit<Mapping, "version">;
  label: string;
  roles: Role[];
}> = [
  { key: "content", label: "Main content", roles: CONTENT_ROLES },
  { key: "shorts", label: "Shorts", roles: CHILD_ROLES },
  { key: "clips", label: "Clips", roles: CHILD_ROLES },
  { key: "ads", label: "Ads", roles: AD_ROLES },
  { key: "companies", label: "Companies", roles: COMPANY_ROLES },
];

export function SetupForm({ state }: { state: SetupState }) {
  const router = useRouter();
  const [mapping, setMapping] = useState<Mapping | null>(
    state.savedMapping ?? state.suggested,
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof saveMappingAction>
  > | null>(null);

  const schemaBySource = useMemo(
    () => new Map(state.schemas.map((schema) => [schema.source, schema])),
    [state.schemas],
  );

  if (!mapping) {
    return (
      <Notice tone="warning">
        <p className="font-medium text-ink">Nothing to map yet.</p>
        <p className="mt-0.5">
          Add a Notion token and the five database ids, then reload this page.
        </p>
      </Notice>
    );
  }

  const setRole = (
    section: keyof Omit<Mapping, "version">,
    role: string,
    value: string | null,
  ) => {
    setMapping((current) => {
      if (!current) return current;
      return {
        ...current,
        [section]: { ...current[section], [role]: value },
      } as Mapping;
    });
  };

  const setBucket = (
    section: keyof Omit<Mapping, "version">,
    optionName: string,
    bucket: string,
  ) => {
    setMapping((current) => {
      if (!current) return current;
      const existing = current[section] as { statusBuckets?: Record<string, string> };
      return {
        ...current,
        [section]: {
          ...current[section],
          statusBuckets: { ...(existing.statusBuckets ?? {}), [optionName]: bucket },
        },
      } as Mapping;
    });
  };

  const save = () => {
    startTransition(async () => {
      const saved = await saveMappingAction(mapping);
      setResult(saved);
      if (saved.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save mapping"}
        </Button>
        {state.suggested && (
          <Button
            onClick={() => setMapping(state.suggested)}
            disabled={pending}
            title="Replace the form with the best guess from your Notion schema"
          >
            Auto-map from Notion
          </Button>
        )}
        <span className="text-[11px] text-ink-muted">
          {state.mappingOrigin === "env"
            ? "Currently loaded from DASHBOARD_MAPPING_JSON."
            : state.mappingOrigin === "file"
              ? `Currently loaded from ${state.mappingFilename}.`
              : "Nothing saved yet."}
        </span>
      </div>

      {result && (
        <Notice tone={result.ok ? "info" : "critical"}>
          {result.ok ? (
            <p>
              Saved to{" "}
              <code className="text-ink">{state.mappingFilename}</code>. The
              dashboard will use it on the next load.
            </p>
          ) : (
            <p>{result.error}</p>
          )}
          {!result.ok && result.json && (
            <textarea
              readOnly
              value={result.json}
              rows={10}
              className="mt-2 w-full rounded border border-line bg-plane p-2 font-mono text-[11px] text-ink-secondary"
            />
          )}
        </Notice>
      )}

      {SECTIONS.map((section) => {
        const schema = schemaBySource.get(section.key as never);
        const config = mapping[section.key] as Record<string, unknown>;
        const properties = schema?.properties ?? [];

        // Companies have a plain status label, not a production lifecycle, so
        // they get no bucket mapping.
        const hasBuckets = section.key !== "companies";
        const statusProperty = config.status as string | null | undefined;
        const statusOptions = hasBuckets
          ? (properties.find((p) => p.name === statusProperty)?.options ?? [])
          : [];
        const buckets =
          section.key === "ads" ? AD_BUCKETS : STATUS_BUCKETS;
        const bucketLabels =
          section.key === "ads" ? AD_BUCKET_LABELS : STATUS_BUCKET_LABELS;

        return (
          <Card
            key={section.key}
            title={
              <span className="flex items-center gap-2">
                {section.label}
                {schema?.title && (
                  <span className="font-normal normal-case tracking-normal text-ink-muted">
                    {schema.title}
                  </span>
                )}
              </span>
            }
          >
            <div className="p-3">
              {schema?.error && (
                <p className="mb-3 text-[12px] text-warning">{schema.error}</p>
              )}

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {section.roles.map((role) => (
                  <RoleSelect
                    key={role.key}
                    role={role}
                    properties={properties}
                    value={(config[role.key] as string | null) ?? null}
                    onChange={(value) => setRole(section.key, role.key, value)}
                  />
                ))}
              </div>

              {statusOptions.length > 0 && (
                <div className="mt-4 border-t border-hairline pt-3">
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-muted">
                    What each status option means
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {statusOptions.map((option) => {
                      const current =
                        (config.statusBuckets as Record<string, string>)?.[
                          option.name
                        ] ?? buckets[0];
                      return (
                        <label
                          key={option.name}
                          className="flex items-center justify-between gap-2 rounded border border-hairline bg-raised px-2 py-1"
                        >
                          <span className="truncate text-[11px] text-ink-secondary">
                            {option.name}
                          </span>
                          <select
                            value={current}
                            onChange={(event) =>
                              setBucket(section.key, option.name, event.target.value)
                            }
                            className="rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink outline-none focus:border-series-1"
                          >
                            {buckets.map((bucket) => (
                              <option key={bucket} value={bucket}>
                                {(bucketLabels as Record<string, string>)[bucket]}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Card>
        );
      })}

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save mapping"}
        </Button>
      </div>
    </div>
  );
}

function RoleSelect({
  role,
  properties,
  value,
  onChange,
}: {
  role: Role;
  properties: SchemaProperty[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const allowedTypes = ROLE_TYPES[role.key] ?? [];
  const candidates = properties.filter((p) => allowedTypes.includes(p.type));
  const missing = role.required && !value;
  // A saved mapping can name a property that has since been renamed in Notion.
  const stale = value && !properties.some((p) => p.name === value);

  return (
    <label className="block">
      <span className="mb-0.5 flex items-center gap-1.5 text-[11px] text-ink-secondary">
        {role.label}
        {role.required && <span className="text-critical">*</span>}
      </span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className={clsx(
          "w-full rounded border bg-raised px-2 py-1.5 text-[12px] text-ink outline-none focus:border-series-1",
          missing || stale ? "border-critical" : "border-line",
        )}
      >
        <option value="">Not mapped</option>
        {stale && (
          <option value={value ?? ""}>{value} (not in Notion any more)</option>
        )}
        {candidates.map((property) => (
          <option key={property.name} value={property.name}>
            {property.name} ({property.type})
          </option>
        ))}
      </select>
      <span className="mt-0.5 block text-[10px] text-ink-muted">
        {stale
          ? "This property is no longer in the database. Pick another."
          : candidates.length === 0 && properties.length > 0
            ? `No ${allowedTypes.join(" or ")} property in this database.`
            : role.hint}
      </span>
    </label>
  );
}
