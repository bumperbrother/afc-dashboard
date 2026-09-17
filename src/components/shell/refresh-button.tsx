"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/primitives";
import { refreshSnapshot } from "@/app/actions";

/** Drops the cached snapshot and re-renders with fresh Notion data. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await refreshSnapshot();
          router.refresh();
        });
      }}
      title="Reload everything from Notion"
    >
      {pending ? "Refreshing…" : "Refresh"}
    </Button>
  );
}
