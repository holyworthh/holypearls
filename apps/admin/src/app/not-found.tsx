import { ButtonLink, PageState } from "@holypearls/ui";

export default function NotFound() {
  return (
    <main id="main-content">
      <PageState eyebrow="404" title="We can’t find that page" body="It may have moved, or you may not have access to it." actions={<ButtonLink href="/">Go to the admin home</ButtonLink>} />
    </main>
  );
}
