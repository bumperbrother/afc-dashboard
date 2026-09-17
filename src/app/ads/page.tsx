import { AppShell } from "@/components/shell/app-shell";
import { AdsTable } from "@/components/ads/ads-table";
import {
  ChipGroup,
  ClearFilters,
  SearchBox,
  ToggleChip,
} from "@/components/filters/filter-bar";
import { getSnapshot } from "@/lib/notion/store";
import { getEditorOptions } from "@/lib/status-options";
import { applyAdFilters, parseAdFilters, type SearchParams } from "@/lib/filters";
import { AD_STATE_COLOR } from "@/lib/presentation";
import { AD_STATE_LABELS, type AdState } from "@/lib/types";

export const metadata = { title: "Ads · AFC Command Center" };

// Always render per request: the snapshot reflects live Notion data, so this
// page must never be frozen into the build output.
export const dynamic = "force-dynamic";


/** States in the order a person scans them: worst first. */
const STATE_ORDER: AdState[] = [
  "overdue",
  "placedUnscheduled",
  "dueSoon",
  "unplaced",
  "placedUpcoming",
  "live",
  "cancelled",
];

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [snapshot, options] = await Promise.all([
    getSnapshot(),
    getEditorOptions(),
  ]);

  const filters = parseAdFilters(params);
  const ads = applyAdFilters(snapshot.ads, filters);

  const stateCounts = new Map<AdState, number>();
  for (const ad of snapshot.ads) {
    stateCounts.set(ad.state, (stateCounts.get(ad.state) ?? 0) + 1);
  }

  const owed = snapshot.ads.filter((ad) => ad.status.bucket === "owed").length;
  const overdue = stateCounts.get("overdue") ?? 0;

  return (
    <AppShell
      snapshot={snapshot}
      title="Ad delivery"
      subtitle={
        <span>
          {snapshot.ads.length} ads · {owed} owed
          {overdue > 0 && <span className="text-critical"> · {overdue} overdue</span>}
        </span>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ChipGroup
            paramKey="state"
            label="State"
            options={STATE_ORDER.filter((state) => stateCounts.has(state)).map(
              (state) => ({
                value: state,
                label: AD_STATE_LABELS[state],
                color: AD_STATE_COLOR[state],
                count: stateCounts.get(state),
              }),
            )}
          />
          {snapshot.companies.length > 0 && (
            <ChipGroup
              paramKey="company"
              label="Sponsor"
              options={snapshot.companies.map((company) => ({
                value: company.id,
                label: company.title,
              }))}
            />
          )}
          <ToggleChip paramKey="unplaced" label="Unplaced only" />
          <div className="ml-auto flex items-center gap-2">
            <SearchBox placeholder="Search ads…" />
            <ClearFilters keys={["state", "company", "unplaced", "q"]} />
          </div>
        </div>
      }
    >
      <AdsTable
        ads={ads}
        candidates={[...snapshot.content, ...snapshot.shorts]}
        statusOptions={options.adStatus}
      />
    </AppShell>
  );
}
