import { PageLoading } from "@holypearls/ui";
import site from "../../components/site/site.module.css";
import { SiteShell } from "../../components/site/SiteShell";

export default function Loading() {
  return (
    <SiteShell>
      <div className={site.statePage}>
        <PageLoading label="Loading your account" />
      </div>
    </SiteShell>
  );
}
