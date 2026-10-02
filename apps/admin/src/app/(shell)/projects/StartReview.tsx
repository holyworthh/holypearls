"use client";

import { adminProjectSchema } from "@holypearls/contracts";
import { Button } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Start review: SUBMITTED → UNDER_REVIEW (Pen 124B). */
export function StartReview({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await api(`/v1/admin/projects/${projectId}/start-review`, { method: "POST", response: adminProjectSchema });
      router.refresh();
    } catch (problem) {
      setFailed(errorCode(problem) === "CONFLICT" ? "Someone already started reviewing it. Reload to see who." : "We couldn't start the review. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button type="button" variant="secondary" loading={busy} onClick={start}>
        Start review (UNDER_REVIEW)
      </Button>
      {failed ? <span role="alert">{failed}</span> : null}
    </>
  );
}
