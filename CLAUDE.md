# AFC Command Center

A dashboard over five Notion databases for a media company selling sponsorships
to accounting firm owners: main content (newsletter, podcast, YouTube), shorts,
clips, ads, and companies. Notion is the source of truth; this reads it live and
writes back to it.

## Running it

```bash
npm run dev:mock    # bundled fixtures, no Notion token needed
npm run dev         # real Notion, needs .env.local
npm run schema:export   # dumps the real Notion schema, structure only
```

`MOCK_NOTION=1` is the way to work on anything visual. The fixtures carry about
1,200 rows spanning two years, which is roughly the real scale, so pagination
and the history window behave the way they will in production.

## The two ideas that explain most of the code

### 1. Property names are never hardcoded

Nobody's Notion workspace matches anyone else's, so the code addresses
*roles*, not property names. `dashboard.mapping.json` maps each database's own
properties onto roles (`title`, `status`, `publishDate`, `views`, …) and each
of its status options onto a bucket (`planned`, `inProgress`, `published`, …).

- `src/lib/mapping/schema.ts` defines and validates the mapping.
- `src/lib/mapping/heuristics.ts` guesses it from names and types.
- `/setup` reads the live schema and lets a human correct the guess.
- `src/lib/notion/normalize.ts` is the only place that reads Notion property
  shapes. Every getter tolerates a missing or wrongly typed property and
  returns an empty value, so a half-finished mapping degrades instead of
  crashing a view.

The mapping file is gitignored: it describes one workspace, not the code.

### 2. The history window, and the trap it sets

Loading every row of every database on each refresh does not survive a few
thousand rows, and the archive is not what anyone looks at. So media loads a
recent window (`HISTORY_WINDOW_MONTHS`, default 6) plus everything upcoming
plus everything undated. See `recentWindowFilter` in `src/lib/notion/query.ts`.

**This breaks the ad-to-content join, and the fix must not be removed.** An ad
placed on an episode older than the window finds no target, `placedOn` falls to
null, and the tracker reports a long-delivered sponsorship as *unplaced*. That
is worse than slow: it invents overdue work that does not exist.

`backfillPlacements` in `src/lib/notion/store.ts` fixes it by fetching exactly
those out-of-window pages by id. `findUnresolvedPlacements` is the pure part,
covered in `tests/window.test.ts`. Mock mode applies the same window and
backfill, and the fixtures deliberately place ~180 ads on archived content so
the path is exercised.

Ads and companies always load in full: both are small, and delivery history is
what matters at renewal.

## Shape of the code

| Path | What lives there |
|---|---|
| `src/lib/notion/query.ts` | Talking to Notion: pagination, filters, retries |
| `src/lib/notion/normalize.ts` | Raw pages to domain records, via the mapping |
| `src/lib/notion/store.ts` | Loads all five databases, joins them, caches |
| `src/lib/notion/mutations.ts` | Server actions that write back |
| `src/lib/derive.ts` | Ad state, stats, medians. Pure, heavily tested |
| `src/lib/types.ts` | Domain types. Nothing Notion-shaped |
| `src/lib/filters.ts` | Filters, parsed from and written to the URL |

Notion's 2025-09-03 API keeps rows on a *data source*, not the database, so a
database id is resolved to its primary data source before querying.

## Conventions

- Filters live in the URL, so a filtered view is a link you can paste in Slack.
- Colours come from the validated palette tokens in `src/app/globals.css`.
  Status is never carried by colour alone; a label or count always accompanies
  it. Channels hold a fixed palette slot so a colour means the same channel
  even when a filter removes others from view.
- Numbers that are unknown are `null`, never `0`. A video with no view count
  recorded is not a video with no views.
- Performance summaries use medians, not means: one breakout video should not
  move "what does a typical piece get".

## Before you push

```bash
npm run lint && npm run typecheck && npm test && MOCK_NOTION=1 npm run build
```

Unit tests cover the pure logic. The bugs that actually shipped in this project
were caught by driving the running app in a browser, so for anything touching a
view, run it and look at it.
