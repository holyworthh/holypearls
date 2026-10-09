"use client";

import {
  ApiError,
  type BrandAssetSummary,
  checkoutSchema,
  displayMoney,
  type FieldControl,
  IDEMPOTENCY_KEY_HEADER,
  type MyOrganization,
  type PriceResult,
  priceResultSchema,
  type Template,
  type TemplateOrderForm as TemplateOrderFormData,
  templateOrderResultSchema,
  templateSchema,
  type TemplateSourceList,
} from "@holypearls/contracts";
import { Button, Checkbox, Dialog, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { Lock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
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

const ORDER_MESSAGES: Record<string, string> = {
  LOCKED_FIELD: "That's set by your company and can't be changed on this order.",
  TEMPLATE_BLOCKED: "Blocked — asset review required. Ask your workspace Admin to update the template.",
  TEMPLATE_NOT_APPROVED: "This template isn't approved by HolyPearls yet.",
  LOCATION_NOT_ALLOWED: "Choose one of your allowed locations.",
};

/**
 * Order from a template (Pen 131 · ARNyh): the company's locked settings, the
 * buyer's choices, and today's price. A direct price goes to checkout;
 * anything else becomes a quote request (B2B-FR-033).
 */
export function TemplateOrderForm({ organizationId, form }: { organizationId: string; form: TemplateOrderFormData }) {
  const { template } = form;
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(form.choices.flatMap((choice) => (choice.value ? [[choice.key, choice.value]] : []))));
  const [quantity, setQuantity] = useState(String(form.quantity.value ?? ""));
  const [locationId, setLocationId] = useState(form.locations[0]?.id ?? "");
  const [price, setPrice] = useState<PriceResult | null>(null);
  const [pricing, setPricing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [quoted, setQuoted] = useState<string | null>(null);
  const [key] = useState(() => newIdempotencyKey());
  const base = `/v1/organizations/${organizationId}/templates/${template.id}`;
  const count = Number(quantity);
  const validQuantity = Number.isInteger(count) && count > 0;
  // Only the buyer's changes are sent; unchanged choices stay as the template has them.
  const changes = Object.fromEntries(Object.entries(choices).filter(([option, value]) => form.choices.find((choice) => choice.key === option)?.value !== value));
  const changesKey = JSON.stringify(changes);

  useEffect(() => {
    if (form.blocked || !validQuantity) {
      setPrice(null);
      return;
    }
    let live = true;
    setPricing(true);
    const timer = setTimeout(() => {
      api(`${base}/price`, { method: "POST", body: { choices: JSON.parse(changesKey) as Record<string, string>, quantity: count }, response: priceResultSchema })
        .then((result) => live && setPrice(result))
        .catch(() => live && setPrice(null))
        .finally(() => live && setPricing(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [base, changesKey, count, form.blocked, validQuantity]);

  const direct = price?.state === "PRICE_READY" && price.valid;
  const submit = async () => {
    if (!validQuantity) {
      setFailure("Enter a quantity.");
      return;
    }
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await api(`${base}/orders`, {
        method: "POST",
        body: { choices: changes, quantity: count, locationId, templateVersion: template.version },
        headers: { [IDEMPOTENCY_KEY_HEADER]: key },
        response: templateOrderResultSchema,
      });
      if (result.route === "QUOTE") {
        setQuoted(result.reference);
        setBusy(false);
        return;
      }
      const started = await api("/v1/checkouts", { method: "POST", response: checkoutSchema, headers: { [IDEMPOTENCY_KEY_HEADER]: newIdempotencyKey() } }).catch(() => null);
      window.location.assign(started ? `/checkout/${started.id}` : result.next);
    } catch (error) {
      setBusy(false);
      setFailure(errorCode(error) === "VERSION_CONFLICT" ? "This template changed. Reload the page to see the current version." : (ORDER_MESSAGES[errorReason(error) ?? ""] ?? "We couldn't place this order. Try again."));
    }
  };

  const locked = template.fields.filter((field) => field.control === "LOCKED");
  if (quoted) {
    return (
      <section className={styles.panel} aria-live="polite">
        <div className={styles.orderDone}>
          <h2 className={styles.panelTitle}>Quote request {quoted} sent</h2>
          <p className={styles.dialogText}>This order needs a person to price it. We&apos;ll email you the quote; it&apos;s for {form.locations.find((location) => location.id === locationId)?.name}.</p>
          <a className={styles.rowLink} href="/account">
            See your quotes
          </a>
        </div>
      </section>
    );
  }
  return (
    <div className={styles.orderLayout}>
      <div className={styles.templateSpec}>
        <section className={styles.detail} aria-labelledby="order-locked">
          <h2 id="order-locked" className={styles.detailTitle}>
            Set by your company (locked)
          </h2>
          {locked.map((field) => (
            <div key={field.key} className={styles.detailRow}>
              <Lock aria-label="Locked" />
              <div className={styles.detailText}>
                <span className={styles.detailLabel}>{field.label}</span>
                <span className={styles.detailValue}>{field.value}</span>
              </div>
            </div>
          ))}
          <p className={styles.dialogText}>Brand settings can&apos;t be changed here.</p>
        </section>
        <section className={styles.detail} aria-labelledby="order-choices">
          <h2 id="order-choices" className={styles.detailTitle}>
            Your choices
          </h2>
          <div className={styles.form}>
            {form.choices.map((choice) => (
              <FormField key={choice.key} id={`order-${choice.key}`} label={choice.label} hint={choice.reason}>
                <Select value={choices[choice.key] ?? ""} onChange={(event) => setChoices({ ...choices, [choice.key]: event.target.value })} options={choice.options} disabled={Boolean(form.blocked)} />
              </FormField>
            ))}
            <FormField id="order-quantity" label="Quantity" hint={form.quantity.editable ? form.quantity.reason : `${form.quantity.reason} · set by your company`} error={quantity && !validQuantity ? "Enter a whole number" : undefined}>
              <TextField type="number" inputMode="numeric" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={!form.quantity.editable || Boolean(form.blocked)} />
            </FormField>
            <FormField id="order-location" label="Deliver to" hint="Only your allowed locations are listed.">
              <Select value={locationId} onChange={(event) => setLocationId(event.target.value)} options={form.locations.map((location) => ({ value: location.id, label: location.name }))} disabled={Boolean(form.blocked) || !form.locations.length} />
            </FormField>
          </div>
        </section>
      </div>
      <aside className={styles.detail} aria-labelledby="order-price">
        <h2 id="order-price" className={styles.detailTitle}>
          Price
        </h2>
        {form.blocked ? (
          <Notice tone="warning">
            <p>{form.blocked}</p>
          </Notice>
        ) : (
          <>
            {price ? <StatusChip tone={direct ? "success" : "warning"}>{direct ? "PRICE READY" : "QUOTE REQUIRED"}</StatusChip> : null}
            <p className={styles.orderTotal} aria-busy={pricing}>
              {direct && price?.totalMinor && price.currency ? displayMoney(price.totalMinor, price.currency) : price ? `${count.toLocaleString("en-NG")} needs a person to price it.` : validQuantity ? "Checking the price…" : "Enter a quantity to see the price."}
            </p>
            {direct && price?.vatRateBps != null ? <p className={styles.rowMeta}>Incl. VAT {price.vatRateBps / 100}% · delivery at checkout</p> : null}
            {price?.reasons.find((reason) => reason.blocking) ? <p className={styles.rowMeta}>{price.reasons.find((reason) => reason.blocking)!.message}</p> : null}
            {failure ? (
              <Notice tone="error" live>
                <p>{failure}</p>
              </Notice>
            ) : null}
            <Button loading={busy} disabled={!price || !locationId || Boolean(price.reasons.find((reason) => reason.blocking))} onClick={() => void submit()}>
              {direct ? "Go to checkout" : "Request a quote"}
            </Button>
          </>
        )}
        <p className={styles.dialogText}>A saved copy of this template&apos;s settings goes with your order.</p>
        <p className={styles.dialogText}>Template orders use today&apos;s template and prices. To repeat a past order exactly, use Reorder on that order.</p>
      </aside>
    </div>
  );
}
