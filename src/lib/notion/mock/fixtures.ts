import type {
  Ad,
  Company,
  MediaItem,
  MediaSource,
  Person,
  StatusBucket,
} from "@/lib/types";
import type { AdBucket } from "@/lib/types";

/**
 * Bundled sample data for MOCK_NOTION=1. It exists so the UI can be built,
 * demoed, and screenshotted without a Notion token, and so the mutation paths
 * can be exercised end to end. Dates are generated relative to today, so the
 * calendar always has something on it.
 */

const PEOPLE: Person[] = [
  { id: "person-jake", name: "Jake", avatarUrl: null },
  { id: "person-mara", name: "Mara", avatarUrl: null },
  { id: "person-devin", name: "Devin", avatarUrl: null },
  { id: "person-priya", name: "Priya", avatarUrl: null },
];

export const MOCK_PEOPLE = PEOPLE;

/** Status options, as a real workspace would name them. */
const CONTENT_STATUS: Array<[string, StatusBucket, string]> = [
  ["Idea", "planned", "gray"],
  ["Scripting", "inProgress", "orange"],
  ["Filming", "inProgress", "yellow"],
  ["Editing", "inProgress", "blue"],
  ["Scheduled", "scheduled", "purple"],
  ["Published", "published", "green"],
];

const AD_STATUS: Array<[string, AdBucket, string]> = [
  ["Owed", "owed", "red"],
  ["Placed", "placed", "yellow"],
  ["Published", "published", "green"],
];

export const MOCK_CONTENT_STATUS_OPTIONS = CONTENT_STATUS.map(
  ([name, bucket, color]) => ({ name, bucket, color }),
);

export const MOCK_AD_STATUS_OPTIONS = AD_STATUS.map(([name, bucket, color]) => ({
  name,
  bucket,
  color,
}));

function iso(offsetDays: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function status(index: number) {
  const [name, bucket, color] = CONTENT_STATUS[index];
  return { name, bucket, color };
}

function adStatus(index: number) {
  const [name, bucket, color] = AD_STATUS[index];
  return { name, bucket, color };
}

function person(index: number): Person[] {
  return [PEOPLE[index % PEOPLE.length]];
}

function media(
  id: string,
  source: MediaSource,
  title: string,
  channels: string[],
  statusIndex: number,
  dayOffset: number | null,
  ownerIndex: number,
  parentId: string | null = null,
): MediaItem {
  return {
    id,
    source,
    title,
    notionUrl: `https://www.notion.so/${id.replace(/-/g, "")}`,
    lastEditedTime: new Date().toISOString(),
    status: status(statusIndex),
    publishDate: dayOffset === null ? null : iso(dayOffset),
    channels,
    owners: person(ownerIndex),
    externalUrl:
      statusIndex === 5 ? `https://example.com/watch/${id.slice(-4)}` : null,
    parentId,
    adIds: [],
  };
}

export const MOCK_COMPANIES: Company[] = [
  {
    id: "co-ledgerly",
    source: "companies",
    title: "Ledgerly",
    notionUrl: "https://www.notion.so/coledgerly",
    lastEditedTime: new Date().toISOString(),
    status: "Active",
    contact: "sam@ledgerly.example",
    externalUrl: "https://ledgerly.example",
  },
  {
    id: "co-taxpilot",
    source: "companies",
    title: "TaxPilot",
    notionUrl: "https://www.notion.so/cotaxpilot",
    lastEditedTime: new Date().toISOString(),
    status: "Active",
    contact: "partners@taxpilot.example",
    externalUrl: "https://taxpilot.example",
  },
  {
    id: "co-firmflow",
    source: "companies",
    title: "FirmFlow",
    notionUrl: "https://www.notion.so/cofirmflow",
    lastEditedTime: new Date().toISOString(),
    status: "Active",
    contact: "hello@firmflow.example",
    externalUrl: "https://firmflow.example",
  },
  {
    id: "co-advisorstack",
    source: "companies",
    title: "AdvisorStack",
    notionUrl: "https://www.notion.so/coadvisorstack",
    lastEditedTime: new Date().toISOString(),
    status: "Renewal due",
    contact: "growth@advisorstack.example",
    externalUrl: "https://advisorstack.example",
  },
  {
    id: "co-cashbase",
    source: "companies",
    title: "Cashbase",
    notionUrl: "https://www.notion.so/cocashbase",
    lastEditedTime: new Date().toISOString(),
    status: "Paused",
    contact: "ads@cashbase.example",
    externalUrl: "https://cashbase.example",
  },
];

export const MOCK_CONTENT: MediaItem[] = [
  media("ct-001", "content", "How to price advisory services in 2026", ["YouTube"], 5, -21, 0),
  media("ct-002", "content", "The 4-person firm doing $2M", ["YouTube"], 5, -14, 0),
  media("ct-003", "content", "Why your realization rate is lying to you", ["Newsletter"], 5, -12, 1),
  media("ct-004", "content", "Firing your worst 20% of clients", ["Podcast"], 5, -9, 2),
  media("ct-005", "content", "The offshore staffing playbook", ["YouTube"], 5, -7, 0),
  media("ct-006", "content", "Busy season pricing letters that work", ["Newsletter"], 5, -5, 1),
  media("ct-007", "content", "Interview: scaling to 40 staff without partners", ["Podcast"], 5, -2, 2),
  media("ct-008", "content", "Three tech stacks for modern firms", ["YouTube"], 4, 1, 0),
  media("ct-009", "content", "The onboarding checklist we steal from", ["Newsletter"], 4, 2, 1),
  media("ct-010", "content", "What partners get wrong about capacity", ["Podcast"], 4, 3, 2),
  media("ct-011", "content", "Raising fees 30% without losing clients", ["YouTube"], 3, 5, 0),
  media("ct-012", "content", "Your CAS practice is a bookkeeping practice", ["Newsletter"], 3, 8, 3),
  media("ct-013", "content", "Interview: selling a firm at 1.4x", ["Podcast"], 2, 10, 2),
  media("ct-014", "content", "The hiring funnel that actually fills seats", ["YouTube"], 2, 12, 0),
  media("ct-015", "content", "Niching down: the 90-day test", ["Newsletter"], 1, 15, 1),
  media("ct-016", "content", "How much should a controller cost?", ["YouTube"], 1, 19, 3),
  media("ct-017", "content", "Partner comp models, ranked", ["Podcast"], 1, 22, 2),
  media("ct-018", "content", "The 2027 busy season prep list", ["Newsletter"], 0, 26, 1),
  media("ct-019", "content", "Untitled advisory series pilot", ["YouTube"], 0, null, 0),
  media("ct-020", "content", "AI in tax prep: what actually works", ["YouTube", "Newsletter"], 0, null, 3),
];

export const MOCK_SHORTS: MediaItem[] = [
  media("sh-001", "shorts", "Stop billing hourly (60s)", ["Shorts"], 5, -13, 3, "ct-002"),
  media("sh-002", "shorts", "Realization rate in 45 seconds", ["Shorts"], 5, -11, 3, "ct-003"),
  media("sh-003", "shorts", "The client you should fire today", ["Shorts"], 5, -6, 1, "ct-004"),
  media("sh-004", "shorts", "Offshore hiring, one rule", ["Shorts"], 5, -3, 3, "ct-005"),
  media("sh-005", "shorts", "Pricing letter hook", ["Shorts"], 4, 1, 1, "ct-006"),
  media("sh-006", "shorts", "40 staff, zero partners", ["Shorts"], 4, 4, 3, "ct-007"),
  media("sh-007", "shorts", "Tech stack hot take", ["Shorts"], 3, 6, 1, "ct-008"),
  media("sh-008", "shorts", "Capacity math nobody does", ["Shorts"], 2, 9, 3, "ct-010"),
  media("sh-009", "shorts", "Raise fees, keep clients", ["Shorts"], 1, 13, 1, "ct-011"),
  media("sh-010", "shorts", "CAS is not bookkeeping", ["Shorts"], 0, null, 3, "ct-012"),
];

export const MOCK_CLIPS: MediaItem[] = [
  media("cl-001", "clips", "Full clip: firing the worst 20%", ["Clips"], 5, -8, 2, "ct-004"),
  media("cl-002", "clips", "Full clip: offshore team structure", ["Clips"], 5, -4, 2, "ct-005"),
  media("cl-003", "clips", "Full clip: the 40-staff hiring loop", ["Clips"], 5, -1, 2, "ct-007"),
  media("cl-004", "clips", "Full clip: partner capacity myth", ["Clips"], 4, 3, 2, "ct-010"),
  media("cl-005", "clips", "Full clip: 1.4x sale story", ["Clips"], 2, 11, 2, "ct-013"),
  media("cl-006", "clips", "Full clip: comp models argument", ["Clips"], 1, 23, 2, "ct-017"),
];

function ad(
  id: string,
  title: string,
  companyId: string,
  statusIndex: number,
  placement: { source: "content" | "shorts"; id: string } | null,
  dueOffset: number | null,
  adType: string,
  notes: string | null = null,
): Ad {
  return {
    id,
    source: "ads",
    title,
    notionUrl: `https://www.notion.so/${id.replace(/-/g, "")}`,
    lastEditedTime: new Date().toISOString(),
    status: adStatus(statusIndex),
    companyId,
    placement,
    dueDate: dueOffset === null ? null : iso(dueOffset),
    adType,
    notes,
  };
}

export const MOCK_ADS: Ad[] = [
  ad("ad-001", "Ledgerly – Q3 integration read #1", "co-ledgerly", 2, { source: "content", id: "ct-002" }, -20, "Mid-roll"),
  ad("ad-002", "Ledgerly – Q3 integration read #2", "co-ledgerly", 2, { source: "content", id: "ct-005" }, -10, "Mid-roll"),
  ad("ad-003", "Ledgerly – Q3 newsletter primary", "co-ledgerly", 2, { source: "content", id: "ct-006" }, -4, "Newsletter primary"),
  ad("ad-004", "Ledgerly – Q4 integration read #1", "co-ledgerly", 1, { source: "content", id: "ct-008" }, 3, "Mid-roll"),
  ad("ad-005", "Ledgerly – Q4 integration read #2", "co-ledgerly", 0, null, 18, "Mid-roll"),
  ad("ad-006", "Ledgerly – Q4 shorts mention", "co-ledgerly", 1, { source: "shorts", id: "sh-006" }, 6, "Shorts mention"),
  ad("ad-007", "TaxPilot – launch pre-roll", "co-taxpilot", 2, { source: "content", id: "ct-004" }, -8, "Pre-roll"),
  ad("ad-008", "TaxPilot – podcast host read", "co-taxpilot", 1, { source: "content", id: "ct-010" }, 5, "Host read"),
  ad("ad-009", "TaxPilot – newsletter secondary", "co-taxpilot", 0, null, -3, "Newsletter secondary", "Chasing creative from their team."),
  ad("ad-010", "TaxPilot – shorts mention", "co-taxpilot", 0, null, 9, "Shorts mention"),
  ad("ad-011", "FirmFlow – annual read #1", "co-firmflow", 2, { source: "content", id: "ct-003" }, -11, "Newsletter primary"),
  ad("ad-012", "FirmFlow – annual read #2", "co-firmflow", 2, { source: "content", id: "ct-007" }, -1, "Host read"),
  ad("ad-013", "FirmFlow – annual read #3", "co-firmflow", 1, { source: "content", id: "ct-009" }, 2, "Newsletter primary"),
  ad("ad-014", "FirmFlow – annual read #4", "co-firmflow", 1, { source: "content", id: "ct-011" }, 7, "Mid-roll"),
  ad("ad-015", "FirmFlow – annual read #5", "co-firmflow", 0, null, 21, "Mid-roll"),
  ad("ad-016", "FirmFlow – annual read #6", "co-firmflow", 0, null, 35, "Mid-roll"),
  ad("ad-017", "AdvisorStack – pilot pre-roll", "co-advisorstack", 1, { source: "content", id: "ct-014" }, 11, "Pre-roll"),
  ad("ad-018", "AdvisorStack – pilot newsletter", "co-advisorstack", 0, null, -6, "Newsletter primary", "Overdue. Needs a slot this month."),
  ad("ad-019", "AdvisorStack – pilot shorts", "co-advisorstack", 1, { source: "shorts", id: "sh-010" }, 14, "Shorts mention", "Placed on a short with no publish date yet."),
  ad("ad-020", "Cashbase – makegood read", "co-cashbase", 0, null, 4, "Mid-roll", "Owed from the Q2 shortfall."),
  ad("ad-021", "Cashbase – newsletter primary", "co-cashbase", 1, { source: "content", id: "ct-012" }, 8, "Newsletter primary"),
  ad("ad-022", "Cashbase – podcast host read", "co-cashbase", 2, { source: "content", id: "ct-001" }, -19, "Host read"),
];

/**
 * Schemas that mirror the fixture fields, so the setup page can be seen and
 * exercised in mock mode rather than sitting empty until a token exists.
 */
export const MOCK_SCHEMAS: Record<
  string,
  {
    title: string;
    properties: Array<{
      name: string;
      type: string;
      options?: Array<{ name: string; color: string; groupName?: string }>;
      relationDatabaseId?: string;
    }>;
  }
> = {
  content: {
    title: "Content (sample)",
    properties: [
      { name: "Name", type: "title" },
      {
        name: "Status",
        type: "status",
        options: CONTENT_STATUS.map(([name, , color]) => ({ name, color })),
      },
      { name: "Publish Date", type: "date" },
      {
        name: "Channel",
        type: "select",
        options: [
          { name: "YouTube", color: "red" },
          { name: "Newsletter", color: "blue" },
          { name: "Podcast", color: "purple" },
        ],
      },
      { name: "Owner", type: "people" },
      { name: "Published Link", type: "url" },
      { name: "Notes", type: "rich_text" },
    ],
  },
  shorts: {
    title: "Shorts (sample)",
    properties: [
      { name: "Name", type: "title" },
      {
        name: "Status",
        type: "status",
        options: CONTENT_STATUS.map(([name, , color]) => ({ name, color })),
      },
      { name: "Publish Date", type: "date" },
      { name: "Owner", type: "people" },
      { name: "Source Episode", type: "relation", relationDatabaseId: "db-content" },
    ],
  },
  clips: {
    title: "Clips (sample)",
    properties: [
      { name: "Name", type: "title" },
      {
        name: "Status",
        type: "status",
        options: CONTENT_STATUS.map(([name, , color]) => ({ name, color })),
      },
      { name: "Publish Date", type: "date" },
      { name: "Owner", type: "people" },
      { name: "Source Episode", type: "relation", relationDatabaseId: "db-content" },
    ],
  },
  ads: {
    title: "Ads (sample)",
    properties: [
      { name: "Name", type: "title" },
      {
        name: "Status",
        type: "status",
        options: AD_STATUS.map(([name, , color]) => ({ name, color })),
      },
      { name: "Sponsor", type: "relation", relationDatabaseId: "db-companies" },
      { name: "Placed On", type: "relation", relationDatabaseId: "db-content" },
      { name: "Placed On Short", type: "relation", relationDatabaseId: "db-shorts" },
      { name: "Due Date", type: "date" },
      {
        name: "Ad Type",
        type: "select",
        options: [
          { name: "Mid-roll", color: "blue" },
          { name: "Pre-roll", color: "green" },
          { name: "Host read", color: "orange" },
          { name: "Newsletter primary", color: "purple" },
          { name: "Newsletter secondary", color: "pink" },
          { name: "Shorts mention", color: "yellow" },
        ],
      },
      { name: "Notes", type: "rich_text" },
    ],
  },
  companies: {
    title: "Companies (sample)",
    properties: [
      { name: "Name", type: "title" },
      {
        name: "Status",
        type: "select",
        options: [
          { name: "Active", color: "green" },
          { name: "Paused", color: "gray" },
          { name: "Renewal due", color: "orange" },
        ],
      },
      { name: "Contact", type: "email" },
      { name: "Website", type: "url" },
    ],
  },
};

/** Fake database ids, so relation targeting can be exercised in mock mode. */
export const MOCK_DATABASE_IDS: Record<string, string> = {
  content: "db-content",
  shorts: "db-shorts",
  clips: "db-clips",
  ads: "db-ads",
  companies: "db-companies",
};
