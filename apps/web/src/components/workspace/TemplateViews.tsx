"use client";

import {
  ApiError,
  type BrandAssetSummary,
  type FieldControl,
  IDEMPOTENCY_KEY_HEADER,
  type MyOrganization,
  type Template,
  templateSchema,
  type TemplateSourceList,
} from "@holypearls/contracts";
import { Button, Checkbox, Dialog, FormField, Notice, Select, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { Plus } from "lucide-react";
import { useState } from "react";
import styles from "./workspace.module.css";

type Scope = { allLocations: boolean; locationIds: string[] };

/** Production-ready asset versions a template can use: each asset's current version (B2B-FR-030). */
const usableVersions = (assets: readonly BrandAssetSummary[]) => assets.flatMap((asset) => (asset.current ? [{ id: asset.current.id, label: `${asset.name} V${asset.current.number}` }] : []));

function ScopeChoice({ me, scope, onChange, error }: { me: MyOrganization["me"]; scope: Scope; onChange: (scope: Scope) => void; error?: string }) {
  return (
    <fieldset className={styles.choices}>
      <legend>Who can order it</legend>
      {me.allLocations ? <Checkbox id="template-all" label="All locations" checked={scope.allLocations} onChange={(event) => onChange({ ...scope, allLocations: event.target.checked })} /> : null}
      {scope.allLocations
        ? null
        : me.locations.map((location) => (
            <Checkbox
              key={location.id}
              id={`template-location-${location.id}`}
              label={location.name}
              checked={scope.locationIds.includes(location.id)}
              onChange={(event) => onChange({ ...scope, locationIds: event.target.checked ? [...scope.locationIds, location.id] : scope.locationIds.filter((id) => id !== location.id) })}
            />
          ))}
      {error ? (
        <p className={styles.dialogText} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** "New template" (frame 117's create step, done by the organization): start from an ordered item or a saved design. */
export function NewTemplateButton({ organizationId, me, sources, assets }: { organizationId: string; me: MyOrganization["me"]; sources: TemplateSourceList["sources"]; assets: readonly BrandAssetSummary[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [configurationId, setConfigurationId] = useState(sources[0]?.configurationId ?? "");
  const [versions, setVersions] = useState<string[]>([]);
  const [scope, setScope] = useState<Scope>({ allLocations: me.allLocations, locationIds: me.allLocations ? [] : me.locations.map((location) => location.id) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newIdempotencyKey());
  const choices = usableVersions(assets);

  const save = async () => {
    const problems: Record<string, string> = {};
    if (!name.trim()) problems.name = "Name the template, for example ACME Staff Polo";
    if (!configurationId) problems.configurationId = "Choose what the template starts from";
    if (!scope.allLocations && !scope.locationIds.length) problems.locationIds = "Choose at least one location, or All locations";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const template = await api(`/v1/organizations/${organizationId}/templates`, {
        method: "POST",
        body: { name, configurationId, assetVersionIds: versions, allLocations: scope.allLocations, locationIds: scope.allLocations ? [] : scope.locationIds },
        headers: { [IDEMPOTENCY_KEY_HEADER]: key },
        response: templateSchema,
      });
      window.location.assign(`/workspace/${organizationId}/templates/${template.id}`);
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else setFailure("We couldn't create the template. Try again.");
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden className={styles.buttonIcon} />
        New template
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New template"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={!sources.length} onClick={() => void save()}>
              Create draft
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
          {sources.length ? (
            <FormField id="template-source" label="Start from" hint="A past order for this workspace, or one of your saved designs." error={errors.configurationId}>
              <Select value={configurationId} onChange={(event) => setConfigurationId(event.target.value)} options={sources.map((source) => ({ value: source.configurationId, label: source.label }))} />
            </FormField>
          ) : (
            <p className={styles.dialogText}>Design a product first, or order one for this workspace. A template starts from a saved design or a past order.</p>
          )}
          <FormField id="template-name" label="Template name" error={errors.name}>
            <TextField value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          {choices.length ? (
            <fieldset className={styles.choices}>
              <legend>Brand assets it uses</legend>
              {choices.map((choice) => (
                <Checkbox
                  key={choice.id}
                  id={`template-asset-${choice.id}`}
                  label={choice.label}
                  checked={versions.includes(choice.id)}
                  onChange={(event) => setVersions(event.target.checked ? [...versions, choice.id] : versions.filter((id) => id !== choice.id))}
                />
              ))}
            </fieldset>
          ) : (
            <p className={styles.dialogText}>No production-ready brand assets yet. You can add them later.</p>
          )}
          <ScopeChoice me={me} scope={scope} onChange={setScope} error={errors.locationIds} />
          <p className={styles.dialogText}>Next you choose which fields are locked by your company and which buyers choose, each with a reason. Then send it for HolyPearls&apos; check.</p>
        </div>
      </Dialog>
    </>
  );
}

const MESSAGES: Record<string, string> = {
  ASSET_NOT_READY: "A linked asset version isn't production ready any more. Move the template to the current version first.",
  NOT_SUBMITTABLE: "Only a draft or a blocked template can be sent for the check.",
  ALREADY_ARCHIVED: "This template is already archived.",
};

/**
 * Template actions on the detail page (frames 29, 67): edit field controls
 * and reasons, move to the current asset version, send for HolyPearls'
 * check, archive. Any edit sends it back to draft.
 */
export function TemplateActions({ organizationId, initial, me, assets }: { organizationId: string; initial: Template; me: MyOrganization["me"]; assets: readonly BrandAssetSummary[] }) {
  const [template, setTemplate] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(initial.fields.map(({ key, label, control, reason }) => ({ key, label, control, reason })));
  const [versions, setVersions] = useState(initial.assets.map((asset) => asset.versionId));
  const [scope, setScope] = useState<Scope>({ allLocations: initial.allLocations, locationIds: initial.locations.map((location) => location.id) });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const base = `/v1/organizations/${organizationId}/templates/${template.id}`;
  const choices = usableVersions(assets);
  const outdated = template.assets.filter((asset) => asset.currentNumber !== null);

  const run = async (name: string, call: () => Promise<Template>, done: string) => {
    setBusy(name);
    setNotice(null);
    try {
      const next = await call();
      setTemplate(next);
      setFields(next.fields.map(({ key, label, control, reason }) => ({ key, label, control, reason })));
      setVersions(next.assets.map((asset) => asset.versionId));
      setEditing(false);
      setNotice({ tone: "success", text: done });
    } catch (error) {
      setNotice({ tone: "error", text: errorCode(error) === "VERSION_CONFLICT" ? "Someone else changed this template. Reload the page." : (MESSAGES[errorReason(error) ?? ""] ?? "That didn't work. Try again.") });
    } finally {
      setBusy(null);
    }
  };
  const save = (assetVersionIds = versions) =>
    run(
      "save",
      () =>
        api(base, {
          method: "PUT",
          body: { name: template.name, fields: fields.map(({ key, control, reason }) => ({ key, control, reason })), assetVersionIds, allLocations: scope.allLocations, locationIds: scope.allLocations ? [] : scope.locationIds, version: template.version },
          response: templateSchema,
        }),
      "Saved as a draft. Send it for HolyPearls' check when you're ready.",
    );
  const moveToCurrent = () => {
    const next = template.assets.map((asset) => {
      if (asset.currentNumber === null) return asset.versionId;
      const current = assets.find((item) => item.id === asset.assetId)?.current;
      return current?.id ?? asset.versionId;
    });
    void save(next);
  };

  if (!template.canManage) return null;
  return (
    <>
      {notice ? (
        <Notice tone={notice.tone} live>
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      <div className={styles.quickActions}>
        {outdated.length && template.status !== "ARCHIVED" ? (
          <Button loading={busy === "save"} onClick={moveToCurrent}>
            Update to {outdated.map((asset) => `V${asset.currentNumber}`).join(", ")}
          </Button>
        ) : null}
        {template.status === "DRAFT" || template.status === "NEEDS_REVIEW" ? (
          <Button
            loading={busy === "submit"}
            variant={outdated.length ? "secondary" : "primary"}
            onClick={() => void run("submit", () => api(`${base}/submit`, { method: "POST", body: { version: template.version }, response: templateSchema }), "Sent for HolyPearls' check. We'll check the configuration and artwork before it can be ordered.")}
          >
            Send for HolyPearls&apos; check
          </Button>
        ) : null}
        {template.status !== "ARCHIVED" ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit controls
          </Button>
        ) : null}
        {template.status !== "ARCHIVED" ? (
          <Button variant="tertiary" loading={busy === "archive"} onClick={() => void run("archive", () => api(`${base}/archive`, { method: "POST", body: { version: template.version }, response: templateSchema }), "Archived. It stays in your history.")}>
            Archive
          </Button>
        ) : null}
      </div>
      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${template.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button loading={busy === "save"} onClick={() => void save()}>
              Save as draft
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          <p className={styles.dialogText}>Locked fields can&apos;t be changed by buyers. Every field shows its reason. Saving sends the template back to draft for another HolyPearls check.</p>
          {fields.map((field, index) => (
            <fieldset key={field.key} className={styles.choices}>
              <legend>{field.label}</legend>
              <Select
                aria-label={`${field.label}: who sets it`}
                value={field.control}
                onChange={(event) => setFields(fields.map((item, at) => (at === index ? { ...item, control: event.target.value as FieldControl } : item)))}
                options={[
                  { value: "LOCKED", label: "Company controlled (locked)" },
                  { value: "EDITABLE", label: "Buyer editable" },
                ]}
              />
              <FormField id={`reason-${field.key}`} label="Reason shown to buyers">
                <TextField value={field.reason} maxLength={200} onChange={(event) => setFields(fields.map((item, at) => (at === index ? { ...item, reason: event.target.value } : item)))} />
              </FormField>
            </fieldset>
          ))}
          {choices.length ? (
            <fieldset className={styles.choices}>
              <legend>Brand assets it uses</legend>
              {choices.map((choice) => (
                <Checkbox
                  key={choice.id}
                  id={`edit-asset-${choice.id}`}
                  label={choice.label}
                  checked={versions.includes(choice.id)}
                  onChange={(event) => setVersions(event.target.checked ? [...versions, choice.id] : versions.filter((id) => id !== choice.id))}
                />
              ))}
            </fieldset>
          ) : null}
          <ScopeChoice me={me} scope={scope} onChange={setScope} />
        </div>
      </Dialog>
    </>
  );
}
