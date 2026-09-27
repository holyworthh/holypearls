import { PageState, PublicShell } from "@holypearls/ui";

// Waits so the sibling loading.tsx is visible.
export default async function LoadingPreview({ searchParams }: { searchParams: Promise<{ delay?: string }> }) {
  const { delay } = await searchParams;
  await new Promise((resolve) => setTimeout(resolve, Math.min(Number(delay ?? 1500) || 0, 5000)));
  return (
    <PublicShell>
      <PageState eyebrow="Loaded" title="Content arrived" body="The loading page showed while this route waited." />
    </PublicShell>
  );
}
