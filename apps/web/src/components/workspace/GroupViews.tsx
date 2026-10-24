"use client";

import { ApiError, type Collection, collectionSchema, IDEMPOTENCY_KEY_HEADER, type MyOrganization, PARTICIPANT_FIELD_LABELS, type ParticipantField } from "@holypearls/contracts";
import { Button, Checkbox, DatePicker, FormField, Notice, RadioCardGroup, Select, StatusChip, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { useState } from "react";
import { COLLECTION_STATUS } from "./labels";
import styles from "./workspace.module.css";

type Source = { kind: "TEMPLATE" | "CONFIGURATION"; id: string; label: string };

/** Step 1 (Pen 132 · "NEW GROUP COLLECTION · STEP 1"): a name, the location and what it starts from (B2B-FR-051). */
export function NewCollectionForm({ organizationId, me, sources, initialSource }: { organizationId: string; me: MyOrganization["me"]; sources: readonly Source[]; initialSource: string | null }) {
  const [title, setTitle] = useState("");
  const [locationId, setLocationId] = useState(me.locations[0]?.id ?? "");
  const [source, setSource] = useState(initialSource ?? (sources[0] ? `${sources[0].kind}:${sources[0].id}` : ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newIdempotencyKey());

  const create = async () => {
    const problems: Record<string, string> = {};
    if (!title.trim()) problems.title = "Name the collection, for example Lekki staff polos 2026";
    if (!source) problems.source = "Choose what it starts from";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    const [kind, id] = source.split(":");
    setBusy(true);
    setFailure(undefined);
    try {
      const created = await api(`/v1/organizations/${organizationId}/collections`, {
        method: "POST",
        body: { title, locationId, templateId: kind === "TEMPLATE" ? id : null, configurationId: kind === "CONFIGURATION" ? id : null },
        headers: { [IDEMPOTENCY_KEY_HEADER]: key },
        response: collectionSchema,
      });
      window.location.assign(`/workspace/${organizationId}/groups/${created.id}`);
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else setFailure(errorReason(error) === "TEMPLATE_NOT_FOR_LOCATION" ? "That template isn't available for this location." : "We couldn't start the collection. Try again.");
    }
  };

  return (
    <section className={styles.detail} aria-labelledby="new-collection-title">
      <h2 id="new-collection-title" className={styles.detailTitle}>
        Start a group collection
      </h2>
      {failure ? (
        <Notice tone="error" live>
          <p>{failure}</p>
        </Notice>
      ) : null}
      <div className={styles.form}>
        <FormField id="collection-title" label="Name" error={errors.title}>
          <TextField value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        </FormField>
        <FormField id="collection-location" label="For which location">
          <Select value={locationId} onValueChange={(next) => setLocationId(next)} options={me.locations.map((location) => ({ value: location.id, label: location.name }))} />
        </FormField>
        {sources.length ? (
          <RadioCardGroup
            name="collection-source"
            legend="Starts from"
            value={source}
            onChange={setSource}
            error={errors.source ?? errors.templateId}
            options={sources.map((item) => ({ value: `${item.kind}:${item.id}`, title: item.label, description: item.kind === "TEMPLATE" ? "Approved template" : "Your saved design" }))}
          />
        ) : (
          <p className={styles.dialogText}>Start from an approved template, or design a product first and come back. A collection always starts from one of them.</p>
        )}
        <div className={styles.quickActions}>
          <Button loading={busy} disabled={!sources.length} onClick={() => void create()}>
            Continue
          </Button>
        </div>
      </div>
    </section>
  );
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const MESSAGES: Record<string, string> = {
  NOT_EDITABLE: "Pause the collection before changing it.",
  WRONG_STATUS: "This collection can't do that now. Reload the page.",
  TEMPLATE_NOT_APPROVED: "The template isn't approved any more. Update it first.",
};

/**
 * Step 2 (Pen 132 · a0VCfj desktop, BHzbM 375; states rGGwn): what
 * participants fill in, the deadline and modes, then Open collection. Open
 * shows the share link; Paused tells participants they can't submit.
 */
export function CollectionSetup({ organizationId, initial, locations }: { organizationId: string; initial: Collection; locations: readonly { id: string; name: string }[] }) {
  const [collection, setCollection] = useState(initial);
  const [fields, setFields] = useState<ParticipantField[]>(initial.fields);
  const [deadline, setDeadline] = useState(toLocalInput(initial.deadline));
  const [deliveryMode, setDeliveryMode] = useState(initial.deliveryMode);
  const [centralLocationId, setCentralLocationId] = useState(initial.centralLocationId ?? initial.locationId);
  const [branches, setBranches] = useState(initial.branchLocations.map((location) => location.id));
  const [unsureSizeRule, setUnsureSizeRule] = useState(initial.unsureSizeRule);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const base = `/v1/organizations/${organizationId}/collections/${collection.id}`;
  const editable = collection.canManage && (collection.status === "DRAFT" || collection.status === "PAUSED");
  const status = COLLECTION_STATUS[collection.status];

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
    else setNotice({ tone: "error", text: errorCode(error) === "VERSION_CONFLICT" ? "Someone else changed this collection. Reload the page." : (MESSAGES[errorReason(error) ?? ""] ?? "That didn't work. Try again.") });
  };
  const save = async (): Promise<Collection | null> => {
    setErrors({});
    try {
      const saved = await api(base, {
        method: "PUT",
        body: { title: collection.title, fields, deadline: deadline ? new Date(deadline).toISOString() : null, deliveryMode, centralLocationId: deliveryMode === "CENTRAL" ? centralLocationId : null, branchLocationIds: deliveryMode === "BRANCHES" ? branches : [], unsureSizeRule, version: collection.version },
        response: collectionSchema,
      });
      setCollection(saved);
      return saved;
    } catch (error) {
      fail(error);
      return null;
    }
  };
  const run = async (name: string, action: "open" | "pause" | "cancel", done: string) => {
    setBusy(name);
    setNotice(null);
    try {
      const current = action === "open" && editable ? await save() : collection;
      if (!current) return;
      const next = await api(`${base}/${action}`, { method: "POST", body: { version: current.version }, response: collectionSchema });
      setCollection(next);
      setNotice({ tone: "success", text: done });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    if (!collection.shareUrl) return;
    try {
      await navigator.clipboard.writeText(collection.shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className={styles.templateTitle}>
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        <span className={styles.rowMeta}>
          {collection.status === "DRAFT"
            ? "Participants can't see it yet"
            : collection.status === "PAUSED"
              ? "Participants see “This collection is paused” and can't submit."
              : collection.status === "OPEN"
                ? "Participants see only their own submission and only the fields you allowed."
                : null}
        </span>
      </div>
      {notice ? (
        <Notice tone={notice.tone} live>
          <p>{notice.text}</p>
        </Notice>
      ) : null}
      {collection.shareUrl ? (
        <section className={styles.detail} aria-labelledby="share-title">
          <h2 id="share-title" className={styles.detailTitle}>
            Share link
          </h2>
          <p className={styles.detailValue}>Send this to everyone taking part. It&apos;s a guest link: no account needed.</p>
          <div className={styles.shareRow}>
            <code className={styles.shareLink}>{collection.shareUrl.replace(/#.*/, "#••••••••")}</code>
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </section>
      ) : null}
      <div className={styles.orderLayout}>
        <div className={styles.templateSpec}>
          <section className={styles.detail} aria-labelledby="source-title">
            <h2 id="source-title" className={styles.detailTitle}>
              Starts from
            </h2>
            <div className={styles.detailRow}>
              <div className={styles.detailText}>
                <span className={styles.detailLabel}>{collection.source.kind === "TEMPLATE" ? "Template" : "Saved design"}</span>
                <span className={styles.detailValue}>{collection.source.label}</span>
              </div>
            </div>
          </section>
          <section className={styles.detail} aria-labelledby="fields-title">
            <h2 id="fields-title" className={styles.detailTitle}>
              What participants fill in
            </h2>
            <div className={styles.choices}>
              {collection.availableFields.map((item) => (
                <Checkbox
                  key={item.field}
                  id={`field-${item.field}`}
                  label={PARTICIPANT_FIELD_LABELS[item.field]}
                  hint={item.reason ?? undefined}
                  checked={fields.includes(item.field)}
                  disabled={!editable || !item.available}
                  onChange={(event) => setFields(event.target.checked ? [...fields, item.field] : fields.filter((field) => field !== item.field))}
                />
              ))}
              {errors.fields ? (
                <p className={styles.dialogText} role="alert">
                  {errors.fields}
                </p>
              ) : null}
            </div>
          </section>
        </div>
        <aside className={styles.detail} aria-labelledby="modes-title">
          <h2 id="modes-title" className={styles.detailTitle}>
            Deadline and modes
          </h2>
          <div className={styles.form}>
            <FormField id="collection-deadline" label="Deadline" error={errors.deadline}>
              <DatePicker withTime value={deadline} onValueChange={setDeadline} disabled={!editable} />
            </FormField>
            <div className={styles.detailText}>
              <span className={styles.detailLabel}>Who pays</span>
              <span className={styles.detailValue}>Your organization pays. Participants see no payment.</span>
            </div>
            <RadioCardGroup
              name="delivery-mode"
              legend="Delivery"
              value={deliveryMode}
              onChange={(value) => setDeliveryMode(value as typeof deliveryMode)}
              options={[
                { value: "CENTRAL", title: "Central", description: "Everything to one location", disabled: !editable },
                { value: "BRANCHES", title: "To approved branches", description: "Participants pick a branch", disabled: !editable },
              ]}
            />
            {deliveryMode === "CENTRAL" ? (
              <FormField id="central-location" label="Deliver to" error={errors.centralLocationId}>
                <Select value={centralLocationId} onValueChange={(next) => setCentralLocationId(next)} options={locations.map((location) => ({ value: location.id, label: location.name }))} disabled={!editable} />
              </FormField>
            ) : null}
            {deliveryMode === "BRANCHES" ? (
              <fieldset className={styles.choices}>
                <legend>Branches participants can pick</legend>
                {locations.map((location) => (
                  <Checkbox
                    key={location.id}
                    id={`branch-${location.id}`}
                    label={location.name}
                    checked={branches.includes(location.id)}
                    disabled={!editable}
                    onChange={(event) => setBranches(event.target.checked ? [...branches, location.id] : branches.filter((id) => id !== location.id))}
                  />
                ))}
                {errors.branchLocationIds ? (
                  <p className={styles.dialogText} role="alert">
                    {errors.branchLocationIds}
                  </p>
                ) : null}
              </fieldset>
            ) : null}
            {fields.includes("SIZE") ? (
              <FormField id="unsure-size" label="“Not sure of my size”">
                <Select
                  value={unsureSizeRule}
                  onValueChange={(next) => setUnsureSizeRule(next as typeof unsureSizeRule)}
                  disabled={!editable}
                  options={[
                    { value: "ALLOW_UNSURE", label: "Allowed — I'll settle their size" },
                    { value: "REQUIRE_SIZE", label: "A size is required" },
                  ]}
                />
              </FormField>
            ) : null}
            {collection.canManage ? (
              <div className={styles.form}>
                {collection.status === "DRAFT" || collection.status === "PAUSED" ? (
                  <Button loading={busy === "open"} onClick={() => void run("open", "open", "Open. Share the link with everyone taking part.")}>
                    {collection.status === "PAUSED" ? "Open again" : "Open collection"}
                  </Button>
                ) : null}
                {editable ? (
                  <Button
                    variant="secondary"
                    loading={busy === "save"}
                    onClick={async () => {
                      setBusy("save");
                      setNotice(null);
                      if (await save()) setNotice({ tone: "success", text: "Saved." });
                      setBusy(null);
                    }}
                  >
                    {collection.status === "DRAFT" ? "Save draft" : "Save changes"}
                  </Button>
                ) : null}
                {collection.status === "OPEN" ? (
                  <Button variant="secondary" loading={busy === "pause"} onClick={() => void run("pause", "pause", "Paused. Participants can't submit until you open it again.")}>
                    Pause
                  </Button>
                ) : null}
                {collection.status !== "CANCELLED" && collection.status !== "ORDER_DRAFT_CREATED" ? (
                  <Button variant="tertiary" loading={busy === "cancel"} onClick={() => void run("cancel", "cancel", "Cancelled. The link no longer works.")}>
                    Cancel collection
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
