import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { StatTile } from "@/components/overview/stat-tile";
import { WeekList } from "@/components/overview/week-list";
import { DeliveryBar } from "@/components/ads/delivery-bar";
import { Card, Dot, EmptyState } from "@/components/ui/primitives";
import { getSnapshot } from "@/lib/notion/store";
import {
  computeOverviewStats,
  deliveredReach,
  endOfWeek,
  formatCount,
  mediaInRange,
  performanceByChannel,
  startOfWeek,
  summarizeDelivery,
} from "@/lib/derive";
import {
  AD_STATE_COLOR,
  channelColor,
  formatDate,
  formatRelative,
  SOURCE_LABEL,
} from "@/lib/presentation";
import { AD_STATE_LABELS, allMedia, type AdState } from "@/lib/types";

export const metadata = { title: "Overview · AFC Command Center" };

// Always render per request: the snapshot reflects live Notion data, so this
// page must never be frozen into the build output.
export const dynamic = "force-dynamic";


/** States that mean someone has to act, worst first. */
const AT_RISK: AdState[] = ["overdue", "placedUnscheduled", "dueSoon"];

export default async function OverviewPage() {
  const snapshot = await getSnapshot();
  const now = new Date();
  const stats = computeOverviewStats(snapshot, now);

  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const thisWeek = mediaInRange(allMedia(snapshot), weekStart, weekEnd);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });

  const atRisk = snapshot.ads
    .filter((ad) => AT_RISK.includes(ad.state))
    .sort((a, b) => AT_RISK.indexOf(a.state) - AT_RISK.indexOf(b.state))
    .slice(0, 12);

  const bySponsor = snapshot.companies
    .map((company) => {
      const ads = snapshot.ads.filter((ad) => ad.companyId === company.id);
      return {
        company,
        summary: summarizeDelivery(ads),
        reach: deliveredReach(ads),
      };
    })
    .filter((entry) => entry.summary.total > 0)
    .sort((a, b) => b.summary.owed - a.summary.owed);

  // Only rendered when the metric properties are mapped and populated.
  const performance = performanceByChannel(allMedia(snapshot));

  const empty =
    snapshot.content.length === 0 &&
    snapshot.shorts.length === 0 &&
    snapshot.ads.length === 0;

  return (
    <AppShell
      snapshot={snapshot}
      title="Overview"
      subtitle={`Week of ${formatDate(weekStart)}`}
    >
      {empty ? (
        <EmptyState
          title="No data yet."
          hint={
            <>
              Add your Notion token and database ids, then map your properties in{" "}
              <Link href="/setup" className="text-series-1 hover:underline">
                Setup
              </Link>
              .
            </>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="Publishing this week"
              value={stats.publishingThisWeek}
              href="/calendar"
              context={
                stats.publishingByChannel.length > 0 ? (
                  <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {stats.publishingByChannel.slice(0, 4).map((entry) => (
                      <span
                        key={entry.channel}
                        className="inline-flex items-center gap-1"
                      >
                        <Dot color={channelColor(entry.channel)} />
                        {entry.channel} {entry.count}
                      </span>
                    ))}
                  </span>
                ) : (
                  "Nothing dated this week"
                )
              }
            />
            <StatTile
              label="Ads overdue"
              value={stats.adsOverdue}
              href="/ads?state=overdue"
              tone={stats.adsOverdue > 0 ? "critical" : "neutral"}
              context="Past the due date, still unplaced"
            />
            <StatTile
              label="Ads due soon"
              value={stats.adsDueSoon}
              href="/ads?state=dueSoon"
              tone={stats.adsDueSoon > 0 ? "warning" : "neutral"}
              context="Due within 14 days"
            />
            <StatTile
              label="Unplaced ads"
              value={stats.adsUnplaced}
              href="/ads?unplaced=1"
              context="Owed, with nowhere to run yet"
            />
            <StatTile
              label="No publish date"
              value={stats.missingDate}
              href="/content?status=planned,inProgress,scheduled"
              context="Unpublished items with no date set"
            />
            <StatTile
              label="No owner"
              value={stats.missingOwner}
              href="/content"
              context="Unpublished items with nobody assigned"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title="This week"
              action={
                <Link
                  href="/calendar"
                  className="text-[11px] text-ink-muted hover:text-ink"
                >
                  Calendar →
                </Link>
              }
            >
              {thisWeek.length === 0 ? (
                <EmptyState title="Nothing is dated for this week." />
              ) : (
                <WeekList items={thisWeek} days={days} />
              )}
            </Card>

            <Card
              title="Ads needing attention"
              action={
                <Link
                  href="/ads"
                  className="text-[11px] text-ink-muted hover:text-ink"
                >
                  Tracker →
                </Link>
              }
            >
              {atRisk.length === 0 ? (
                <EmptyState title="Nothing is at risk. Every ad is placed and on schedule." />
              ) : (
                <ul className="divide-y divide-hairline">
                  {atRisk.map((ad) => (
                    <li
                      key={ad.id}
                      className="flex items-start gap-2 px-3 py-1.5"
                    >
                      <Dot
                        color={AD_STATE_COLOR[ad.state]}
                        className="mt-1.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] text-ink">{ad.title}</p>
                        <p className="text-[11px] text-ink-muted">
                          {ad.company?.title ?? "No sponsor"} ·{" "}
                          {AD_STATE_LABELS[ad.state]}
                          {ad.dueDate && ` · due ${formatRelative(ad.dueDate)}`}
                          {ad.placedOn &&
                            ` · on ${SOURCE_LABEL[ad.placedOn.source].toLowerCase()} "${ad.placedOn.title}"`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {performance.length > 0 && (
            <Card title="Typical performance">
              <ul className="divide-y divide-hairline">
                {performance.map((entry) => (
                  <li
                    key={entry.channel}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <span className="flex w-40 shrink-0 items-center gap-1.5 text-[12px] text-ink">
                      <Dot color={channelColor(entry.channel)} />
                      {entry.channel}
                    </span>
                    <span className="tabular text-[13px] text-ink">
                      {formatCount(entry.medianViews ?? entry.medianOpens)}
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      median {entry.medianViews !== null ? "views" : "opens"} across the
                      last {entry.sampleSize} published
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {bySponsor.length > 0 && (
            <Card
              title="Delivery by sponsor"
              action={
                <Link
                  href="/companies"
                  className="text-[11px] text-ink-muted hover:text-ink"
                >
                  Companies →
                </Link>
              }
            >
              <ul className="divide-y divide-hairline">
                {bySponsor.map(({ company, summary, reach }) => (
                  <li
                    key={company.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <Link
                      href={`/ads?company=${company.id}`}
                      className="w-40 shrink-0 truncate text-[12px] text-ink hover:text-series-1"
                    >
                      {company.title}
                    </Link>
                    {summary.overdue > 0 && (
                      <span className="text-[11px] text-critical">
                        {summary.overdue} overdue
                      </span>
                    )}
                    {(reach.views !== null || reach.opens !== null) && (
                      <span
                        className="tabular text-[11px] text-ink-muted"
                        title={`Total audience across ${reach.placements} live placement${reach.placements === 1 ? "" : "s"}`}
                      >
                        {formatCount(reach.views ?? reach.opens)} delivered
                      </span>
                    )}
                    <div className="ml-auto">
                      <DeliveryBar summary={summary} width={200} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}
