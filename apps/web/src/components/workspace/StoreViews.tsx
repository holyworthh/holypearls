"use client";

import {
  ApiError,
  checkoutSchema,
  type CollectionSummary,
  displayMoney,
  IDEMPOTENCY_KEY_HEADER,
  type ParticipantAnswers,
  type Store,
  type Allowance,
  type StoreItem,
  type StoreOrderResult,
  storeOrderResultSchema,
  storeSchema,
  type TemplateSummary,
} from "@holypearls/contracts";
import { Button, Checkbox, FormField, Notice, Select, StatusChip, TextField } from "@holypearls/ui";
import { api, errorCode, errorReason, newIdempotencyKey } from "@holypearls/web-kit/api";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toMinor } from "./ApprovalViews";
import { STORE_STATUS } from "./labels";
import { initials } from "./WorkspaceShell";
import styles from "./workspace.module.css";

const REASONS: Record<string, string> = {
  STORE_NOT_OPEN: "This store isn't taking orders right now.",
  WRONG_MODE: "This store doesn't take that kind of order.",
  ITEM_UNAVAILABLE: "This item isn't available right now.",
  LOCATION_NOT_ALLOWED: "You can't order for that location.",
  TEMPLATE_BLOCKED: "This item is blocked while your company reviews its logo.",
  TEMPLATE_NOT_APPROVED: "This item isn't approved yet.",
  COLLECTION_CLOSED: "The team order has closed. If you still need one, ask your organiser.",
  COLLECTION_PAUSED: "The team order is paused. Try again later.",
  NO_ITEMS: "Add at least one approved template before opening the store.",
  COLLECTION_MISSING: "Choose the group collection for every item first.",
};

/** Plain words for a refusal: the field's message, the API's message, or a reason we know. */
function failureText(error: unknown) {
  if (errorCode(error) === "VERSION_CONFLICT") return "Someone else changed this store. Reload the page.";
  if (error instanceof ApiError && error.body.fieldErrors) return Object.values(error.body.fieldErrors)[0]!;
  return REASONS[errorReason(error) ?? ""] ?? (error instanceof ApiError && error.body.message ? error.body.message : "That didn't work. Try again.");
}

const money = (minor: bigint | string, currency: string) => displayMoney(minor.toString(), currency);

/** The store's identity (Pen 77 header, Pen 32 top): a private shop of approved products, not the public catalogue. */
function StoreHeader({ store }: { store: Store }) {
  return (
    <div className={styles.storeHeader}>
      <span className={styles.storeMark} aria-hidden="true">
        {initials(store.organizationName)}
      </span>
      <div className={styles.storeHeaderText}>
        <h1 className={styles.storeName}>{store.name}</h1>
        <span className={styles.rowMeta}>Private · for {store.organizationName} people</span>
      </div>
    </div>
  );
}

function ItemThumb({ item }: { item: StoreItem }) {
  return (
    <span className={styles.storeThumb} aria-hidden="true">
      {item.image ? <img src={item.image.thumbnailUrl} alt="" /> : initials(item.name)}
    </span>
  );
}

/** What the person sees when the store can't take their order, or the mode in plain words. */
function StoreNotes({ store }: { store: Store }) {
  return store.blocked ? (
    <Notice tone="warning">
      <p>{store.blocked}</p>
    </Notice>
  ) : (
    <p className={styles.storeMode}>{store.modeNote}</p>
  );
}

/** After an order is placed: checkout opens, an approval goes to its request, a quote or team order says so. */
async function followResult(result: StoreOrderResult, done: (result: StoreOrderResult) => void) {
  if (result.route === "APPROVAL") return window.location.assign(result.next);
  if (result.route === "CHECKOUT") {
    const started = await api("/v1/checkouts", { method: "POST", response: checkoutSchema, headers: { [IDEMPOTENCY_KEY_HEADER]: newIdempotencyKey() } }).catch(() => null);
    return window.location.assign(started ? `/checkout/${started.id}` : result.next);
  }
  done(result);
}

function Placed({ result }: { result: StoreOrderResult }) {
  return (
    <section className={styles.panel} aria-live="polite">
      <div className={styles.orderDone}>
        <h2 className={styles.panelTitle}>{result.route === "QUOTE" ? `Quote request ${result.reference} sent` : "Done"}</h2>
        <p className={styles.dialogText}>{result.message}</p>
        <a className={styles.rowLink} href={result.next}>
          {result.route === "COLLECTION" ? "See your answers" : "See your quotes"}
        </a>
      </div>
    </section>
  );
}

/**
 * Procurement (Pen 77 · sSl53): a buyer orders approved products for one of
 * their locations, with quantities only. The approval rule shows before
 * sending (Stage 3.1F part AM).
 */
function ProcurementStore({ organizationId, store }: { organizationId: string; store: Store }) {
  const [locationId, setLocationId] = useState(store.locations[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [placed, setPlaced] = useState<StoreOrderResult | null>(null);
  const [key] = useState(() => newIdempotencyKey());
  const location = store.locations.find((entry) => entry.id === locationId);
  const lines = store.items.flatMap((item) => {
    const quantity = Number(quantities[item.templateId] ?? "");
    return !item.unavailable && Number.isInteger(quantity) && quantity > 0 ? [{ item, quantity, amount: item.unitMinor ? BigInt(item.unitMinor) * BigInt(quantity) : null }] : [];
  });
  const priced = lines.every((line) => line.amount !== null);
  const total = priced ? lines.reduce((sum, line) => sum + line.amount!, 0n) : null;
  const currency = store.items[0]?.currency ?? "NGN";
  const { applies, thresholdMinor } = store.approval;
  const needsApproval = applies === "ALWAYS" || (applies === "ABOVE_AMOUNT" && thresholdMinor !== null && (total === null || total > BigInt(thresholdMinor)));

  const submit = async () => {
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await api(`/v1/organizations/${organizationId}/stores/${store.id}/orders`, {
        method: "POST",
        body: { locationId, lines: lines.map((line) => ({ templateId: line.item.templateId, quantity: line.quantity })) },
        headers: { [IDEMPOTENCY_KEY_HEADER]: key },
        response: storeOrderResultSchema,
      });
      await followResult(result, setPlaced);
    } catch (error) {
      setFailure(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  if (placed) return <Placed result={placed} />;
  return (
    <div className={styles.orderLayout}>
      <section className={styles.detail} aria-labelledby="store-products">
        <div className={styles.detailHead}>
          <h2 id="store-products" className={styles.detailTitle}>
            Approved products{location ? ` for ${location.name}` : ""}
          </h2>
          {store.locations.length > 1 ? (
            <FormField id="store-location" label="Ordering for">
              <Select value={locationId} onValueChange={(next) => setLocationId(next)} options={store.locations.map((entry) => ({ value: entry.id, label: entry.name }))} />
            </FormField>
          ) : null}
        </div>
        <p className={styles.dialogText}>{store.modeNote}</p>
        <ul className={styles.rows}>
          {store.items.map((item) => (
            <li key={item.templateId} className={styles.storeRow}>
              <ItemThumb item={item} />
              <div className={styles.rowText}>
                <span className={styles.rowTitle}>{item.name}</span>
                <span className={styles.rowMeta}>{item.locked || item.productName}</span>
                <span className={styles.rowMeta}>{item.unitMinor ? `${money(item.unitMinor, item.currency)} each` : "Priced by HolyPearls"}</span>
                {item.unavailable ? <span className={styles.rowMeta}>{item.unavailable}</span> : null}
              </div>
              {item.unavailable ? (
                <StatusChip tone="warning">TEMPORARILY UNAVAILABLE</StatusChip>
              ) : (
                <div className={styles.storeQuantity}>
                  <TextField
                    aria-label={`Quantity of ${item.name}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    placeholder="0"
                    value={quantities[item.templateId] ?? ""}
                    onChange={(event) => setQuantities({ ...quantities, [item.templateId]: event.target.value })}
                    disabled={Boolean(store.blocked)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <aside className={styles.detail} aria-labelledby="store-order">
        <h2 id="store-order" className={styles.detailTitle}>
          This order
        </h2>
        {store.blocked ? (
          <Notice tone="warning">
            <p>{store.blocked}</p>
          </Notice>
        ) : (
          <>
            {lines.length ? (
              <dl className={styles.storeLines}>
                {lines.map((line) => (
                  <div key={line.item.templateId}>
                    <dt>
                      {line.item.name} × {line.quantity.toLocaleString("en-NG")}
                    </dt>
                    <dd>{line.amount !== null ? money(line.amount, currency) : "To quote"}</dd>
                  </div>
                ))}
                <div className={styles.storeTotal}>
                  <dt>Estimated total</dt>
                  <dd>{total !== null ? money(total, currency) : "HolyPearls prices it"}</dd>
                </div>
              </dl>
            ) : (
              <p className={styles.rowMeta}>Enter a quantity for each item you need.</p>
            )}
            {lines.length && needsApproval ? (
              <Notice tone="warning">
                <p>
                  {applies === "ALWAYS"
                    ? `${store.organizationName} needs an approver for every order, so this goes to an approver before HolyPearls quotes it.`
                    : `Above ${store.organizationName}'s ${money(thresholdMinor!, currency)} limit, so this goes to an approver before HolyPearls quotes it.`}
                </p>
              </Notice>
            ) : null}
            {failure ? (
              <Notice tone="error" live>
                <p>{failure}</p>
              </Notice>
            ) : null}
            <Button loading={busy} disabled={!lines.length || !locationId} onClick={() => void submit()}>
              {needsApproval ? "Send for approval" : priced ? "Place order" : "Request a quote"}
            </Button>
            {location ? <p className={styles.rowMeta}>Delivery to {location.name}</p> : null}
          </>
        )}
      </aside>
    </div>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

/** The allowance, visible but quiet (Pen 32; Pen 78 B): what's left, of how much, and when it renews. */
function AllowanceCard({ allowance }: { allowance: Allowance }) {
  const amount = BigInt(allowance.amountMinor);
  const left = allowance.remainingMinor !== null ? BigInt(allowance.remainingMinor) : null;
  return (
    <div className={styles.allowance}>
      <span className={styles.allowanceAmount}>
        {left !== null ? `${money(left, allowance.currency)} of ${money(amount, allowance.currency)} left` : `Up to ${money(amount, allowance.currency)} per order`}
      </span>
      {left !== null ? (
        <span className={styles.allowanceBar} aria-hidden="true">
          <span style={{ width: `${Number((left * 100n) / amount)}%` }} />
        </span>
      ) : null}
      <span className={styles.rowMeta}>
        {allowance.name}
        {allowance.renewsAt ? ` · renews ${dayMonth(allowance.renewsAt)}` : ""}
      </span>
    </div>
  );
}

const EMPTY_ANSWERS: ParticipantAnswers = { size: null, sizeUnsure: false, personalization: null, quantity: null, colour: null, branchLocationId: null };

/**
 * Self-order (Pen 32 · qfJ9a, Pen 78 · m8W6b): each employee picks an
 * approved item with only their size, name and branch. What the company set
 * reads as facts, not greyed controls; an unavailable item stays visible with
 * its reason. The button says what happens; the routing never shows.
 */
function SelfOrderStore({ organizationId, store }: { organizationId: string; store: Store }) {
  const first = store.items.find((item) => !item.unavailable) ?? store.items[0];
  const [selected, setSelected] = useState(first?.templateId ?? null);
  const item = store.items.find((entry) => entry.templateId === selected) ?? null;
  const [answers, setAnswers] = useState<ParticipantAnswers>(() => ({ ...EMPTY_ANSWERS, branchLocationId: first?.branches.length === 1 ? first.branches[0]!.id : null }));
  // Pen 78 C: over the allowance (or no price yet), the pick asks a manager; nothing is silently blocked.
  const allowance = store.allowance;
  const limit = allowance ? BigInt(allowance.remainingMinor ?? allowance.amountMinor) : null;
  const cost = item?.pickTotalMinor ? BigInt(item.pickTotalMinor) : null;
  const overBy = allowance && limit !== null ? (cost === null ? null : cost > limit ? cost - limit : 0n) : 0n;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [placed, setPlaced] = useState<StoreOrderResult | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey());

  const choose = (next: StoreItem) => {
    setSelected(next.templateId);
    setFailure(undefined);
    setAnswers({ ...EMPTY_ANSWERS, branchLocationId: next.branches.length === 1 ? next.branches[0]!.id : null });
  };
  const submit = async () => {
    if (!item) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await api(`/v1/organizations/${organizationId}/stores/${store.id}/picks`, {
        method: "POST",
        body: { templateId: item.templateId, answers: { ...answers, personalization: answers.personalization?.trim() || null } },
        headers: { [IDEMPOTENCY_KEY_HEADER]: key },
        response: storeOrderResultSchema,
      });
      setKey(newIdempotencyKey());
      await followResult(result, setPlaced);
    } catch (error) {
      setFailure(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  if (placed) return <Placed result={placed} />;
  return (
    <div className={styles.orderLayout}>
      <section className={styles.detail} aria-labelledby="store-items">
        <h2 id="store-items" className={styles.detailTitle}>
          Approved for you · {store.items.length}
        </h2>
        {store.allowance ? <AllowanceCard allowance={store.allowance} /> : null}
        <ul className={styles.storeGrid}>
          {store.items.map((entry) => (
            <li key={entry.templateId}>
              <button type="button" className={styles.storeCard} aria-pressed={entry.templateId === selected} onClick={() => choose(entry)}>
                <ItemThumb item={entry} />
                <span className={styles.rowTitle}>{entry.name}</span>
                {entry.covered && !entry.unavailable ? (
                  <span className={styles.covered}>Covered</span>
                ) : (
                  <span className={styles.rowMeta}>{entry.unavailable ? "Temporarily unavailable" : entry.unitMinor ? money(entry.unitMinor, entry.currency) : entry.productName}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {item ? (
        <section className={styles.detail} aria-labelledby="store-item">
          <h2 id="store-item" className={styles.detailTitle}>
            {item.name}
          </h2>
          {item.locked ? (
            <div className={styles.setBy}>
              <ShieldCheck aria-hidden="true" />
              <div className={styles.detailText}>
                <span className={styles.setByLabel}>Set by {store.organizationName}</span>
                <span className={styles.detailValue}>{item.locked}</span>
              </div>
            </div>
          ) : null}
          {item.unavailable ? (
            <Notice tone="warning">
              <p>{item.unavailable}</p>
            </Notice>
          ) : (
            <div className={styles.form}>
              {item.fields.includes("SIZE") ? (
                <fieldset className={styles.choices}>
                  <legend>Your size</legend>
                  <div className={styles.sizeChoices} role="radiogroup" aria-label="Your size">
                    {item.sizes.map((size) => (
                      <button key={size} type="button" role="radio" aria-checked={answers.size === size} className={styles.sizeChoice} onClick={() => setAnswers({ ...answers, size, sizeUnsure: false })}>
                        {size}
                      </button>
                    ))}
                    {item.sizeUnsureAllowed ? (
                      <button type="button" role="radio" aria-checked={answers.sizeUnsure} className={styles.sizeChoice} onClick={() => setAnswers({ ...answers, size: null, sizeUnsure: true })}>
                        Not sure
                      </button>
                    ) : null}
                  </div>
                </fieldset>
              ) : null}
              {item.fields.includes("PERSONALIZATION") ? (
                <FormField id="store-name" label={`Name on ${item.productName.toLowerCase()} (optional)`} hint="Up to 12 letters, including spaces">
                  <TextField maxLength={12} autoComplete="off" value={answers.personalization ?? ""} onChange={(event) => setAnswers({ ...answers, personalization: event.target.value.toUpperCase() })} />
                </FormField>
              ) : null}
              {item.fields.includes("COLOUR") && item.colours.length ? (
                <FormField id="store-colour" label="Colour">
                  <Select value={answers.colour ?? ""} onValueChange={(next) => setAnswers({ ...answers, colour: next || null })} options={[{ value: "", label: "Choose a colour" }, ...item.colours]} />
                </FormField>
              ) : null}
              {item.fields.includes("QUANTITY") ? (
                <FormField id="store-quantity" label="How many" hint="Up to 50">
                  <TextField inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={answers.quantity ?? ""} onChange={(event) => setAnswers({ ...answers, quantity: Number(event.target.value) || null })} />
                </FormField>
              ) : null}
              {item.branches.length ? (
                <FormField id="store-branch" label="Your branch">
                  <Select
                    value={answers.branchLocationId ?? ""}
                    onValueChange={(next) => setAnswers({ ...answers, branchLocationId: next || null })}
                    options={[...(item.branches.length > 1 ? [{ value: "", label: "Choose your branch" }] : []), ...item.branches.map((branch) => ({ value: branch.id, label: branch.name }))]}
                  />
                </FormField>
              ) : null}
              {failure ? (
                <Notice tone="error" live>
                  <p>{failure}</p>
                </Notice>
              ) : null}
              {allowance && overBy !== 0n ? (
                <Notice tone="warning">
                  <p>
                    <strong>{overBy === null ? "This item has no price yet" : `This order is ${money(overBy, allowance.currency)} over your allowance`}</strong>
                  </p>
                  <p>
                    {overBy === null
                      ? `Your manager approves it before ${store.organizationName} pays.`
                      : `${allowance.remainingMinor !== null ? "Allowance left" : "Limit per order"} ${money(limit!, allowance.currency)} · this order ${money(cost!, allowance.currency)}.`}
                  </p>
                  <p>Paying the difference yourself isn&apos;t enabled by {store.organizationName}.</p>
                </Notice>
              ) : null}
              <div className={styles.storeAddBar}>
                <Button loading={busy} disabled={Boolean(store.blocked)} onClick={() => void submit()}>
                  {allowance && overBy !== 0n ? "Ask my manager to approve" : item.action}
                </Button>
                <p className={styles.rowMeta}>
                  {allowance && overBy === 0n && cost !== null && allowance.remainingMinor !== null
                    ? `Paid from your allowance. ${money(limit! - cost, allowance.currency)} will be left.`
                    : item.note}
                </p>
              </div>
            </div>
          )}
        </section>
      ) : (
        <p className={styles.emptyRow}>Nothing is approved for your location yet.</p>
      )}
    </div>
  );
}

export function StoreView({ organizationId, store }: { organizationId: string; store: Store }) {
  return (
    <>
      <StoreHeader store={store} />
      {store.mode === "SELF_ORDER" ? <StoreNotes store={store} /> : store.blocked ? <StoreNotes store={store} /> : null}
      {store.mode === "PROCUREMENT" ? <ProcurementStore organizationId={organizationId} store={store} /> : <SelfOrderStore organizationId={organizationId} store={store} />}
    </>
  );
}

/** Start a store: a name and a mode; the rest is set up next. */
export function NewStoreForm({ organizationId }: { organizationId: string }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Store["mode"]>("SELF_ORDER");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [key] = useState(() => newIdempotencyKey());
  const create = async () => {
    setBusy(true);
    setFailure(undefined);
    try {
      const created = await api(`/v1/organizations/${organizationId}/stores`, { method: "POST", body: { name, mode }, headers: { [IDEMPOTENCY_KEY_HEADER]: key }, response: storeSchema });
      window.location.assign(`/workspace/${organizationId}/stores/${created.id}/setup`);
    } catch (error) {
      setFailure(failureText(error));
      setBusy(false);
    }
  };
  return (
    <section className={styles.detail} aria-labelledby="new-store">
      <h2 id="new-store" className={styles.detailTitle}>
        New company store
      </h2>
      <div className={styles.form}>
        <FormField id="store-new-name" label="Store name" hint="For example ACME Team Store" error={failure}>
          <TextField value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField id="store-new-mode" label="Who orders">
          <Select
            value={mode}
            onValueChange={(next) => setMode(next as Store["mode"])}
            options={[
              { value: "SELF_ORDER", label: "Each employee orders for themselves" },
              { value: "PROCUREMENT", label: "Buyers order for their locations" },
            ]}
          />
        </FormField>
        <Button loading={busy} onClick={() => void create()}>
          Create store
        </Button>
      </div>
    </section>
  );
}

/**
 * Store setup for people who manage stores (B2B-FR-080–082): name, who
 * orders, where self-order picks go, and which approved templates it offers.
 * Not in the Pen; built from the workspace's form patterns.
 */
export function StoreSetup({ organizationId, initial, templates, collections }: { organizationId: string; initial: Store; templates: TemplateSummary[]; collections: CollectionSummary[] }) {
  const [store, setStore] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [mode, setMode] = useState(initial.mode);
  const [routing, setRouting] = useState(initial.setup?.routing ?? "INDIVIDUAL");
  const [items, setItems] = useState(() => new Map((initial.setup?.items ?? []).map((item) => [item.templateId, item.collectionId])));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const base = `/v1/organizations/${organizationId}/stores/${store.id}`;
  const status = STORE_STATUS[store.status];
  const toCollection = mode === "SELF_ORDER" && routing === "COLLECTION";
  const offered = templates.filter((template) => template.status === "APPROVED" || items.has(template.id));

  const call = async (label: string, run: () => Promise<Store>, done: string) => {
    setBusy(label);
    setNotice(null);
    try {
      const next = await run();
      setStore(next);
      setNotice({ tone: "success", text: done });
    } catch (error) {
      setNotice({ tone: "error", text: failureText(error) });
    } finally {
      setBusy(null);
    }
  };
  const save = () =>
    call(
      "save",
      () =>
        api(base, {
          method: "PUT",
          body: { name, mode, routing: mode === "PROCUREMENT" ? "INDIVIDUAL" : routing, items: [...items].map(([templateId, collectionId]) => ({ templateId, collectionId: toCollection ? collectionId : null })), version: store.version },
          response: storeSchema,
        }),
      "Saved.",
    );
  const saved = initial.setup?.allowance;
  const [kind, setKind] = useState(saved?.kind ?? "NONE");
  const [allowanceName, setAllowanceName] = useState(saved?.name ?? "Uniform allowance");
  const [amount, setAmount] = useState(saved?.amountMinor ? (Number(BigInt(saved.amountMinor) / 100n)).toString() : "");
  const [period, setPeriod] = useState(saved?.period ?? "YEAR");
  const [renewsMonth, setRenewsMonth] = useState(saved?.renewsOn?.slice(0, 2) ?? "01");
  const [renewsDay, setRenewsDay] = useState(saved?.renewsOn?.slice(3) ?? "01");
  const saveAllowance = () => {
    const amountMinor = kind === "NONE" ? null : toMinor(amount);
    if (kind !== "NONE" && !amountMinor) {
      setNotice({ tone: "error", text: "Enter the allowance amount in naira." });
      return;
    }
    void call(
      "allowance",
      () =>
        api(`${base}/allowance`, {
          method: "PUT",
          body: { kind, name: allowanceName, amountMinor, period: kind === "PER_PERIOD" ? period : null, renewsOn: kind === "PER_PERIOD" ? `${renewsMonth}-${renewsDay}` : null, version: store.version },
          response: storeSchema,
        }),
      "Allowance saved.",
    );
  };
  const act = (action: "activate" | "pause" | "archive", done: string) => call(action, () => api(`${base}/${action}`, { method: "POST", body: { version: store.version }, response: storeSchema }), done);
  const toggle = (templateId: string, on: boolean) => {
    const next = new Map(items);
    if (on) next.set(templateId, null);
    else next.delete(templateId);
    setItems(next);
  };

  return (
    <div className={styles.orderLayout}>
      <section className={styles.detail} aria-labelledby="store-setup">
        <div className={styles.detailHead}>
          <h2 id="store-setup" className={styles.detailTitle}>
            Store setup
          </h2>
          <StatusChip tone={status.tone}>{status.label}</StatusChip>
        </div>
        {notice ? (
          <Notice tone={notice.tone} live>
            <p>{notice.text}</p>
          </Notice>
        ) : null}
        <div className={styles.form}>
          <FormField id="store-name-field" label="Store name">
            <TextField value={name} onChange={(event) => setName(event.target.value)} disabled={store.status === "ARCHIVED"} />
          </FormField>
          <FormField id="store-mode" label="Who orders">
            <Select
              value={mode}
              onValueChange={(next) => setMode(next as Store["mode"])}
              options={[
                { value: "SELF_ORDER", label: "Each employee orders for themselves" },
                { value: "PROCUREMENT", label: "Buyers order for their locations" },
              ]}
            />
          </FormField>
          {mode === "SELF_ORDER" ? (
            <FormField id="store-routing" label="Where picks go" hint="Employees never see or choose this. Each pick becomes their own order, or joins the item's group collection.">
              <Select
                value={routing}
                onValueChange={(next) => setRouting(next as typeof routing)}
                options={[
                  { value: "INDIVIDUAL", label: "Individual orders" },
                  { value: "COLLECTION", label: "Into a group collection" },
                ]}
              />
            </FormField>
          ) : null}
          <fieldset className={styles.choices}>
            <legend>Approved templates in this store</legend>
            {offered.length ? (
              offered.map((template) => (
                <div key={template.id} className={styles.storeSetupItem}>
                  <Checkbox id={`store-item-${template.id}`} label={`${template.name} · ${template.productName}`} checked={items.has(template.id)} onChange={(event) => toggle(template.id, event.target.checked)} />
                  {toCollection && items.has(template.id) ? (
                    <Select
                      aria-label={`Group collection for ${template.name}`}
                      value={items.get(template.id) ?? ""}
                      onValueChange={(next) => setItems(new Map(items).set(template.id, next || null))}
                      options={[
                        { value: "", label: "Choose its group collection" },
                        ...collections.filter((collection) => collection.templateId === template.id && collection.status !== "CANCELLED").map((collection) => ({ value: collection.id, label: collection.title })),
                      ]}
                    />
                  ) : null}
                </div>
              ))
            ) : (
              <p className={styles.rowMeta}>No approved templates yet. Templates need HolyPearls approval before they can go in a store.</p>
            )}
          </fieldset>
          {store.status !== "ARCHIVED" ? (
            <Button loading={busy === "save"} onClick={() => void save()}>
              Save store
            </Button>
          ) : null}
        </div>
        {store.mode === "SELF_ORDER" && store.setup?.routing === "INDIVIDUAL" ? (
          <div className={styles.form}>
            <h3 className={styles.detailTitle}>Allowance</h3>
            <p className={styles.dialogText}>Within the allowance, {store.organizationName} pays. Going over it asks a manager to approve; employees can&apos;t pay the difference.</p>
            <FormField id="allowance-kind" label="Limit">
              <Select
                value={kind}
                onValueChange={(next) => setKind(next as typeof kind)}
                options={[
                  { value: "NONE", label: "No limit" },
                  { value: "PER_ORDER", label: "A limit per order" },
                  { value: "PER_PERIOD", label: "An amount per period" },
                ]}
              />
            </FormField>
            {kind !== "NONE" ? (
              <>
                <FormField id="allowance-name" label="Name">
                  <TextField value={allowanceName} onChange={(event) => setAllowanceName(event.target.value)} />
                </FormField>
                <FormField id="allowance-amount" label="Amount (₦)" hint={kind === "PER_ORDER" ? "The most one order can cost" : "What each person can spend each period"}>
                  <TextField inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </FormField>
              </>
            ) : null}
            {kind === "PER_PERIOD" ? (
              <>
                <FormField id="allowance-period" label="Renews">
                  <Select
                    value={period}
                    onValueChange={(next) => setPeriod(next as typeof period)}
                    options={[
                      { value: "YEAR", label: "Every year" },
                      { value: "QUARTER", label: "Every quarter" },
                      { value: "MONTH", label: "Every month" },
                    ]}
                  />
                </FormField>
                <div className={styles.renewsOn}>
                  <FormField id="allowance-month" label="From month">
                    <Select value={renewsMonth} onValueChange={(next) => setRenewsMonth(next)} options={MONTHS.map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label }))} />
                  </FormField>
                  <FormField id="allowance-day" label="Day">
                    <Select value={renewsDay} onValueChange={(next) => setRenewsDay(next)} options={Array.from({ length: 28 }, (_, index) => ({ value: String(index + 1).padStart(2, "0"), label: String(index + 1) }))} />
                  </FormField>
                </div>
              </>
            ) : null}
            {store.status !== "ARCHIVED" ? (
              <Button variant="secondary" loading={busy === "allowance"} onClick={saveAllowance}>
                Save allowance
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
      <aside className={styles.detail} aria-labelledby="store-status">
        <h2 id="store-status" className={styles.detailTitle}>
          Status
        </h2>
        <p className={styles.dialogText}>
          {store.status === "ACTIVE"
            ? "Open: members can order from it."
            : store.status === "PAUSED"
              ? "Paused: members see it but can't order."
              : store.status === "DRAFT"
                ? "Draft: only people who manage stores can see it."
                : "Archived: members no longer see it."}
        </p>
        {store.status === "DRAFT" || store.status === "PAUSED" ? (
          <Button loading={busy === "activate"} onClick={() => void act("activate", "The store is open.")}>
            Open the store
          </Button>
        ) : null}
        {store.status === "ACTIVE" ? (
          <Button variant="secondary" loading={busy === "pause"} onClick={() => void act("pause", "The store is paused.")}>
            Pause
          </Button>
        ) : null}
        {store.status !== "ARCHIVED" ? (
          <Button variant="tertiary" loading={busy === "archive"} onClick={() => void act("archive", "The store is archived.")}>
            Archive
          </Button>
        ) : null}
        {store.status !== "DRAFT" && store.status !== "ARCHIVED" ? (
          <a className={styles.rowLink} href={`/workspace/${organizationId}/stores/${store.id}`}>
            View the store
          </a>
        ) : null}
      </aside>
    </div>
  );
}
