"use client";

import { Button, PageState, PublicShell } from "@holypearls/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PublicShell>
      <PageState
        eyebrow={error.digest ? `Error ${error.digest}` : "Error"}
        title="Something went wrong"
        body="Please try again. If it keeps happening, come back in a few minutes."
        actions={<Button onClick={reset}>Try again</Button>}
      />
    </PublicShell>
  );
}
