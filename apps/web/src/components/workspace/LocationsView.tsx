"use client";

import { ApiError, IDEMPOTENCY_KEY_HEADER, type LocationDetail, locationDetailSchema, locationInputSchema, type LocationSummary, ROLE_LABELS, toFieldErrors } from "@holypearls/contracts";
import { Button, Dialog, FormField, Notice, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { ChevronRight, MapPin, Plus, Users } from "lucide-react";
import { useState } from "react";
import { REFUSAL } from "./labels";
import styles from "./workspace.module.css";

const people = (count: number) => `${count} ${count === 1 ? "member" : "members"}`;

/**
 * Locations (Pen 71 · fEByF): list and detail. Team managers with All
 * locations add and rename locations. The Pen's delivery address, templates,
 * company store and recent orders arrive with later tickets.
 */
export function LocationsView({ organizationId, locations, detail, canManage }: { organizationId: string; locations: LocationSummary[]; detail: LocationDetail | null; canManage: boolean }) {
  const [editing, setEditing] = useState<"add" | "edit" | null>(null);
  const base = `/workspace/${organizationId}/locations`;
  return (
    <>
      <h1 className={styles.title}>Locations</h1>
      <div className={styles.split}>
        <ul className={styles.locationList} aria-label="Locations">
          {locations.map((location) => (
            <li key={location.id}>
              <a className={styles.location} href={`${base}?location=${location.id}`} aria-current={detail?.id === location.id ? "true" : undefined}>
                <MapPin aria-hidden className={styles.locationIcon} />
                <span className={styles.cardText}>
                  <span className={styles.locationName}>{location.name}</span>
                  <span className={styles.personEmail}>
                    {location.city} · {people(location.memberCount)}
                  </span>
                </span>
                <ChevronRight aria-hidden className={styles.chevron} />
              </a>
            </li>
          ))}
          {canManage ? (
            <li>
              <button type="button" className={styles.addLocation} onClick={() => setEditing("add")}>
                <Plus aria-hidden />
                Add a location
              </button>
            </li>
          ) : null}
        </ul>
        {detail ? (
          <section className={styles.detail} aria-labelledby="location-title">
            <div className={styles.detailHead}>
              <h2 id="location-title" className={styles.detailTitle}>
                {detail.name}
              </h2>
              {canManage ? (
                <button type="button" className={styles.textButton} onClick={() => setEditing("edit")}>
                  Edit
                </button>
              ) : null}
            </div>
            <div className={styles.detailRow}>
              <MapPin aria-hidden />
              <div className={styles.detailText}>
                <span className={styles.detailLabel}>City</span>
                <p className={styles.detailValue}>{detail.city}</p>
              </div>
            </div>
            <div className={styles.detailRow}>
              <Users aria-hidden />
              <div className={styles.detailText}>
                <span className={styles.detailLabel}>Members · {detail.memberCount}</span>
                <ul className={styles.detailValue}>
                  {detail.members.map((member) => (
                    <li key={member.membershipId}>
                      {member.name} ({ROLE_LABELS[member.role]}
                      {member.allLocations ? ", all locations" : ""})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}
      </div>
      {editing ? <LocationDialog organizationId={organizationId} location={editing === "edit" ? detail : null} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function LocationDialog({ organizationId, location, onClose }: { organizationId: string; location: LocationDetail | null; onClose: () => void }) {
  const [name, setName] = useState(location?.name ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newIdempotencyKey());

  const save = async () => {
    const parsed = locationInputSchema.safeParse({ name, city });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFailure(undefined);
    setBusy(true);
    try {
      const saved = location
        ? await api(`/v1/organizations/${organizationId}/locations/${location.id}`, { method: "PATCH", body: { ...parsed.data, version: location.version }, response: locationDetailSchema })
        : await api(`/v1/organizations/${organizationId}/locations`, { method: "POST", body: parsed.data, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: locationDetailSchema });
      window.location.assign(`/workspace/${organizationId}/locations?location=${saved.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else if (errorCode(error) === "VERSION_CONFLICT") setFailure("Someone else changed this location first. Reload the page and try again.");
      else setFailure(REFUSAL[errorReason(error) ?? ""] ?? "We couldn't save the location. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={location ? `Edit ${location.name}` : "Add a location"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            {location ? "Save changes" : "Add location"}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {failure ? (
          <Notice tone="error" live>
            <p>{failure}</p>
          </Notice>
        ) : null}
        <FormField id="location-name" label="Name" hint="For example Lekki or Head office" error={errors.name}>
          <TextField value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField id="location-city" label="City" error={errors.city}>
          <TextField value={city} onChange={(event) => setCity(event.target.value)} />
        </FormField>
      </div>
    </Dialog>
  );
}
