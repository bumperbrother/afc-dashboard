import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { DeliveryBar } from "@/components/ads/delivery-bar";
import { Card, EmptyState } from "@/components/ui/primitives";
import { getSnapshot } from "@/lib/notion/store";
import { summarizeDelivery } from "@/lib/derive";
import { formatDate } from "@/lib/presentation";

export const metadata = { title: "Companies · AFC Command Center" };

// Always render per request: the snapshot reflects live Notion data, so this
// page must never be frozen into the build output.
export const dynamic = "force-dynamic";


export default async function CompaniesPage() {
  const snapshot = await getSnapshot();

  const rows = snapshot.companies
    .map((company) => ({
      company,
      summary: summarizeDelivery(
        snapshot.ads.filter((ad) => ad.companyId === company.id),
      ),
    }))
    .sort((a, b) => {
      if (a.summary.overdue !== b.summary.overdue) {
        return b.summary.overdue - a.summary.overdue;
      }
      if (a.summary.owed !== b.summary.owed) return b.summary.owed - a.summary.owed;
      return a.company.title.localeCompare(b.company.title);
    });

  const orphanAds = snapshot.ads.filter((ad) => !ad.companyId);

  return (
    <AppShell
      snapshot={snapshot}
      title="Companies"
      subtitle={`${snapshot.companies.length} sponsors`}
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No companies loaded."
          hint="Check the companies database id and mapping in Setup."
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline text-[11px] uppercase tracking-wider text-ink-muted">
                    <th className="px-3 py-1.5 font-normal">Sponsor</th>
                    <th className="px-3 py-1.5 font-normal">Status</th>
                    <th className="px-3 py-1.5 font-normal">Contact</th>
                    <th className="px-3 py-1.5 font-normal">Delivery</th>
                    <th className="px-3 py-1.5 font-normal">Last edited</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ company, summary }) => (
                    <tr
                      key={company.id}
                      className="border-b border-hairline last:border-b-0 hover:bg-raised"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/ads?company=${company.id}`}
                          className="text-[12px] text-ink hover:text-series-1 hover:underline"
                        >
                          {company.title}
                        </Link>
                        {summary.overdue > 0 && (
                          <span className="ml-2 text-[11px] text-critical">
                            {summary.overdue} overdue
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-ink-secondary">
                        {company.status ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-ink-secondary">
                        {company.contact ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <DeliveryBar summary={summary} width={180} />
                      </td>
                      <td className="tabular px-3 py-2 text-[11px] text-ink-muted">
                        {formatDate(company.lastEditedTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {orphanAds.length > 0 && (
            <Card title={`Ads with no sponsor (${orphanAds.length})`}>
              <ul className="divide-y divide-hairline">
                {orphanAds.map((ad) => (
                  <li key={ad.id} className="px-3 py-1.5">
                    <a
                      href={ad.notionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-ink hover:text-series-1 hover:underline"
                    >
                      {ad.title}
                    </a>
                    <p className="text-[11px] text-ink-muted">
                      Link this ad to a company in Notion so it appears under a
                      sponsor here.
                    </p>
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
