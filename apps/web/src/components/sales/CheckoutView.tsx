"use client";

import {
  ApiError,
  type Checkout,
  checkoutAddressSchema,
  checkoutContactSchema,
  checkoutSchema,
  NIGERIA_LGAS,
  NIGERIA_STATES,
} from "@holypearls/contracts";
import { Button, Checkbox, ErrorSummary, FormField, Notice, Select, TextField } from "@holypearls/ui";
import { Check, ChevronDown, CreditCard, Landmark, Lock, ShoppingBag, Smartphone, User, Wallet } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { api, newIdempotencyKey } from "../../lib/api";
import { openPaystack, startCheckoutPayment } from "../../lib/paystack";
import { countryOptions } from "../../lib/countries";
import { naira, percent } from "../../lib/money";
import styles from "./checkout.module.css";

type Step = Checkout["step"];
const STEPS: { key: Step; title: string; short: string }[] = [
  { key: "contact", title: "Contact", short: "Contact" },
  { key: "address", title: "Delivery address", short: "Delivery" },
  { key: "delivery", title: "Shipping", short: "Shipping" },
  { key: "billing", title: "Billing and VAT", short: "Billing" },
  { key: "review", title: "Review and pay", short: "Review" },
];
const index = (step: Step) => STEPS.findIndex((item) => item.key === step);

type Errors = Record<string, string>;

/** Zod issues → { field: message }, first message per field. */
function issues(error: z.ZodError): Errors {
  const out: Errors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Checkout (Pen 43/44; COM-FR-083–084). Guest first. Each step saves on the
 * server, which recalculates the total; the summary always shows the server's
 * numbers. The last step starts the payment on Paystack (T04-03).
 */
export function CheckoutView({ initial, signedIn }: { initial: Checkout; signedIn: boolean }) {
  const [checkout, setCheckout] = useState(initial);
  const [editing, setEditing] = useState<Step>(initial.step);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const active = index(editing);
  const reached = index(checkout.step);

  const saved = (next: Checkout) => {
    setCheckout(next);
    setEditing(next.step);
  };

  const total = checkout.totals.deliveryMinor === null && !awaitingPrice(checkout) ? `${naira(checkout.totals.totalMinor)} + delivery` : naira(checkout.totals.totalMinor);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.logo} href="/" aria-label="HolyPearls home">
          <span className={styles.pearl} aria-hidden="true" />
          HolyPearls
        </a>
        <div className={styles.headerRight}>
          <span className={styles.secure}>
            <Lock size={14} strokeWidth={2} aria-hidden="true" />
            Secure checkout
          </span>
          <a className={styles.help} href="/contact?topic=order">
            Help
          </a>
        </div>
      </header>

      {/* Phone: the total stays visible; the summary opens on demand (Pen 44). */}
      <div className={styles.mobileSummary}>
        <button type="button" className={styles.summaryToggle} aria-expanded={summaryOpen} aria-controls="order-summary" onClick={() => setSummaryOpen(!summaryOpen)}>
          <ShoppingBag size={16} strokeWidth={2} aria-hidden="true" />
          {summaryOpen ? "Hide order summary" : "Show order summary"}
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={summaryOpen ? styles.flip : undefined} />
        </button>
        <span className={styles.mobileTotal}>{naira(checkout.totals.totalMinor)}</span>
      </div>
      <div className={styles.progress}>
        <p>
          Step {active + 1} of {STEPS.length} · {STEPS[active]!.short}
        </p>
        <div className={styles.bar} aria-hidden="true">
          {STEPS.map((step, position) => (
            <span key={step.key} className={position <= active ? styles.segOn : styles.seg} />
          ))}
        </div>
      </div>

      <main id="main" className={styles.split}>
        <div className={styles.steps}>
          {signedIn ? null : (
            <div className={styles.guest}>
              <User size={18} strokeWidth={2} aria-hidden="true" />
              <p>You&apos;re checking out as a guest. No account needed.</p>
              <a href={`/sign-in?next=${encodeURIComponent(`/checkout/${checkout.id}`)}`}>Sign in (optional)</a>
            </div>
          )}
          {checkout.status !== "OPEN" ? (
            <Notice tone="warning" title="This checkout is closed">
              <p>
                Your cart changed since it started. <a href="/cart">Go back to your cart</a> to check out again.
              </p>
            </Notice>
          ) : null}

          {STEPS.map((step, position) => {
            if (position === active && checkout.status === "OPEN") {
              return (
                <section key={step.key} className={styles.stepActive} aria-labelledby={`step-${step.key}`}>
                  <div className={styles.stepHead}>
                    <span className={styles.numActive} aria-hidden="true">
                      {position + 1}
                    </span>
                    <h2 id={`step-${step.key}`}>{step.title}</h2>
                  </div>
                  {step.key === "contact" ? <ContactStep checkout={checkout} onSaved={saved} /> : null}
                  {step.key === "address" ? <AddressStep checkout={checkout} onSaved={saved} /> : null}
                  {step.key === "delivery" ? <DeliveryStep checkout={checkout} onSaved={saved} /> : null}
                  {step.key === "billing" ? <BillingStep checkout={checkout} onSaved={saved} /> : null}
                  {step.key === "review" ? <ReviewStep checkout={checkout} /> : null}
                </section>
              );
            }
            const done = position < reached;
            return (
              <section key={step.key} className={styles.stepCollapsed} aria-labelledby={`step-${step.key}`}>
                <span className={done ? styles.numDone : styles.numTodo} aria-hidden="true">
                  {done ? <Check size={16} strokeWidth={2.5} /> : position + 1}
                </span>
                <div className={styles.stepText}>
                  <h2 id={`step-${step.key}`} className={done ? undefined : styles.todoTitle}>
                    {step.title}
                    {done ? <span className="hp-visually-hidden"> (done)</span> : null}
                  </h2>
                  {done ? <p>{doneSummary(step.key, checkout)}</p> : null}
                </div>
                {done && checkout.status === "OPEN" && step.key !== "review" ? (
                  <button type="button" className={styles.edit} onClick={() => setEditing(step.key)} aria-label={`Edit ${step.title.toLowerCase()}`}>
                    Edit
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>

        <aside id="order-summary" className={`${styles.summary} ${summaryOpen ? styles.summaryOpen : ""}`} aria-labelledby="summary-title">
          <h2 id="summary-title" className={styles.summaryTitle}>
            Order summary
          </h2>
          <ul className={styles.items}>
            {checkout.items.map((item) => (
              <li key={item.productName + item.summary} className={styles.item}>
                <span className={styles.thumb} aria-hidden="true" />
                <div className={styles.itemText}>
                  <p className={styles.itemName}>{item.productName}</p>
                  <p className={styles.itemMeta}>
                    {item.quantity.toLocaleString("en-NG")} · {item.summary}
                  </p>
                  {item.cartTotalMinor ? <p className={styles.changed}>Price updated since you added it (was {naira(item.cartTotalMinor)})</p> : null}
                </div>
                <p className={styles.itemPrice}>{naira(item.totalMinor)}</p>
              </li>
            ))}
          </ul>
          <dl className={styles.sums}>
            <div className={styles.sum}>
              <dt>Subtotal</dt>
              <dd>{naira(checkout.totals.goodsMinor)}</dd>
            </div>
            <div className={styles.sum}>
              <dt>Delivery</dt>
              <dd className={checkout.totals.deliveryMinor === null ? styles.muted : undefined}>
                {checkout.totals.deliveryMinor !== null ? naira(checkout.totals.deliveryMinor) : awaitingPrice(checkout) ? "Priced by our team" : checkout.delivery ? "Set at shipping" : "Set after address"}
              </dd>
            </div>
            <div className={styles.sum}>
              <dt>VAT {percent(checkout.totals.vatRateBps)}</dt>
              <dd>{naira(checkout.totals.vatMinor)}</dd>
            </div>
            <div className={`${styles.sum} ${styles.total}`}>
              <dt>Total</dt>
              <dd>{total}</dd>
            </div>
          </dl>
          {checkout.quoteItemsLeftInCart ? <p className={styles.note}>Quote items stay in your cart and aren&apos;t part of this payment.</p> : null}
          {checkout.payment.channels.length ? (
            <div className={styles.methods}>
              <p className={styles.methodsTitle}>We accept</p>
              {/* Only the methods switched on for the Paystack account (PAY-FR-007). */}
              <ul>
                {checkout.payment.channels.map((channel) => {
                  const Icon = CHANNEL_ICONS[channel];
                  return (
                    <li key={channel}>
                      <Icon size={14} strokeWidth={2} aria-hidden="true" />
                      {CHANNEL_LABELS[channel]}
                    </li>
                  );
                })}
              </ul>
              {checkout.payment.internationalCards ? <p className={styles.note}>Visa, Mastercard, Verve and American Express cards from abroad are accepted in naira.</p> : null}
            </div>
          ) : null}
        </aside>
      </main>
    </div>
  );
}

const CHANNEL_LABELS = { card: "Card", bank_transfer: "Bank transfer", ussd: "USSD", apple_pay: "Apple Pay" } as const;
const CHANNEL_ICONS = { card: CreditCard, bank_transfer: Landmark, ussd: Smartphone, apple_pay: Wallet } as const;

function doneSummary(step: Step, checkout: Checkout) {
  const address = checkout.address;
  switch (step) {
    case "contact":
      return checkout.contact ? `${checkout.contact.name} · ${checkout.contact.email} · ${checkout.contact.phone}` : "";
    case "address":
      return address ? [address.street, address.area, address.state, address.country === "NG" ? null : address.country].filter(Boolean).join(", ") : "";
    case "delivery": {
      const delivery = checkout.delivery;
      if (!delivery) return "";
      const days = delivery.transitDays ? ` · ${delivery.transitDays.min}–${delivery.transitDays.max} working days in transit` : "";
      if (delivery.rateMinor === null) return `${delivery.zoneName} · delivery priced by our team${days}`;
      return `${delivery.zoneName} · ${naira(delivery.rateMinor)} before VAT${delivery.pricing === "QUOTE" ? ", set by our team" : ""}${days}`;
    }
    case "billing": {
      const billing = checkout.billing;
      if (!billing) return "";
      return [billing.companyName, billing.taxId ? `TIN ${billing.taxId}` : null, billing.sameAsDelivery ? "Billing address same as delivery" : billing.address].filter(Boolean).join(" · ");
    }
    default:
      return "";
  }
}

/** Saves one step; returns field errors from the server. */
async function put(checkout: Checkout, path: string, body: object): Promise<{ next?: Checkout; errors?: Errors }> {
  try {
    return { next: await api(`/v1/checkouts/${checkout.id}/${path}`, { method: "PUT", body: { ...body, version: checkout.version }, response: checkoutSchema }) };
  } catch (error) {
    if (error instanceof ApiError && error.body.fieldErrors) return { errors: error.body.fieldErrors };
    return { errors: { form: error instanceof ApiError ? error.body.message : "We couldn't save that. Check your connection and try again." } };
  }
}

const LABELS: Record<string, string> = {
  name: "full name",
  email: "email",
  phone: "phone",
  street: "street address",
  area: "area or LGA",
  state: "state",
  country: "country",
  address: "billing address",
};

function Summary({ errors, prefix }: { errors: Errors; prefix: string }) {
  const list = Object.entries(errors)
    .filter(([key]) => key !== "form")
    .map(([key, message]) => ({ fieldId: `${prefix}-${key}`, message: key === "phone" && message.startsWith("Enter all") ? "Phone number is too short" : message || `Check the ${LABELS[key] ?? key}` }));
  return (
    <>
      <ErrorSummary errors={list} title={`Fix ${list.length === 1 ? "1 thing" : `${list.length} things`} to continue`} />
      {errors.form ? (
        <Notice tone="error" title="Not saved" live>
          <p>{errors.form}</p>
        </Notice>
      ) : null}
    </>
  );
}

function ContactStep({ checkout, onSaved }: { checkout: Checkout; onSaved: (next: Checkout) => void }) {
  const [form, setForm] = useState({ name: checkout.contact?.name ?? "", email: checkout.contact?.email ?? "", phone: checkout.contact?.phone ?? "" });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = checkoutContactSchema.safeParse(form);
    if (!parsed.success) return setErrors(issues(parsed.error));
    setSaving(true);
    const result = await put(checkout, "contact", parsed.data);
    setSaving(false);
    if (result.next) onSaved(result.next);
    else setErrors(result.errors ?? {});
  };
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <Summary errors={errors} prefix="contact" />
      <FormField label="Full name" id="contact-name" error={errors.name}>
        <TextField autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </FormField>
      <div className={styles.row}>
        <FormField label="Email" id="contact-email" error={errors.email}>
          <TextField type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </FormField>
        <FormField label="Phone" id="contact-phone" error={errors.phone}>
          <TextField type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </FormField>
      </div>
      <p className={styles.lead}>We send your receipt and order updates to this email.</p>
      <Button type="submit" loading={saving} className={styles.continue}>
        Continue to delivery address
      </Button>
    </form>
  );
}

function AddressStep({ checkout, onSaved }: { checkout: Checkout; onSaved: (next: Checkout) => void }) {
  const previous = checkout.address;
  const [form, setForm] = useState({
    country: previous?.country ?? "NG",
    name: previous?.name ?? checkout.contact?.name ?? "",
    phone: previous?.phone ?? checkout.contact?.phone ?? "",
    street: previous?.street ?? "",
    area: previous?.area ?? "",
    state: previous?.state ?? "",
    landmark: previous?.landmark ?? "",
    postcode: previous?.postcode ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const countries = useMemo(() => countryOptions(), []);
  const nigeria = form.country === "NG";
  const lgas = nigeria ? NIGERIA_LGAS[form.state as (typeof NIGERIA_STATES)[number]] : undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = { ...form, landmark: form.landmark || undefined, postcode: form.postcode || undefined };
    const parsed = checkoutAddressSchema.safeParse(body);
    if (!parsed.success) return setErrors(issues(parsed.error));
    setSaving(true);
    const result = await put(checkout, "address", parsed.data);
    setSaving(false);
    if (result.next) onSaved(result.next);
    else setErrors(result.errors ?? {});
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <Summary errors={errors} prefix="address" />
      <FormField label="Country" id="address-country" error={errors.country}>
        <Select options={countries} value={form.country} autoComplete="country" onChange={(event) => setForm({ ...form, country: event.target.value, state: "", area: "" })} />
      </FormField>
      <div className={styles.row}>
        <FormField label="Full name" id="address-name" error={errors.name}>
          <TextField autoComplete="shipping name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </FormField>
        <FormField label="Phone" id="address-phone" hint={nigeria ? "For the delivery rider, e.g. 0800 000 0000" : "Include the country code"} error={errors.phone}>
          <TextField type="tel" inputMode="tel" autoComplete="shipping tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </FormField>
      </div>
      <FormField label="Street address" id="address-street" error={errors.street}>
        <TextField autoComplete="shipping street-address" value={form.street} onChange={(event) => setForm({ ...form, street: event.target.value })} />
      </FormField>
      <div className={styles.row}>
        {nigeria ? (
          <FormField label="State" id="address-state" error={errors.state}>
            <Select
              placeholder="Choose your state"
              options={NIGERIA_STATES.map((state) => ({ value: state, label: state === "FCT" ? "FCT (Abuja)" : state }))}
              value={form.state}
              autoComplete="shipping address-level1"
              onChange={(event) => setForm({ ...form, state: event.target.value, area: "" })}
            />
          </FormField>
        ) : (
          <FormField label="State, province or region" id="address-state" error={errors.state}>
            <TextField autoComplete="shipping address-level1" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
          </FormField>
        )}
        {lgas ? (
          <FormField label="Area / LGA" id="address-area" error={errors.area}>
            <Select placeholder="Choose your area or LGA" options={lgas.map((lga) => ({ value: lga, label: lga }))} value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} />
          </FormField>
        ) : (
          <FormField label={nigeria ? "Area / LGA" : "City"} id="address-area" error={errors.area}>
            <TextField autoComplete="shipping address-level2" value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} />
          </FormField>
        )}
      </div>
      {nigeria ? null : (
        <FormField label="Postcode" id="address-postcode" optional error={errors.postcode}>
          <TextField autoComplete="shipping postal-code" value={form.postcode} onChange={(event) => setForm({ ...form, postcode: event.target.value })} />
        </FormField>
      )}
      <FormField label="Landmark or directions" id="address-landmark" optional error={errors.landmark}>
        <TextField placeholder="e.g. opposite the filling station" value={form.landmark} onChange={(event) => setForm({ ...form, landmark: event.target.value })} />
      </FormField>
      {nigeria ? null : (
        <Notice tone="info" title="Customs and duties">
          <p>International freight is quoted by our team. Customs duties and import taxes in your country aren&apos;t included and are paid on arrival.</p>
        </Notice>
      )}
      <Button type="submit" loading={saving} className={styles.continue}>
        Continue to shipping
      </Button>
    </form>
  );
}

/** Delivery to an address outside the zones waits for our team's price (owner, 2026-10-05). */
const awaitingPrice = (checkout: Checkout) => checkout.delivery?.pricing === "QUOTE" && checkout.delivery.rateMinor === null;

function DeliveryStep({ checkout, onSaved }: { checkout: Checkout; onSaved: (next: Checkout) => void }) {
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const delivery = checkout.delivery!;
  const quote = delivery.pricing === "QUOTE" && delivery.rateMinor === null;
  const submit = async () => {
    setSaving(true);
    const result = await put(checkout, "delivery", { option: "STANDARD" });
    setSaving(false);
    if (result.next) onSaved(result.next);
    else setErrors(result.errors ?? {});
  };
  return (
    <div className={styles.form}>
      <Summary errors={errors} prefix="delivery" />
      <div className={styles.option} role="group" aria-label="Delivery option">
        <span className={styles.radio} aria-hidden="true" />
        <div>
          <p className={styles.optionTitle}>{quote ? (checkout.international ? "International freight" : "Delivery by quote") : `Standard delivery · ${delivery.zoneName}`}</p>
          <p className={styles.optionMeta}>
            {quote
              ? checkout.international
                ? "Our team quotes freight to your address before you pay. Customs duties are paid on arrival."
                : `Delivery to this address is priced by our team (${delivery.zoneName}). We'll email you the price, then you can pay here.`
              : delivery.transitDays
                ? `${delivery.transitDays.min}–${delivery.transitDays.max} working days in transit, after production`
                : "Transit time confirmed when it ships"}
          </p>
        </div>
        <p className={styles.optionPrice}>{quote ? "Quoted" : naira(delivery.rateMinor)}</p>
      </div>
      {checkout.productionDays ? (
        <p className={styles.timing}>
          Production takes {checkout.productionDays.min}–{checkout.productionDays.max} working days after you approve your proof. Delivery time is on top of that.
        </p>
      ) : null}
      <Button className={styles.continue} loading={saving} onClick={() => void submit()}>
        Continue to billing
      </Button>
    </div>
  );
}

function BillingStep({ checkout, onSaved }: { checkout: Checkout; onSaved: (next: Checkout) => void }) {
  const [form, setForm] = useState({
    sameAsDelivery: checkout.billing?.sameAsDelivery ?? true,
    companyName: checkout.billing?.companyName ?? "",
    taxId: checkout.billing?.taxId ?? "",
    address: checkout.billing?.address ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.sameAsDelivery && !form.address.trim()) return setErrors({ address: "Enter the billing address, or use the delivery address" });
    setSaving(true);
    const result = await put(checkout, "billing", {
      sameAsDelivery: form.sameAsDelivery,
      ...(form.companyName.trim() && { companyName: form.companyName }),
      ...(form.taxId.trim() && { taxId: form.taxId }),
      ...(!form.sameAsDelivery && { address: form.address }),
    });
    setSaving(false);
    if (result.next) onSaved(result.next);
    else setErrors(result.errors ?? {});
  };
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <Summary errors={errors} prefix="billing" />
      <p className={styles.lead}>Your receipt shows VAT at {percent(checkout.totals.vatRateBps)} as its own line. Add a company name and TIN if you need a VAT invoice in the company&apos;s name.</p>
      <div className={styles.row}>
        <FormField label="Company name" id="billing-companyName" optional error={errors.companyName}>
          <TextField autoComplete="organization" value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} />
        </FormField>
        <FormField label="Tax ID (TIN)" id="billing-taxId" optional error={errors.taxId}>
          <TextField value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })} />
        </FormField>
      </div>
      <Checkbox id="billing-same" label="Billing address is the same as delivery" checked={form.sameAsDelivery} onChange={(event) => setForm({ ...form, sameAsDelivery: event.target.checked })} />
      {form.sameAsDelivery ? null : (
        <FormField label="Billing address" id="billing-address" error={errors.address}>
          <TextField autoComplete="billing street-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        </FormField>
      )}
      <Button type="submit" loading={saving} className={styles.continue}>
        Continue to review
      </Button>
    </form>
  );
}

function ReviewStep({ checkout }: { checkout: Checkout }) {
  const blockers = checkout.blockers.filter((blocker) => blocker.code !== "STEPS_INCOMPLETE");
  const quote = blockers.find((blocker) => blocker.code === "DELIVERY_QUOTE_REQUIRED");
  const paymentsOff = blockers.find((blocker) => blocker.code === "PAYMENTS_NOT_AVAILABLE");
  const paused = blockers.find((blocker) => blocker.code === "PAYMENTS_PAUSED");
  const attempt = checkout.payment.attempt;
  const pending = attempt && (attempt.status === "PENDING" || attempt.status === "CREATED") ? attempt : null;
  // One key per press; a retry after a network error reuses it, so it can't start a second payment.
  const key = useRef(newIdempotencyKey());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [inProgressUntil, setInProgressUntil] = useState<string | null>(pending?.newAttemptFrom ?? null);
  const processing = `/checkout/${checkout.id}/processing`;
  const canStartNew = inProgressUntil !== null && Date.now() >= new Date(inProgressUntil).getTime();

  const pay = async () => {
    setBusy(true);
    setProblem(null);
    const result = await startCheckoutPayment(checkout.id, key.current);
    if (result.ok) {
      key.current = newIdempotencyKey();
      await openPaystack(result.start, () => window.location.assign(processing));
      return;
    }
    setBusy(false);
    if (result.reason === "PAYMENT_IN_PROGRESS") {
      setInProgressUntil(result.newAttemptFrom);
      return;
    }
    if (result.reason === "ALREADY_PAID" || result.reason === "PAYMENT_UNDER_REVIEW") {
      window.location.assign(processing);
      return;
    }
    // The server answered: the next press is a new one.
    if (result.reason) key.current = newIdempotencyKey();
    setProblem(result.message);
  };
  return (
    <div className={styles.form}>
      <dl className={styles.review}>
        <div>
          <dt>Items</dt>
          <dd>{checkout.items.map((item) => `${item.productName} · ${item.quantity.toLocaleString("en-NG")}`).join(", ")}</dd>
        </div>
        <div>
          <dt>Deliver to</dt>
          <dd>{checkout.address ? `${checkout.address.name}, ${doneSummary("address", checkout)}` : "—"}</dd>
        </div>
        <div>
          <dt>Timing</dt>
          <dd>
            {checkout.productionDays ? `Production ${checkout.productionDays.min}–${checkout.productionDays.max} working days after proof approval` : "Production time confirmed with your proof"}
            {checkout.delivery?.transitDays ? `, then ${checkout.delivery.transitDays.min}–${checkout.delivery.transitDays.max} working days in transit` : ""}
          </dd>
        </div>
      </dl>
      {quote ? (
        <Notice tone="warning" title="Delivery needs a quote">
          <p>{quote.message}</p>
        </Notice>
      ) : null}
      {paymentsOff ? (
        <Notice tone="info" title="Payment isn't open yet">
          <p>Online payment is being switched on. Your checkout is saved; come back to this page to pay once it&apos;s live.</p>
        </Notice>
      ) : null}
      {paused ? (
        <Notice tone="info" title="Online payment is paused">
          <p>{paused.message} Your checkout is saved.</p>
        </Notice>
      ) : null}
      {attempt && (attempt.status === "FAILED" || attempt.status === "ABANDONED") && !problem ? (
        <Notice tone="error" title="Payment didn't go through">
          <p>{attempt.message ?? "Payment failed — try again"}. Nothing has changed on your checkout.</p>
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="error" title="Payment didn't start" live>
          <p>{problem}</p>
        </Notice>
      ) : null}
      {inProgressUntil ? (
        <Notice tone="warning" title="A payment is already in progress" live>
          <p>
            Wait for it to finish before paying again. <a href={processing}>Check its status</a>
            {canStartNew ? null : <>; you can start a new payment from {new Date(inProgressUntil).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}</>}.
          </p>
        </Notice>
      ) : null}
      <Button
        className={styles.continue}
        disabled={blockers.length > 0 || (inProgressUntil !== null && !canStartNew)}
        loading={busy}
        onClick={pay}
        icon={<Lock size={16} strokeWidth={2} aria-hidden="true" />}
      >
        {busy ? "Opening secure payment…" : inProgressUntil && canStartNew ? "Start a new payment" : `Pay ${naira(checkout.totals.totalMinor)}`}
      </Button>
      <p className={styles.fine}>Card details are entered on Paystack&apos;s secure checkout, never on this page.</p>
    </div>
  );
}
