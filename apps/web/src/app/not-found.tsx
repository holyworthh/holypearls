import { ButtonLink, PageState } from "@holypearls/ui";
import site from "../components/site/site.module.css";
import { SiteShell } from "../components/site/SiteShell";

export default function NotFound() {
  return (
    <SiteShell>
      <div className={site.statePage}>
      <PageState
        eyebrow="404"
        title="We can’t find that page"
        body="The link may be old or mistyped. Start again from the homepage."
        actions={<ButtonLink href="/">Go to the homepage</ButtonLink>}
      />
      </div>
    </SiteShell>
  );
}
