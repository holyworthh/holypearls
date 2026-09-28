import { loadWebEnv } from "@holypearls/config";
import { PublicShell } from "@holypearls/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SliceDemo } from "./SliceDemo";

export const metadata: Metadata = { title: "End-to-end slice", robots: { index: false } };
export const dynamic = "force-dynamic";

/** T00-04 developer page: web form → API → database → job → result. Off unless HP_DEMO_SLICE=on. */
export default function SlicePage() {
  if (loadWebEnv().HP_DEMO_SLICE !== "on") notFound();
  return (
    <PublicShell>
      <SliceDemo />
    </PublicShell>
  );
}
