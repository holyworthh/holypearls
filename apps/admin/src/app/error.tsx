"use client";

import { Button, PageState } from "@holypearls/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content">
      <PageState
        eyebrow={error.digest ? `Error ${error.digest}` : "Error"}
        title="Something went wrong"
        body="Please try again. If it keeps happening, share the error code with the team."
        actions={<Button onClick={reset}>Try again</Button>}
      />
    </main>
  );
}
