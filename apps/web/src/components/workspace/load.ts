import { meSchema, myOrganizationSchema } from "@holypearls/contracts";
import { notFound, redirect } from "next/navigation";
import { serverApi } from "../../lib/server-api";

/**
 * The signed-in person and their organization, for a workspace page.
 * Signed out → sign-in and back; not a member, or deactivated → 404, so
 * nobody learns the organization exists (TECH-03 §12).
 */
export async function loadWorkspace(organizationId: string, path: string) {
  if (!/^[0-9a-f-]{36}$/.test(organizationId)) notFound();
  const me = await serverApi("/v1/me", meSchema);
  if (!me.ok) {
    if (me.status === 401) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
    throw new Error(me.error.message);
  }
  const organization = await serverApi(`/v1/organizations/${organizationId}`, myOrganizationSchema);
  if (!organization.ok) {
    if (organization.status === 404) notFound();
    throw new Error(organization.error.message);
  }
  return { me: me.data, organization: organization.data };
}

/** The location chosen in the switcher, if it's one of the person's own; anything else shows all of theirs. */
export const chosenLocation = (organization: { me: { locations: readonly { id: string }[] } }, raw: string | undefined) =>
  raw && organization.me.locations.some((location) => location.id === raw) ? raw : null;
