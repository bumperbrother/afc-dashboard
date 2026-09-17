# AFC Command Center

A dashboard over the five Notion databases that run the business: main content
(newsletter, podcast, YouTube), shorts, clips, ads, and companies. Notion stays
the source of truth. This reads it live, writes back to it, and gives the team
the cross-database views Notion cannot: a publishing calendar, a sponsor
delivery tracker, and a single overview of what is at risk.

## What it does

| View | What it answers |
|---|---|
| **Overview** | What goes out this week, which ads are overdue or unplaced, how each sponsor's delivery is tracking |
| **Calendar** | Month and week grid of everything dated, across content, shorts, and clips |
| **Ads** | Every ad we owe, grouped by sponsor: what it is placed on, whether that will publish in time |
| **Content** | One table over all three media databases, flat or grouped by status |
| **Companies** | Per-sponsor delivery summary |
| **Setup** | Connects Notion and maps each database's properties to what the dashboard expects |

Editable from the dashboard, written straight back to Notion: status, publish
date, owner, and which piece of media an ad is placed on.

## Running it locally

```bash
npm install
cp .env.example .env.local   # then fill it in, see below
npm run dev
```

To look around before connecting Notion, run against the bundled sample data:

```bash
npm run dev:mock
```

Mock mode needs no token. Edits work and persist in memory until the server
restarts, so every screen including Setup can be exercised.

## Connecting Notion

1. **Create an integration.** Go to <https://www.notion.so/my-integrations>,
   create an internal integration, and copy its token into `NOTION_TOKEN`.
2. **Share each database with it.** Open each of the five databases as a full
   page in Notion, then `•••` → Connections → add your integration. Skipping
   this is the most common reason a database shows up empty: the token is valid
   but cannot see the data.
3. **Collect the database ids.** Each database's id is the 32-character string
   in its URL, before `?v=`. Put them in `NOTION_DB_CONTENT`,
   `NOTION_DB_SHORTS`, `NOTION_DB_CLIPS`, `NOTION_DB_ADS`, and
   `NOTION_DB_COMPANIES`.
4. **Set a password.** `DASHBOARD_PASSWORD` is the shared team password.
   `SESSION_SECRET` signs the login cookie; generate one with
   `openssl rand -hex 32`.
5. **Map the properties.** Open `/setup`, press **Auto-map from Notion**,
   correct anything it guessed wrong, and save. Auto-map matches on property
   name and type, and for relations it prefers one that points at the expected
   database.

### What the mapping covers

The dashboard never assumes your property names. Each database maps its own
properties onto the roles below, and each status option is assigned to a
dashboard bucket so that, for example, both "Filming" and "Editing" count as
in progress.

| Database | Required | Optional |
|---|---|---|
| Main content | title, status, publish date, channel | owner, published link |
| Shorts | title, status, publish date | owner, parent content |
| Clips | title, publish date | status, owner, parent content |
| Ads | title, status, company relation, content placement relation | shorts placement relation, due date, ad type, notes |
| Companies | name | status, contact, website |

Clips carry no sponsorships, so ads only ever relate to main content or shorts.

Saving writes `dashboard.mapping.json` at the project root. That file is
gitignored, because it describes one workspace's schema rather than the code.

## Deploying to Vercel

1. Import this repository into Vercel.
2. Add every variable from `.env.example` to the project's environment.
3. Deploy.
4. Open `/setup` on the deployed URL and map the properties. Vercel's
   filesystem is read-only, so saving shows you JSON to paste into the
   `DASHBOARD_MAPPING_JSON` variable instead of writing a file. Add it, then
   redeploy.

## How the data flows

- `src/lib/notion/query.ts` reads every row of each database. Notion's
  2025-09-03 API keeps rows on a *data source* rather than the database, so a
  database id is resolved to its primary data source first.
- `src/lib/notion/normalize.ts` converts raw pages into domain records using
  the mapping. Every getter tolerates a missing or wrongly typed property, so
  a half-finished mapping degrades rather than crashing a view.
- `src/lib/notion/store.ts` loads all five databases in parallel, joins ads to
  their company and placement, and back-links ad ids onto media. The result is
  cached for 60 seconds; any write and the Refresh button drop it.
- `src/lib/derive.ts` works out each ad's real state (overdue, due soon,
  placed but unscheduled, upcoming, live) from its status, its placement, and
  that placement's publish date.
- `src/lib/notion/mutations.ts` holds the server actions that write back.

If one database fails to load, the others still render and the failure is shown
as a banner rather than an error page.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
