import type { MyOrganization } from "@holypearls/contracts";

/**
 * Workspaces the person can place orders and projects for (CREATE_REQUESTS),
 * with the locations they may use. Kept out of the "use client" picker so
 * server pages (checkout, the project builder) can call it.
 */
export const placeableWorkspaces = (organizations: readonly MyOrganization[]) => organizations.filter((organization) => organization.me.permissions.includes("CREATE_REQUESTS") && organization.me.locations.length > 0);
