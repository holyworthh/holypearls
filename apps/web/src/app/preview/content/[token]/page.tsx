import { loadWebEnv } from "@holypearls/config";
import { publicContentPageSchema } from "@holypearls/contracts";
import { EmptyState, Notice } from "@holypearls/ui";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { AboutView } from "../../../../components/content/views/AboutView";
import { CaseStudyView } from "../../../../components/content/views/CaseStudyView";
import { GuideView } from "../../../../components/content/views/GuideView";
import { ProjectView } from "../../../../components/content/views/ProjectView";
import { SiteShell } from "../../../../components/site/SiteShell";
import { visitorHeaders } from "../../../../lib/visitor";

const env = loadWebEnv();
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Draft preview", robots: { index: false, follow: false } };

type Params = { params: Promise<{ token: string }> };

/**
 * A staff preview of a draft content page (owner, 2026-10-05). The link comes
 * from the admin's content editor, is signed and lasts an hour. It's never
 * cached or indexed, and it says plainly that the page isn't published.
 */
export default async function ContentPreviewPage({ params }: Params) {
  const { token } = await params;
  const incoming = await headers();
  const response = /^[\w.-]{1,200}$/.test(token)
    ? await fetch(`${env.API_URL}/v1/content/preview/${token}`, { headers: { accept: "application/json", ...visitorHeaders(incoming) }, cache: "no-store" })
    : null;
  if (!response?.ok) {
    return (
      <SiteShell>
        <EmptyState title="This preview link has expired" body="Preview links last an hour. Open the page in the admin and choose Preview again." />
      </SiteShell>
    );
  }
  const page = publicContentPageSchema.parse(await response.json());
  const View = { ABOUT: AboutView, CASE_STUDY: CaseStudyView, GUIDE: GuideView, PROJECT: ProjectView }[page.type];
  return (
    <>
      <Notice tone="warning">Draft preview. This page isn&apos;t published, and only people with this link can see it.</Notice>
      <View page={page} />
    </>
  );
}
