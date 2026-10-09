import { locationDetailSchema, locationListSchema } from "@holypearls/contracts";
import { ButtonLink, EmptyState, ErrorState } from "@holypearls/ui";
import type { Metadata } from "next";
import { loadWorkspace } from "../../../../components/workspace/load";
import { LocationsView } from "../../../../components/workspace/LocationsView";
import { SettingsTabs, WorkspaceShell } from "../../../../components/workspace/WorkspaceShell";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Locations", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Locations (Pen 71 · fEByF): the list beside one location's detail. Members
 * only see their own locations; a Lekki manager sees Lekki (TECH-03 §7).
 */
export default async function LocationsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ location?: string }> }) {
  const { organizationId } = await params;
  const { location: chosen } = await searchParams;
  const { me, organization } = await loadWorkspace(organizationId, `/workspace/${organizationId}/locations`);
  const canManageTeam = organization.me.permissions.includes("MANAGE_TEAM");
  const list = await serverApi(`/v1/organizations/${organizationId}/locations`, locationListSchema);
  const selectedId = list.ok ? (list.data.locations.find((location) => location.id === chosen) ?? list.data.locations[0])?.id : undefined;
  const detail = selectedId ? await serverApi(`/v1/organizations/${organizationId}/locations/${selectedId}`, locationDetailSchema) : null;
  return (
    <WorkspaceShell organization={organization} userName={me.name} section="settings">
      <SettingsTabs organizationId={organizationId} current="locations" me={organization.me} />
      {!list.ok || (detail && !detail.ok) ? (
        <ErrorState
          title="We couldn't load locations"
          body="Something went wrong on our side. Try again, or share the request ID with support."
          requestId={!list.ok ? list.error.requestId : detail && !detail.ok ? detail.error.requestId : null}
          action={<ButtonLink variant="secondary" href={`/workspace/${organizationId}/locations`}>Try again</ButtonLink>}
        />
      ) : list.data.locations.length === 0 ? (
        <EmptyState title="No locations yet" body="Locations you can see appear here." />
      ) : (
        <LocationsView
          organizationId={organizationId}
          locations={list.data.locations}
          detail={detail?.ok ? detail.data : null}
          canManage={canManageTeam && organization.me.allLocations}
        />
      )}
    </WorkspaceShell>
  );
}
