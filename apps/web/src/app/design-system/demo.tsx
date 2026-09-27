"use client";

import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Dialog,
  ErrorSummary,
  FormField,
  RadioCardGroup,
  Select,
  StatusChip,
  TextField,
  useToast,
  type ErrorSummaryItem,
} from "@holypearls/ui";
import { useState, type FormEvent } from "react";
import styles from "./demo.module.css";

const COLORS = [
  "paper",
  "bone",
  "sand",
  "line",
  "line-strong",
  "mid",
  "graphite",
  "ink-2",
  "ink",
  "accent",
  "accent-hover",
  "accent-tint",
  "marigold",
  "marigold-tint",
  "success",
  "success-tint",
  "warning",
  "warning-tint",
  "error",
  "error-tint",
  "info",
  "info-tint",
];

const DELIVERY = [
  { value: "lagos", title: "Lagos delivery", description: "Delivered to one address in Lagos." },
  { value: "pickup", title: "Pick up", description: "Collect from the HolyPearls studio." },
  { value: "nationwide", title: "Nationwide", description: "Not available for this sample.", disabled: true },
];

interface FormErrors {
  name?: string;
  quantity?: string;
  delivery?: string;
  terms?: string;
}

export function Demo({ shellLinks }: { shellLinks: { href: string; label: string }[] }) {
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [delivery, setDelivery] = useState<string>();
  const [saving, setSaving] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: FormErrors = {};
    if (!String(data.get("name") ?? "").trim()) next.name = "Enter your full name";
    if (!data.get("quantity")) next.quantity = "Select a quantity";
    if (!delivery) next.delivery = "Choose how you want to receive the order";
    if (!data.get("terms")) next.terms = "Confirm that this is test data";
    setErrors(next);
    if (Object.keys(next).length === 0) {
      setSaving(true);
      setTimeout(() => {
        setSaving(false);
        toast({ message: "Sample form saved.", tone: "success" });
      }, 600);
    }
  }

  const summary: ErrorSummaryItem[] = [
    errors.name && { fieldId: "demo-name", message: errors.name },
    errors.quantity && { fieldId: "demo-quantity", message: errors.quantity },
    errors.delivery && { fieldId: "demo-delivery", message: errors.delivery },
    errors.terms && { fieldId: "demo-terms", message: errors.terms },
  ].filter((item): item is ErrorSummaryItem => Boolean(item));

  return (
    <div className={styles.stack}>
      <header className={styles.section}>
        <h1 className={styles.display}>Design system</h1>
        <p className={styles.support}>
          Foundation components for HolyPearls (T00-05). Signal direction tokens from the Stage 4 Pen file. Developer page; hidden in
          production.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="colors">
        <h2 id="colors" className={styles.sectionTitle}>
          Colour tokens
        </h2>
        <ul className={styles.swatches}>
          {COLORS.map((name) => (
            <li key={name}>
              <div className={styles.swatch} style={{ background: `var(--hp-${name})` }} />
              <span className={styles.swatchName}>hp-{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="buttons">
        <h2 id="buttons" className={styles.sectionTitle}>
          Buttons
        </h2>
        <div className={styles.row}>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="tertiary">Tertiary</Button>
          <Button variant="ink">Ink</Button>
          <Button variant="destructive">Delete</Button>
        </div>
        <div className={styles.row}>
          <Button disabled>Disabled</Button>
          <Button loading>Saving</Button>
          <ButtonLink variant="secondary" href="#buttons">
            Link as button
          </ButtonLink>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="form">
        <h2 id="form" className={styles.sectionTitle}>
          Form with validation
        </h2>
        <p className={styles.support}>Submit the empty form to see the error summary and field errors.</p>
        <form className={styles.form} noValidate onSubmit={submit}>
          <ErrorSummary errors={summary} />
          <FormField id="demo-name" label="Full name" error={errors.name}>
            <TextField name="name" autoComplete="name" />
          </FormField>
          <FormField id="demo-email" label="Email" hint="We only use this for order updates." optional>
            <TextField name="email" type="email" autoComplete="email" />
          </FormField>
          <FormField id="demo-quantity" label="Quantity" error={errors.quantity}>
            <Select
              name="quantity"
              defaultValue=""
              placeholder="Select a quantity"
              options={[
                { value: "50", label: "50 cards" },
                { value: "100", label: "100 cards" },
                { value: "250", label: "250 cards" },
              ]}
            />
          </FormField>
          <RadioCardGroup
            id="demo-delivery"
            name="delivery"
            legend="Delivery"
            options={DELIVERY}
            value={delivery}
            onChange={setDelivery}
            error={errors.delivery}
          />
          {errors.terms ? (
            <p className={styles.fieldError} id="demo-terms-error">
              <span className="hp-visually-hidden">Error: </span>
              {errors.terms}
            </p>
          ) : null}
          <Checkbox
            id="demo-terms"
            name="terms"
            label="I understand this is test data"
            aria-describedby={errors.terms ? "demo-terms-error" : undefined}
            aria-invalid={errors.terms ? true : undefined}
          />
          <div className={styles.row}>
            <Button type="submit" loading={saving}>
              Save
            </Button>
            <Button variant="secondary" type="reset" onClick={() => setErrors({})}>
              Clear
            </Button>
          </div>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="status">
        <h2 id="status" className={styles.sectionTitle}>
          Status chips
        </h2>
        <div className={styles.row}>
          <StatusChip tone="neutral">Draft</StatusChip>
          <StatusChip tone="info">In review</StatusChip>
          <StatusChip tone="warning">Awaiting approval</StatusChip>
          <StatusChip tone="success">Approved</StatusChip>
          <StatusChip tone="error">Changes requested</StatusChip>
          <StatusChip tone="action">Payment due</StatusChip>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="cards">
        <h2 id="cards" className={styles.sectionTitle}>
          Cards
        </h2>
        <div className={styles.cards}>
          <Card as="article">
            <p>
              Paper card. Order <span className="hp-mono">HP-2026-0142</span>
            </p>
          </Card>
          <Card as="article" tone="bone" panel>
            <p>Bone panel with the 18 px panel radius.</p>
          </Card>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="overlays">
        <h2 id="overlays" className={styles.sectionTitle}>
          Dialog and toast
        </h2>
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Button variant="secondary" onClick={() => toast({ message: "Link copied." })}>
            Show toast
          </Button>
          <Button variant="secondary" onClick={() => toast({ message: "Couldn’t save. Try again.", tone: "error" })}>
            Show error toast
          </Button>
        </div>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Remove this item?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Keep item
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDialogOpen(false);
                  toast({ message: "Item removed.", tone: "success" });
                }}
              >
                Remove item
              </Button>
            </>
          }
        >
          <p>The item leaves your cart. You can add it again later.</p>
        </Dialog>
      </section>

      <section className={styles.section} aria-labelledby="shells">
        <h2 id="shells" className={styles.sectionTitle}>
          Layout shells and page states
        </h2>
        <div className={styles.row}>
          {shellLinks.map((link) => (
            <ButtonLink key={link.href} variant="secondary" href={link.href}>
              {link.label}
            </ButtonLink>
          ))}
          <ButtonLink variant="secondary" href="/design-system/states/loading">
            Loading page
          </ButtonLink>
          <ButtonLink variant="secondary" href="/design-system/states/error">
            Error page
          </ButtonLink>
          <ButtonLink variant="secondary" href="/design-system/states/not-found">
            Not-found page
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
