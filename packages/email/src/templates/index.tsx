import { Text } from "@react-email/components";
import type { ReactElement } from "react";
import { z } from "zod";
import { Layout, text } from "./Layout.js";

interface TemplateDefinition<S extends z.ZodType> {
  data: S;
  /** Carries a link secret or code: stored sealed, wiped after sending, never resent from admin. */
  carriesSecret: boolean;
  /** Shown in the admin notification log. */
  label: string;
  subject(data: z.infer<S>): string;
  render(data: z.infer<S>): ReactElement;
}

const define = <S extends z.ZodType>(definition: TemplateDefinition<S>) => definition;

/** Every email HolyPearls sends (TECH-02 §10). Adding a template means adding its data schema here. */
export const TEMPLATES = {
  sign_in_link: define({
    label: "Sign-in link",
    carriesSecret: true,
    data: z.object({ url: z.url() }),
    subject: () => "Your HolyPearls sign-in link",
    render: ({ url }) => (
      <Layout preview="Sign in to HolyPearls" title="Sign in to HolyPearls" action={{ label: "Sign in", href: url }}>
        <Text style={text.body}>Use this button to sign in. It works once and expires in 10 minutes.</Text>
      </Layout>
    ),
  }),
  email_code: define({
    label: "Email code",
    carriesSecret: true,
    data: z.object({ code: z.string().regex(/^\d{6}$/), purpose: z.string() }),
    subject: ({ code }) => `${code} is your HolyPearls code`,
    render: ({ code, purpose }) => (
      <Layout preview={`Your code is ${code}`} title="Your HolyPearls code">
        <Text style={text.body}>Enter this code to {purpose}. It expires in 10 minutes.</Text>
        <Text style={text.code}>{code}</Text>
        <Text style={text.support}>Never share this code. HolyPearls staff will never ask you for it.</Text>
      </Layout>
    ),
  }),
  guest_link: define({
    label: "Secure link",
    carriesSecret: true,
    data: z.object({ url: z.url(), what: z.string(), reference: z.string().optional() }),
    subject: ({ what, reference }) => `Your HolyPearls ${what}${reference ? ` ${reference}` : ""}`,
    render: ({ url, what, reference }) => (
      <Layout preview={`Open your ${what}`} title={`Your ${what}${reference ? ` ${reference}` : ""}`} action={{ label: `Open your ${what}`, href: url }}>
        <Text style={text.body}>This link opens your {what}. Keep it private: anyone with it can see it.</Text>
      </Layout>
    ),
  }),
  help_request_staff: define({
    label: "New help request (staff)",
    carriesSecret: false,
    data: z.object({ reference: z.string(), from: z.string(), where: z.string(), url: z.url() }),
    subject: ({ reference, where }) => `New help request ${reference} · ${where}`,
    render: ({ reference, from, where, url }) => (
      <Layout preview={`${from} asked for help`} title={`New help request ${reference}`} action={{ label: "Open in the help inbox", href: url }}>
        <Text style={text.body}>
          {from} asked for help from {where}. Their context is attached in the help inbox.
        </Text>
      </Layout>
    ),
  }),
  help_request_received: define({
    label: "Help request received",
    carriesSecret: false,
    data: z.object({ reference: z.string(), name: z.string().optional() }),
    subject: ({ reference }) => `We got your question (${reference})`,
    render: ({ reference, name }) => (
      <Layout preview="We got your question" title="We got your question">
        <Text style={text.body}>
          {name ? `Thanks, ${name}. ` : "Thanks. "}Your request {reference} is with the HolyPearls team, with the page you were on attached, so
          you won&apos;t need to explain again. We&apos;ll reply by email.
        </Text>
      </Layout>
    ),
  }),
  help_reply: define({
    label: "Help reply",
    carriesSecret: false,
    data: z.object({ reference: z.string(), reply: z.string().max(5000), url: z.url().optional() }),
    subject: ({ reference }) => `HolyPearls replied to ${reference}`,
    render: ({ reference, reply, url }) => (
      <Layout
        preview="HolyPearls replied to your question"
        title={`About your request ${reference}`}
        action={url ? { label: "Continue where you left off", href: url } : undefined}
      >
        <Text style={text.quote}>{reply}</Text>
      </Layout>
    ),
  }),
  /**
   * Order confirmed and receipt (T04-05, COM-FR-085, PAY-FR-006). The button is the order's secure
   * link, so the email carries a secret; the receipt itself is the record in the database.
   */
  order_confirmed: define({
    label: "Order confirmed and receipt",
    carriesSecret: true,
    data: z.object({
      name: z.string().optional(),
      orderNumber: z.string(),
      receiptNumber: z.string(),
      total: z.string(),
      paidOn: z.string(),
      lines: z.array(z.string()).max(50),
      url: z.url(),
    }),
    subject: ({ orderNumber }) => `Order ${orderNumber} confirmed`,
    render: ({ name, orderNumber, receiptNumber, total, paidOn, lines, url }) => (
      <Layout preview={`Order ${orderNumber} confirmed`} title={`Order ${orderNumber} confirmed`} action={{ label: "View your order and receipt", href: url }}>
        <Text style={text.body}>
          {name ? `Thanks, ${name}. ` : "Thanks. "}We received your payment of {total} on {paidOn}. Your receipt number is {receiptNumber}.
        </Text>
        <Text style={text.quote}>{lines.join("\n")}</Text>
        <Text style={text.body}>Next, we check your artwork and send a proof for you to approve. Nothing is printed until you approve it.</Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  project_submitted: define({
    label: "Project received",
    carriesSecret: true,
    data: z.object({ reference: z.string(), title: z.string(), url: z.url() }),
    subject: ({ reference }) => `We've got your project ${reference}`,
    render: ({ reference, title, url }) => (
      <Layout preview={`Project ${reference} received`} title={`We've got your project ${reference}`} action={{ label: "View your project", href: url }}>
        <Text style={text.body}>Thanks for sending {title}. We&apos;re reviewing your brief and files, and we&apos;ll send your quote with a secure link. You don&apos;t pay anything until you accept it.</Text>
        <Text style={text.support}>This link opens your project. Keep it private: anyone with it can see the project.</Text>
      </Layout>
    ),
  }),
  quote_ready: define({
    label: "Quote ready",
    carriesSecret: true,
    data: z.object({ reference: z.string(), version: z.number().int(), total: z.string(), validUntil: z.string(), revised: z.boolean(), url: z.url() }),
    subject: ({ reference, revised }) => (revised ? `Your revised quote ${reference} is ready` : `Your quote ${reference} is ready`),
    render: ({ reference, version, total, validUntil, revised, url }) => (
      <Layout preview={`Quote ${reference}, ${total}`} title={revised ? `Your revised quote is ready` : `Your quote is ready`} action={{ label: "Review your quote", href: url }}>
        <Text style={text.body}>
          Quote {reference}, version {version}: {total}. It&apos;s valid until {validUntil}.
        </Text>
        <Text style={text.body}>Review the items, prices and payment schedule. You can accept it, ask a question or ask for changes.</Text>
        <Text style={text.support}>This link opens your quote. Keep it private: anyone with it can see the quote.</Text>
      </Layout>
    ),
  }),
  quote_expiring: define({
    label: "Quote expiring soon",
    carriesSecret: true,
    data: z.object({ reference: z.string(), validUntil: z.string(), url: z.url() }),
    subject: ({ reference }) => `Your quote ${reference} expires soon`,
    render: ({ reference, validUntil, url }) => (
      <Layout preview={`Quote ${reference} expires ${validUntil}`} title="Your quote expires soon" action={{ label: "Review your quote", href: url }}>
        <Text style={text.body}>
          Quote {reference} is valid until {validUntil}. After that it can&apos;t be accepted, but you can ask for an updated quote.
        </Text>
        <Text style={text.support}>This link opens your quote. Keep it private: anyone with it can see the quote.</Text>
      </Layout>
    ),
  }),
  quote_accepted: define({
    label: "Quote accepted",
    carriesSecret: true,
    data: z.object({ reference: z.string(), version: z.number().int(), orderNumber: z.string(), total: z.string(), dueNow: z.array(z.string()).max(8), url: z.url() }),
    subject: ({ orderNumber }) => `Quote accepted: order ${orderNumber}`,
    render: ({ reference, version, orderNumber, total, dueNow, url }) => (
      <Layout preview={`Order ${orderNumber}`} title="Quote accepted" action={{ label: dueNow.length ? "View your order and pay" : "View your order", href: url }}>
        <Text style={text.body}>
          You accepted quote {reference}, version {version} ({total}). Your order number is {orderNumber}.
        </Text>
        {dueNow.length ? <Text style={text.quote}>{["Due now:", ...dueNow].join("\n")}</Text> : null}
        <Text style={text.body}>Next, we prepare proofs for you to approve. Nothing is made until you approve them.</Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  payment_due: define({
    label: "Payment due",
    carriesSecret: true,
    data: z.object({ orderNumber: z.string(), label: z.string(), amount: z.string(), dueOn: z.string(), url: z.url() }),
    subject: ({ orderNumber, label }) => `${label} due for order ${orderNumber}`,
    render: ({ orderNumber, label, amount, dueOn, url }) => (
      <Layout preview={`${label} ${amount} due`} title={`${label} due`} action={{ label: "Pay now", href: url }}>
        <Text style={text.body}>
          The {label.toLowerCase()} of {amount} for order {orderNumber} is due on {dueOn}.
        </Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  payment_received: define({
    label: "Payment received",
    carriesSecret: true,
    data: z.object({ orderNumber: z.string(), label: z.string(), amount: z.string(), receiptNumber: z.string(), remaining: z.string(), url: z.url() }),
    subject: ({ label, orderNumber }) => `${label} received for order ${orderNumber}`,
    render: ({ orderNumber, label, amount, receiptNumber, remaining, url }) => (
      <Layout preview={`${label} received`} title={`${label} received`} action={{ label: "View your order and receipt", href: url }}>
        <Text style={text.body}>
          We received your {label.toLowerCase()} of {amount} for order {orderNumber}. Your receipt number is {receiptNumber}. Still to pay: {remaining}.
        </Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  proof_ready: define({
    label: "Proof ready to review",
    carriesSecret: true,
    data: z.object({ orderNumber: z.string(), item: z.string(), version: z.number().int(), url: z.url() }),
    subject: ({ item, version }) => `Your proof is ready: ${item}, V${version}`,
    render: ({ orderNumber, item, version, url }) => (
      <Layout preview={`Proof V${version} for ${item}`} title="Your proof is ready" action={{ label: "Review the proof", href: url }}>
        <Text style={text.body}>
          Proof V{version} for {item} (order {orderNumber}) is ready. Check the artwork, spelling, placement and details, then approve it or ask for changes. Nothing is made until you approve.
        </Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  item_on_hold: define({
    label: "Item on hold",
    carriesSecret: true,
    data: z.object({ orderNumber: z.string(), item: z.string(), explanation: z.string(), action: z.string(), url: z.url() }),
    subject: ({ orderNumber }) => `Order ${orderNumber} is on hold`,
    render: ({ orderNumber, item, explanation, action, url }) => (
      <Layout preview={`${item} is on hold`} title={`${item} is on hold`} action={{ label: "View your order", href: url }}>
        <Text style={text.body}>{explanation}</Text>
        <Text style={text.body}>
          {action} (order {orderNumber}).
        </Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  hold_resolved: define({
    label: "Hold resolved",
    carriesSecret: true,
    data: z.object({ orderNumber: z.string(), item: z.string(), url: z.url() }),
    subject: ({ orderNumber }) => `Order ${orderNumber} is moving again`,
    render: ({ orderNumber, item, url }) => (
      <Layout preview={`${item} is no longer on hold`} title="Your order is moving again" action={{ label: "View your order", href: url }}>
        <Text style={text.body}>
          {item} (order {orderNumber}) is no longer on hold. We&apos;ll keep you updated as it moves through production.
        </Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  order_link: define({
    label: "Order link (Find my order)",
    carriesSecret: true,
    data: z.object({ orderNumber: z.string(), url: z.url() }),
    subject: ({ orderNumber }) => `Your link to order ${orderNumber}`,
    render: ({ orderNumber, url }) => (
      <Layout preview={`Open order ${orderNumber}`} title="Here's your order" action={{ label: "View your order", href: url }}>
        <Text style={text.body}>Someone asked to track order {orderNumber} with this email address. Use the button to open it. You don&apos;t need an account.</Text>
        <Text style={text.support}>If that wasn&apos;t you, you can ignore this email. This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  order_cancelled: define({
    label: "Order cancelled",
    carriesSecret: true,
    data: z.object({ orderNumber: z.string(), refund: z.string().nullable(), url: z.url() }),
    subject: ({ orderNumber }) => `Order ${orderNumber} is cancelled`,
    render: ({ orderNumber, refund, url }) => (
      <Layout preview={`Order ${orderNumber} is cancelled`} title="Your order is cancelled" action={{ label: "View your order", href: url }}>
        <Text style={text.body}>
          Order {orderNumber} is cancelled.{" "}
          {refund ? `Our finance team will refund ${refund} to your original payment method. Banks usually take a few working days, and we'll email you when it's done.` : "Nothing was paid, so there's nothing to refund."}
        </Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  test_email: define({
    label: "Test email",
    carriesSecret: false,
    data: z.object({ requestedBy: z.string() }),
    subject: () => "HolyPearls test email",
    render: ({ requestedBy }) => (
      <Layout preview="Email is working" title="Email is working">
        <Text style={text.body}>{requestedBy} sent this test from the HolyPearls admin.</Text>
      </Layout>
    ),
  }),
} as const;

export type TemplateName = keyof typeof TEMPLATES;
export type TemplateData<T extends TemplateName> = z.infer<(typeof TEMPLATES)[T]["data"]>;
