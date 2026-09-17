import { AppShell } from "@/components/shell/app-shell";
import { SetupForm } from "@/components/setup/setup-form";
import { Card, Notice } from "@/components/ui/primitives";
import { getSnapshot } from "@/lib/notion/store";
import { getSetupState } from "./actions";

export const metadata = { title: "Setup · AFC Command Center" };

// Always render per request: the snapshot reflects live Notion data, so this
// page must never be frozen into the build output.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [snapshot, state] = await Promise.all([getSnapshot(), getSetupState()]);
  const errors = state.problems.filter((p) => p.severity === "error");

  return (
    <AppShell
      snapshot={snapshot}
      title="Setup"
      subtitle="Connect Notion and map each database's properties"
    >
      <div className="space-y-4">
        <Card title="Connection">
          <div className="space-y-2 p-3">
            {state.isMock ? (
              <Notice tone="warning">
                <p className="font-medium text-ink">
                  Running on sample data (MOCK_NOTION=1).
                </p>
                <p className="mt-0.5">
                  Everything works, but nothing is read from or written to
                  Notion. Remove that variable and add a token to connect for
                  real.
                </p>
              </Notice>
            ) : (
              <>
                <Row
                  label="Notion token"
                  ok={state.hasToken}
                  okText="Set"
                  badText="NOTION_TOKEN is not set"
                />
                {(Object.keys(state.envVarNames) as Array<
                  keyof typeof state.envVarNames
                >).map((source) => {
                  const schema = state.schemas.find((s) => s.source === source);
                  return (
                    <Row
                      key={source}
                      label={state.envVarNames[source]}
                      ok={Boolean(schema && !schema.error)}
                      okText={schema?.title ?? "Connected"}
                      badText={schema?.error ?? "Not set"}
                    />
                  );
                })}
              </>
            )}
          </div>
        </Card>

        {errors.length > 0 && (
          <Notice tone="critical">
            <p className="font-medium text-ink">
              {errors.length} required field
              {errors.length === 1 ? " is" : "s are"} not mapped.
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {errors.map((problem) => (
                <li key={`${problem.database}.${problem.role}`}>
                  <span className="text-ink">{problem.database}</span>:{" "}
                  {problem.message}
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {state.mappingError && (
          <Notice tone="critical">{state.mappingError}</Notice>
        )}

        {!state.canWriteFile && (
          <Notice tone="info">
            <p>
              This deployment has a read-only filesystem, so saving will show
              you JSON to paste into the{" "}
              <code className="text-ink">DASHBOARD_MAPPING_JSON</code>{" "}
              environment variable instead of writing a file.
            </p>
          </Notice>
        )}

        <SetupForm state={state} />

        <Card title="How to connect">
          <ol className="list-inside list-decimal space-y-1.5 p-3 text-[12px] text-ink-secondary">
            <li>
              Create an internal integration at{" "}
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noreferrer"
                className="text-series-1 hover:underline"
              >
                notion.so/my-integrations
              </a>{" "}
              and copy its token into{" "}
              <code className="text-ink">NOTION_TOKEN</code>.
            </li>
            <li>
              Open each of the five databases in Notion, then use the ••• menu →
              Connections → add your integration. Without this the database will
              not be visible to the dashboard.
            </li>
            <li>
              Copy each database id from its URL (the 32-character string before{" "}
              <code className="text-ink">?v=</code>) into the matching
              environment variable above.
            </li>
            <li>
              Reload this page, press Auto-map, correct anything it guessed
              wrong, then Save.
            </li>
          </ol>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({
  label,
  ok,
  okText,
  badText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline pb-2 last:border-b-0 last:pb-0">
      <code className="text-[12px] text-ink-secondary">{label}</code>
      <span
        className={`text-right text-[11px] ${ok ? "text-good" : "text-critical"}`}
      >
        {ok ? okText : badText}
      </span>
    </div>
  );
}
