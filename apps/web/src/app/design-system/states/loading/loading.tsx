import { PageLoading, PublicShell } from "@holypearls/ui";

// Route-level loading page. Loading files sit next to slow routes, not at the
// root: a root loading.tsx streams every response, so missing pages would
// return 200 instead of 404.
export default function Loading() {
  return (
    <PublicShell>
      <PageLoading />
    </PublicShell>
  );
}
