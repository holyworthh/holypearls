"use client";

import type { MyOrganization, PlacedFor, PlacedForInput } from "@holypearls/contracts";
import { FormField, Notice, Select } from "@holypearls/ui";
import { errorCode } from "@holypearls/web-kit/api";
import { Building2 } from "lucide-react";
import { useState } from "react";
import styles from "./workspace.module.css";


/**
 * "Who's this for?" (T10-03): a personal purchase, or one of the person's
 * workspace locations. The order or project then shows in that workspace;
 * the server checks the choice again.
 */
export function PlacedForPicker({
  id,
  label,
  workspaces,
  current,
  onChange,
}: {
  id: string;
  label: string;
  workspaces: readonly MyOrganization[];
  current: PlacedFor | null;
  onChange: (placedFor: PlacedForInput) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const value = current ? `${current.organizationId}:${current.locationId}` : "";
  const options = [
    { value: "", label: "Just me (personal)" },
    ...workspaces.flatMap((organization) => organization.me.locations.map((location) => ({ value: `${organization.id}:${location.id}`, label: `${organization.name} · ${location.name}` }))),
  ];
  return (
    <div className={styles.placedFor}>
      <Building2 aria-hidden className={styles.placedForIcon} />
      <div className={styles.placedForBody}>
        <FormField id={id} label={label} hint="Orders for a workspace show in its lists and billing for the people who manage it.">
          <Select
            value={value}
            disabled={saving}
            options={options}
            onChange={async (event) => {
              const [organizationId, locationId] = event.target.value.split(":");
              setSaving(true);
              setProblem(null);
              try {
                await onChange(organizationId && locationId ? { organizationId, locationId } : null);
              } catch (error) {
                setProblem(errorCode(error) === "FORBIDDEN" ? "You can't place orders for that workspace." : "We couldn't save that. Try again.");
              } finally {
                setSaving(false);
              }
            }}
          />
        </FormField>
        {problem ? (
          <Notice tone="error" live>
            <p>{problem}</p>
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
