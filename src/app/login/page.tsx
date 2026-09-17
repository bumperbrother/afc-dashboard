import { isPasswordConfigured } from "@/lib/auth";
import { Notice } from "@/components/ui/primitives";

export const metadata = { title: "Sign in · AFC Command Center" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const configured = isPasswordConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-[18px] font-semibold tracking-tight">
            AFC Command Center
          </h1>
          <p className="mt-1 text-[12px] text-ink-muted">
            Content, shorts, clips, and sponsor delivery, in one place.
          </p>
        </div>

        {!configured && (
          <div className="mb-4">
            <Notice tone="critical">
              <p className="font-medium text-ink">No password is set.</p>
              <p className="mt-0.5">
                Set <code className="text-ink">DASHBOARD_PASSWORD</code> in the
                environment, then reload this page.
              </p>
            </Notice>
          </div>
        )}

        {params.error && (
          <div className="mb-4">
            <Notice tone="critical">That password did not match.</Notice>
          </div>
        )}

        <form
          action="/api/login"
          method="post"
          className="rounded-lg border border-hairline bg-surface p-4"
        >
          <input type="hidden" name="next" value={params.next ?? "/"} />
          <label
            htmlFor="password"
            className="mb-1.5 block text-[12px] font-medium text-ink-secondary"
          >
            Team password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            className="w-full rounded border border-line bg-raised px-2.5 py-2 text-[13px] text-ink outline-none placeholder:text-ink-muted focus:border-series-1"
            placeholder="••••••••"
          />
          <button
            type="submit"
            disabled={!configured}
            className="mt-3 w-full rounded bg-series-1 px-3 py-2 text-[13px] font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
