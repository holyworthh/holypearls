"use client";

import { ApiError, type Cart, type CartItem, cartQuoteRequestResultSchema, cartSchema, checkoutSchema, configurationSchema } from "@holypearls/contracts";
import { Button, ButtonLink, Dialog, FormField, Notice, Select, TextField } from "@holypearls/ui";
import { CircleCheck, FileText, Info, Lock, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { api } from "../../lib/api";
import { naira, percent } from "../../lib/money";
import styles from "./cart.module.css";

const newKey = () => `web_${crypto.randomUUID().replaceAll("-", "")}`;

/**
 * Cart (Pen 41 desktop, Pen 42 mobile). Two groups (COM-FR-081): items priced
 * now, which are paid at checkout, and items that need a quote first, which
 * are never in the total. Delivery is worked out at checkout from the address.
 */
export function CartView({ initial }: { initial: Cart | null }) {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(initial ? null : { tone: "error", text: "We couldn't load your cart. Refresh the page to try again." });
  const [quoteOpen, setQuoteOpen] = useState(false);

  if (!cart) {
    return (
      <main id="main" className={styles.body}>
        <h1 className={styles.title}>Your cart</h1>
        {notice ? <Notice tone="error" title="Something went wrong">{notice.text}</Notice> : null}
      </main>
    );
  }

  const ready = cart.items.filter((item) => item.group === "READY");
  const quotes = cart.items.filter((item) => item.group === "QUOTE");

  const act = async (key: string, run: () => Promise<Cart>, done?: string) => {
    setBusy(key);
    setNotice(null);
    try {
      setCart(await run());
      if (done) setNotice({ tone: "success", text: done });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof ApiError ? error.body.message : "That didn't work. Try again." });
    } finally {
      setBusy(null);
    }
  };
  const remove = (item: CartItem) => act(item.id, () => api(`/v1/cart/items/${item.id}`, { method: "DELETE", response: cartSchema }), `${item.productName} removed. Your design is still saved.`);
  const saveForLater = (item: CartItem) =>
    act(item.id, () => api(`/v1/cart/items/${item.id}/save-for-later`, { method: "POST", response: cartSchema }), `${item.productName} saved for later.`);
  /** The quantity menu saves through the design itself, then reloads the cart. */
  const changeQuantity = (item: CartItem, quantity: number) =>
    act(item.id, async () => {
      const draft = await api(`/v1/configurations/${item.configurationId}`, { response: configurationSchema });
      await api(`/v1/configurations/${item.configurationId}`, { method: "PATCH", body: { version: draft.version, quantity }, response: z.unknown() });
      return api("/v1/cart", { response: cartSchema });
    });
  const moveBack = (configurationId: string) => act(configurationId, () => api("/v1/cart/items", { method: "POST", body: { configurationId }, response: cartSchema }));

  const checkout = async () => {
    setBusy("checkout");
    setNotice(null);
    try {
      const started = await api("/v1/checkouts", { method: "POST", response: checkoutSchema, headers: { "Idempotency-Key": newKey() } });
      router.push(`/checkout/${started.id}`);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof ApiError ? error.body.message : "We couldn't start checkout. Try again." });
      // Prices may have moved an item to the quote group.
      setCart(await api("/v1/cart", { response: cartSchema }).catch(() => cart));
      setBusy(null);
    }
  };

  if (!cart.items.length) {
    return (
      <main id="main" className={styles.body}>
        <h1 className={styles.title}>Your cart</h1>
        {notice ? (
          <Notice tone={notice.tone} title={notice.tone === "success" ? "Done" : "Something went wrong"} live>
            {notice.text}
          </Notice>
        ) : null}
        <section className={styles.empty} aria-labelledby="cart-empty">
          <span className={styles.emptyIcon} aria-hidden="true">
            <ShoppingBag size={28} strokeWidth={1.5} />
          </span>
          <h2 id="cart-empty">Your cart is empty</h2>
          <p>Saved configurations and quotes live in your account or on your quote link.</p>
          <div className={styles.emptyActions}>
            <ButtonLink href="/products">Browse products</ButtonLink>
            <ButtonLink href="/contact?topic=order" variant="secondary">
              Track an order
            </ButtonLink>
          </div>
        </section>
        <Saved cart={cart} busy={busy} onMove={moveBack} onForget={(id) => act(id, () => api(`/v1/cart/saved/${id}`, { method: "DELETE", response: cartSchema }))} />
      </main>
    );
  }

  const vatLabel = cart.ready.vatRateBps !== null ? `VAT ${percent(cart.ready.vatRateBps)}` : "VAT";

  return (
    <main id="main" className={styles.body}>
      <h1 className={styles.title}>Your cart</h1>
      {notice ? (
        <Notice tone={notice.tone} title={notice.tone === "success" ? "Done" : "Something went wrong"} live>
          {notice.text}
        </Notice>
      ) : null}
      <div className={styles.split}>
        <div className={styles.groups}>
          {ready.length ? (
            <section className={styles.group} aria-labelledby="group-ready">
              <header className={styles.groupHead}>
                <ShoppingBag className={styles.groupIcon} size={20} strokeWidth={2} aria-hidden="true" />
                <div className={styles.groupText}>
                  <h2 id="group-ready">Ready to check out</h2>
                  <p>Priced now. Pay today and we start after your proof is approved.</p>
                </div>
                <span className={`${styles.chip} ${styles.chipReady}`}>
                  <CircleCheck size={14} strokeWidth={2} aria-hidden="true" />
                  <span className={styles.chipLong}>PRICE READY</span>
                  <span className={styles.chipShort}>READY</span>
                </span>
              </header>
              {ready.map((item) => (
                <Item key={item.id} item={item} busy={busy === item.id} onRemove={() => void remove(item)} onSave={() => void saveForLater(item)} onQuantity={(quantity) => void changeQuantity(item, quantity)} />
              ))}
            </section>
          ) : null}
          {quotes.length ? (
            <section className={`${styles.group} ${styles.groupQuote}`} aria-labelledby="group-quote">
              <header className={`${styles.groupHead} ${styles.groupHeadQuote}`}>
                <FileText className={styles.groupIcon} size={20} strokeWidth={2} aria-hidden="true" />
                <div className={styles.groupText}>
                  <h2 id="group-quote">
                    <span className={styles.chipLong}>Needs a quote before payment</span>
                    <span className={styles.chipShort}>Needs a quote</span>
                  </h2>
                  <p className={styles.quoteLead}>Not included in your total. You can&apos;t pay for these yet.</p>
                </div>
                <span className={`${styles.chip} ${styles.chipQuote}`}>
                  <FileText size={14} strokeWidth={2} aria-hidden="true" />
                  <span className={styles.chipLong}>QUOTE REQUIRED</span>
                  <span className={styles.chipShort}>QUOTE</span>
                </span>
              </header>
              {quotes.map((item) => (
                <Item key={item.id} item={item} busy={busy === item.id} onRemove={() => void remove(item)} onSave={() => void saveForLater(item)} onQuantity={(quantity) => void changeQuantity(item, quantity)} />
              ))}
              <div className={styles.why}>
                <Info className={styles.groupIcon} size={20} strokeWidth={2} aria-hidden="true" />
                <div>
                  <h3>Why can&apos;t I pay for this yet?</h3>
                  <p>
                    Custom work needs a quick production check. We&apos;ll send a quote, usually with the same estimate. You pay only after you accept it, and a deposit starts
                    production.
                  </p>
                </div>
              </div>
              <div className={styles.quoteMobile}>
                <Button variant="secondary" fullWidth onClick={() => setQuoteOpen(true)}>
                  Submit for quote
                </Button>
              </div>
            </section>
          ) : null}
          <Saved cart={cart} busy={busy} onMove={moveBack} onForget={(id) => act(id, () => api(`/v1/cart/saved/${id}`, { method: "DELETE", response: cartSchema }))} />
        </div>

        <aside className={styles.rail} aria-labelledby="pay-today">
          <h2 id="pay-today" className={styles.railTitle}>
            Pay today
          </h2>
          {ready.length ? (
            <dl className={styles.sums}>
              {ready.map((item) => (
                <div key={item.id} className={styles.sum}>
                  <dt>
                    {item.productName}
                    {item.quantity ? ` · ${item.quantity.toLocaleString("en-NG")}` : ""}
                  </dt>
                  <dd>{naira(item.totalMinor !== null ? (BigInt(item.totalMinor) - vatShare(cart, item)).toString() : null)}</dd>
                </div>
              ))}
              <div className={styles.sum}>
                <dt>{vatLabel}</dt>
                <dd>{naira(cart.ready.vatMinor)}</dd>
              </div>
              <div className={styles.sum}>
                <dt>Delivery</dt>
                <dd className={styles.muted}>Set at checkout</dd>
              </div>
              <div className={`${styles.sum} ${styles.total}`}>
                <dt>Total to pay today</dt>
                <dd>
                  {naira(cart.ready.totalMinor)}
                  <span className={styles.plus}> + delivery</span>
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.note}>Nothing here can be paid yet. Quote items are paid after you accept their quote.</p>
          )}
          <p className={styles.note}>Delivery is worked out at checkout from your address.</p>
          {ready.length ? (
            <Button fullWidth className={styles.checkout} loading={busy === "checkout"} onClick={() => void checkout()} icon={<Lock size={16} strokeWidth={2} aria-hidden="true" />}>
              Check out ready items
            </Button>
          ) : null}
          {quotes.length ? (
            <div className={styles.quoteBlock}>
              <div className={styles.quoteRow}>
                <span>Quote items (not in total)</span>
                <strong>{cart.quoteEstimateMinor ? `Est. ${naira(cart.quoteEstimateMinor)}` : "Priced by quote"}</strong>
              </div>
              <Button variant="secondary" fullWidth onClick={() => setQuoteOpen(true)}>
                Submit quote items
              </Button>
            </div>
          ) : null}
          <p className={styles.guest}>Guest checkout · no account needed</p>
        </aside>
      </div>

      {ready.length ? (
        <div className={styles.payBar}>
          <div>
            <p className={styles.payBarTotal}>{naira(cart.ready.totalMinor)}</p>
            <p className={styles.payBarNote}>Pay today · ready items only, before delivery</p>
          </div>
          <Button loading={busy === "checkout"} onClick={() => void checkout()}>
            Check out
          </Button>
        </div>
      ) : null}

      <QuoteDialog
        open={quoteOpen}
        count={quotes.length}
        onClose={() => setQuoteOpen(false)}
        onSent={async (references) => {
          setQuoteOpen(false);
          setCart(await api("/v1/cart", { response: cartSchema }).catch(() => cart));
          setNotice({ tone: "success", text: `Quote requested: ${references.join(", ")}. We'll email your quote; every choice is saved with it.` });
        }}
      />
    </main>
  );
}

/** Each ready item's share of the VAT line, so the item rows plus VAT add up to the total. */
function vatShare(cart: Cart, item: CartItem): bigint {
  const ready = cart.items.filter((entry) => entry.group === "READY" && entry.totalMinor !== null);
  const total = ready.reduce((sum, entry) => sum + BigInt(entry.totalMinor!), 0n);
  if (!total || item.totalMinor === null) return 0n;
  const vat = BigInt(cart.ready.vatMinor);
  const isLast = ready[ready.length - 1]?.id === item.id;
  if (isLast) return vat - ready.slice(0, -1).reduce((sum, entry) => sum + (BigInt(entry.totalMinor!) * vat) / total, 0n);
  return (BigInt(item.totalMinor) * vat) / total;
}

function Item({ item, busy, onRemove, onSave, onQuantity }: { item: CartItem; busy: boolean; onRemove: () => void; onSave: () => void; onQuantity: (quantity: number) => void }) {
  const quote = item.group === "QUOTE";
  return (
    <article className={styles.item} aria-busy={busy}>
      <div className={styles.thumb} aria-hidden="true" />
      <div className={styles.itemText}>
        <h3>{item.productName}</h3>
        <p className={styles.itemMeta}>
          <span className={styles.qtyInline}>{item.quantity ? `${item.quantity.toLocaleString("en-NG")} · ` : ""}</span>
          {item.summary || "Your configuration"}
        </p>
        <p className={styles.itemMeta}>{quote ? "Saved configuration · edit any time" : item.artwork ? `Artwork: ${item.artwork}` : "Artwork: not added yet"}</p>
        <p className={styles.itemPriceMobile}>{quote ? `Est. ${naira(item.totalMinor)} · not in total` : naira(item.totalMinor)}</p>
        <div className={styles.acts}>
          <a href={item.editHref}>{quote ? "Edit configuration" : "Edit"}</a>
          <button type="button" onClick={onSave} disabled={busy}>
            Save for later
          </button>
          <button type="button" onClick={onRemove} disabled={busy}>
            Remove
          </button>
        </div>
      </div>
      <div className={styles.price}>
        {quote ? (
          <>
            <p className={styles.est}>{item.totalMinor ? `Est. ${naira(item.totalMinor)}` : "Priced by quote"}</p>
            {item.perUnitMinor ? <p className={styles.per}>≈ {naira(item.perUnitMinor)} per piece</p> : null}
          </>
        ) : (
          <>
            {item.quantityOptions.length > 1 && item.quantity ? (
              <Select
                aria-label={`Quantity of ${item.productName}`}
                className={styles.qtySelect}
                options={item.quantityOptions.map((value) => ({ value: String(value), label: value.toLocaleString("en-NG") }))}
                value={String(item.quantity)}
                disabled={busy}
                onChange={(event) => onQuantity(Number(event.target.value))}
              />
            ) : item.quantity ? (
              <p className={styles.qty}>{item.quantity.toLocaleString("en-NG")}</p>
            ) : null}
            <p className={styles.amount}>{naira(item.totalMinor)}</p>
            {item.perUnitMinor ? <p className={styles.per}>{naira(item.perUnitMinor)} each, incl. VAT</p> : null}
          </>
        )}
      </div>
    </article>
  );
}

function Saved({ cart, busy, onMove, onForget }: { cart: Cart; busy: string | null; onMove: (id: string) => void; onForget: (id: string) => void }) {
  if (!cart.savedForLater.length) return null;
  return (
    <section className={styles.group} aria-labelledby="group-saved">
      <header className={styles.groupHead}>
        <div className={styles.groupText}>
          <h2 id="group-saved">Saved for later</h2>
          <p>Kept as saved designs. Move one back when you&apos;re ready.</p>
        </div>
      </header>
      {cart.savedForLater.map((saved) => (
        <article key={saved.configurationId} className={styles.item} aria-busy={busy === saved.configurationId}>
          <div className={styles.itemText}>
            <h3>{saved.productName}</h3>
            <p className={styles.itemMeta}>
              {saved.quantity ? `${saved.quantity.toLocaleString("en-NG")} · ` : ""}
              {saved.summary}
            </p>
            <div className={styles.acts}>
              <button type="button" onClick={() => onMove(saved.configurationId)} disabled={busy === saved.configurationId}>
                Move to cart
              </button>
              <a href={saved.editHref}>Edit</a>
              <button type="button" onClick={() => onForget(saved.configurationId)} disabled={busy === saved.configurationId}>
                Remove from list
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function QuoteDialog({ open, count, onClose, onSent }: { open: boolean; count: number; onClose: () => void; onSent: (references: string[]) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    setErrors({});
    try {
      const result = await api("/v1/cart/quote-request", {
        method: "POST",
        body: { name: form.name, email: form.email, ...(form.phone && { phone: form.phone }), ...(form.note && { note: form.note }) },
        response: cartQuoteRequestResultSchema,
      });
      onSent(result.references);
    } catch (error) {
      if (error instanceof ApiError && error.body.fieldErrors) setErrors(error.body.fieldErrors);
      else setErrors({ form: error instanceof ApiError ? error.body.message : "We couldn't send it. Try again." });
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={count === 1 ? "Submit quote item" : `Submit ${count} quote items`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void send()} loading={sending}>
            Send quote request
          </Button>
        </>
      }
    >
      <p>We review each design, confirm anything we can&apos;t price automatically, and email your quote. Nothing is charged yet. Your ready items stay in the cart.</p>
      {errors.form ? <p role="alert">{errors.form}</p> : null}
      <FormField label="Your name" id="cart-quote-name" error={errors.name}>
        <TextField autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </FormField>
      <FormField label="Email" id="cart-quote-email" error={errors.email}>
        <TextField type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
      </FormField>
      <FormField label="Phone" id="cart-quote-phone" optional error={errors.phone}>
        <TextField type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      </FormField>
      <FormField label="Anything we should know?" id="cart-quote-note" optional error={errors.note}>
        <TextField value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      </FormField>
    </Dialog>
  );
}
