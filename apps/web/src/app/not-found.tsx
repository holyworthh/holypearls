import { ButtonLink, PageState, PublicShell } from "@holypearls/ui";

export default function NotFound() {
  return (
    <PublicShell>
      <PageState
        eyebrow="404"
        title="We can’t find that page"
        body="The link may be old or mistyped. Start again from the homepage."
        actions={<ButtonLink href="/">Go to the homepage</ButtonLink>}
      />
    </PublicShell>
  );
}
