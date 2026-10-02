"use client";

import { type Checkout, checkoutSchema } from "@holypearls/contracts";
import { Button, ButtonLink, Notice } from "@holypearls/ui";
import { Check, CircleCheck, CreditCard, LoaderCircle, Lock, ShieldQuestion } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, newIdempotencyKey } from "../../lib/api";
import { naira } from "../../lib/money";
import { openPaystack, startCheckoutPayment } from "../../lib/paystack";
import styles from "./payment-status.module.css";

/** How often the page asks the server while a payment is being confirmed. */
const POLL_MS = 3000;
const SLOW_POLL_MS = 15_000;
const SLOW_AFTER_MS = 2 * 60 * 1000;

/**
 * The result of a payment, as the server knows it (Pen 45 B–D; PAY-FR-009).
 * "Confirming your payment" until a verified webhook or a payment check
 * settles it; never "paid" or "failed" before the server says so.
 */
export function PaymentStatusView({ initial }: { initial: Checkout }) {
  const [checkout, setCheckout] = useState(initial);
  const status = checkout.payment.status;
  const waiting = status === "PAYMENT_PENDING";
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        setCheckout(await api(`/v1/checkouts/${checkout.id}`, { response: checkoutSchema }));
      } catch {
        // Keep waiting; a network blip doesn't change the payment.
      }
      timer = setTimeout(poll, Date.now() - started > SLOW_AFTER_MS ? SLOW_POLL_MS : POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, checkout.id]);

  // A settled result moves focus to its heading, so screen readers hear it.
  useEffect(() => {
    if (!waiting) heading.current?.focus();
  }, [waiting]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.logo} href="/" aria-label="HolyPearls home">
          <span className={styles.pearl} aria-hidden="true" />
          HolyPearls
        </a>
        <span className={styles.secure}>
          <Lock size={14} strokeWidth={2} aria-hidden="true" />
          Secure checkout
        </span>
      </header>
      <main id="main" className={styles.main}>
        {status === "PAID" ? (
          <Paid checkout={checkout} heading={heading} />
        ) : status === "PAYMENT_FAILED" || status === "PAYMENT_DUE" ? (
          <Failed checkout={checkout} heading={heading} />
        ) : status === "PAYMENT_RESOLUTION_REQUIRED" ? (
          <Checking checkout={checkout} heading={heading} />
        ) : (
          <Processing checkout={checkout} />
        )}
      </main>
    </div>
  );
}

function Amount({ checkout, label }: { checkout: Checkout; label: string }) {
  return (
    <div className={styles.ref}>
      <p className={styles.refLabel}>{label}</p>
      <p className={styles.refValue}>{naira(checkout.payment.amountMinor)}</p>
    </div>
  );
}

/** Starts a new attempt and opens Paystack; one key per press (TECH-02 §4). */
function useRetry(checkout: Checkout) {
  const key = useRef(newIdempotencyKey());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const retry = async () => {
    setBusy(true);
    setProblem(null);
    const result = await startCheckoutPayment(checkout.id, key.current);
    if (result.ok) {
      key.current = newIdempotencyKey();
      await openPaystack(result.start, () => window.location.reload());
      return;
    }
    setBusy(false);
    if (result.reason) key.current = newIdempotencyKey();
    if (result.reason === "PAYMENT_IN_PROGRESS" || result.reason === "ALREADY_PAID") {
      window.location.reload();
      return;
    }
    setProblem(result.message);
  };
  return { busy, problem, retry };
}

function Processing({ checkout }: { checkout: Checkout }) {
  const { busy, problem, retry } = useRetry(checkout);
  const from = checkout.payment.attempt?.newAttemptFrom;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  // After 10 minutes the customer may start again; the double-payment rule protects them (TECH-05 §6).
  const canStartNew = Boolean(from && now >= new Date(from).getTime());
  return (
    <section className={styles.processing} aria-live="polite" aria-busy="true">
      <span className={styles.spinner} aria-hidden="true">
        <LoaderCircle size={40} strokeWidth={2} />
      </span>
      <h1 className={styles.title}>Confirming your payment</h1>
      <p className={styles.body}>This usually takes a few seconds. Please don&apos;t close this page or pay again.</p>
      <Amount checkout={checkout} label="PAYMENT" />
      {canStartNew ? (
        <div className={styles.stillWaiting}>
          <p className={styles.fine}>Still waiting? If you closed Paystack without paying, you can start a new payment. If you did pay, you won&apos;t be charged twice for this order.</p>
          {problem ? (
            <Notice tone="error" title="Payment didn't start" live>
              <p>{problem}</p>
            </Notice>
          ) : null}
          <Button variant="secondary" fullWidth loading={busy} onClick={retry} className={styles.action}>
            Start a new payment
          </Button>
        </div>
      ) : null}
    </section>
  );
}

type HeadingRef = { heading: React.RefObject<HTMLHeadingElement | null> };

function Failed({ checkout, heading }: { checkout: Checkout } & HeadingRef) {
  const { busy, problem, retry } = useRetry(checkout);
  const message = checkout.payment.attempt?.message;

  return (
    <section className={styles.result}>
      <span className={styles.iconFailed} aria-hidden="true">
        <CreditCard size={26} strokeWidth={2} />
      </span>
      <h1 ref={heading} tabIndex={-1} className={styles.titleFailed}>
        Payment didn&apos;t go through
      </h1>
      <p className={styles.body}>{message ? `${message}.` : "The payment wasn't completed."} Nothing has changed on your checkout.</p>
      <div className={styles.saved}>
        <p className={styles.savedTitle}>Still saved</p>
        <ul>
          <li>
            <Check size={14} strokeWidth={2} aria-hidden="true" />
            {checkout.items.map((item) => item.productName).join(", ")} · {naira(checkout.payment.amountMinor)}
          </li>
          <li>
            <Check size={14} strokeWidth={2} aria-hidden="true" />
            Your delivery details
          </li>
          <li>
            <Check size={14} strokeWidth={2} aria-hidden="true" />
            Your artwork and proof settings
          </li>
        </ul>
      </div>
      {problem ? (
        <Notice tone="error" title="Payment didn't start" live>
          <p>{problem}</p>
        </Notice>
      ) : null}
      <Button fullWidth loading={busy} onClick={retry} className={styles.action}>
        Try again
      </Button>
      <ButtonLink href={`/checkout/${checkout.id}`} variant="secondary" fullWidth className={styles.action}>
        Back to checkout
      </ButtonLink>
      <p className={styles.fine}>If you see a pending charge, contact us with your payment reference before paying again{checkout.payment.attempt ? ` (${checkout.payment.attempt.reference})` : ""}.</p>
    </section>
  );
}

function Checking({ checkout, heading }: { checkout: Checkout } & HeadingRef) {
  return (
    <section className={styles.result}>
      <span className={styles.iconChecking} aria-hidden="true">
        <ShieldQuestion size={26} strokeWidth={2} />
      </span>
      <h1 ref={heading} tabIndex={-1} className={styles.titleFailed}>
        We&apos;re checking your payment
      </h1>
      <p className={styles.body}>We couldn&apos;t confirm this payment automatically, so our team is checking it with Paystack. Please don&apos;t pay again; we&apos;ll email you within one working day.</p>
      <Amount checkout={checkout} label={checkout.payment.attempt ? `REFERENCE ${checkout.payment.attempt.reference}` : "PAYMENT"} />
      <ButtonLink href="/contact?topic=order" variant="secondary" fullWidth className={styles.action}>
        Contact us
      </ButtonLink>
    </section>
  );
}

function Paid({ checkout, heading }: { checkout: Checkout } & HeadingRef) {
  const first = checkout.contact?.name.split(" ")[0];
  const days = checkout.productionDays;
  const where = checkout.address ? [checkout.address.area, checkout.address.state].filter(Boolean).join(", ") : null;
  // The order exists once the payment is confirmed (T04-05, Pen 45 D).
  const order = checkout.order;
  return (
    <section className={styles.result}>
      <span className={styles.iconPaid} aria-hidden="true">
        <CircleCheck size={28} strokeWidth={2} />
      </span>
      <h1 ref={heading} tabIndex={-1} className={styles.titlePaid}>
        {order ? "Order confirmed" : "Payment received"}
      </h1>
      <p className={styles.body}>{first ? `Thanks, ${first}. ` : "Thank you. "}{order ? "We've emailed your receipt." : "Your payment is confirmed."}</p>
      <div className={styles.card}>
        <p className={styles.refLabel}>{order ? `ORDER ${order.number}` : "PAID"}</p>
        <p className={styles.cardValue}>
          {checkout.items.map((item) => `${item.productName} · ${item.quantity.toLocaleString("en-NG")}`).join(", ")} · paid {naira(checkout.payment.amountMinor)}
        </p>
      </div>
      <div className={styles.next}>
        <h2 className={styles.nextTitle}>What happens next</h2>
        <ol>
          <li>We check your artwork and send a proof</li>
          <li>You approve it, then we print</li>
          <li>{days ? `Ready in ${days.min}–${days.max} working days after approval` : "Production time is confirmed with your proof"}</li>
          {where ? <li>Delivered to {where}</li> : null}
        </ol>
      </div>
      {order ? (
        <ButtonLink href={`/orders/${order.id}`} fullWidth className={styles.action}>
          View your order and receipt
        </ButtonLink>
      ) : null}
      <ButtonLink href="/" variant="secondary" fullWidth className={styles.action}>
        Continue shopping
      </ButtonLink>
    </section>
  );
}
