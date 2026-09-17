import { AppShell } from "@/components/shell/app-shell";
import { ContentTable } from "@/components/content/content-table";
import {
  ChipGroup,
  ClearFilters,
  SearchBox,
} from "@/components/filters/filter-bar";
import {
  channelsInSnapshot,
  getSnapshot,
  peopleInSnapshot,
} from "@/lib/notion/store";
import { getEditorOptions } from "@/lib/status-options";
import { filteredMedia, parseMediaFilters, type SearchParams } from "@/lib/filters";
import {
  channelColor,
  sourceColor,
  STATUS_BUCKET_COLOR,
} from "@/lib/presentation";
import { STATUS_BUCKETS, STATUS_BUCKET_LABELS } from "@/lib/types";

export const metadata = { title: "Content · AFC Command Center" };

// Always render per request: the snapshot reflects live Notion data, so this
// page must never be frozen into the build output.
export const dynamic = "force-dynamic";


export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [snapshot, options] = await Promise.all([
    getSnapshot(),
    getEditorOptions(),
  ]);

  const filters = parseMediaFilters(params);
  const items = filteredMedia(snapshot, filters);
  const channels = channelsInSnapshot(snapshot);
  const people = peopleInSnapshot(snapshot);

  return (
    <AppShell
      snapshot={snapshot}
      title="Content"
      subtitle={`${snapshot.content.length} main · ${snapshot.shorts.length} shorts · ${snapshot.clips.length} clips`}
      toolbar={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ChipGroup
            paramKey="source"
            label="Source"
            options={[
              { value: "content", label: "Content", color: sourceColor("content"), count: snapshot.content.length },
              { value: "shorts", label: "Shorts", color: sourceColor("shorts"), count: snapshot.shorts.length },
              { value: "clips", label: "Clips", color: sourceColor("clips"), count: snapshot.clips.length },
            ]}
          />
          {channels.length > 0 && (
            <ChipGroup
              paramKey="channel"
              label="Channel"
              options={channels.map((channel) => ({
                value: channel,
                label: channel,
                color: channelColor(channel),
              }))}
            />
          )}
          <ChipGroup
            paramKey="status"
            label="Status"
            options={STATUS_BUCKETS.map((bucket) => ({
              value: bucket,
              label: STATUS_BUCKET_LABELS[bucket],
              color: STATUS_BUCKET_COLOR[bucket],
            }))}
          />
          {people.length > 0 && (
            <ChipGroup
              paramKey="owner"
              label="Owner"
              options={people.map((person) => ({
                value: person.id,
                label: person.name,
              }))}
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            <SearchBox placeholder="Search titles…" />
            <ClearFilters keys={["source", "channel", "status", "owner", "q"]} />
          </div>
        </div>
      }
    >
      <ContentTable
        items={items}
        ads={snapshot.ads}
        statusOptionsBySource={{
          content: options.contentStatus,
          shorts: options.shortsStatus,
          clips: options.clipsStatus,
        }}
        people={options.people}
      />
    </AppShell>
  );
}
