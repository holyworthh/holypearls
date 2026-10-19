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
  verify_email: define({
    label: "Email check after sign-up",
    carriesSecret: true,
    data: z.object({ url: z.url() }),
    subject: () => "Verify your HolyPearls email",
    render: ({ url }) => (
      <Layout preview="Verify your email" title="Verify your email" action={{ label: "Verify email", href: url }}>
        <Text style={text.body}>Verify this email to finish your account. Orders you placed as a guest with this email are added after you verify. The link expires in 24 hours.</Text>
        <Text style={text.support}>Didn&apos;t create an account? Ignore this email.</Text>
      </Layout>
    ),
  }),
  change_email: define({
    label: "Check of a new account email",
    carriesSecret: true,
    data: z.object({ url: z.url() }),
    subject: () => "Confirm your new HolyPearls email",
    render: ({ url }) => (
      <Layout preview="Confirm your new email" title="Confirm your new email" action={{ label: "Use this email", href: url }}>
        <Text style={text.body}>Someone asked to use this address for a HolyPearls account. Your account keeps its old email until you confirm. Confirming signs the account out on every other device. The link expires in 24 hours.</Text>
        <Text style={text.support}>Didn&apos;t ask for this? Ignore this email; nothing changes.</Text>
      </Layout>
    ),
  }),
  password_reset: define({
    label: "Password reset link",
    carriesSecret: true,
    data: z.object({ url: z.url() }),
    subject: () => "Reset your HolyPearls password",
    render: ({ url }) => (
      <Layout preview="Reset your password" title="Reset your password" action={{ label: "Choose a new password", href: url }}>
        <Text style={text.body}>Use this button to choose a new password. It expires in 1 hour. Saving a new password signs you out on every other device.</Text>
        <Text style={text.support}>Didn&apos;t ask for this? Ignore this email; your password stays the same.</Text>
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
  shipment_dispatched: define({
    label: "Shipment dispatched",
    carriesSecret: true,
    data: z.object({ orderNumber: z.string(), items: z.string(), carrier: z.string(), trackingNumber: z.string(), url: z.url() }),
    subject: ({ orderNumber }) => `Order ${orderNumber} is on its way`,
    render: ({ orderNumber, items, carrier, trackingNumber, url }) => (
      <Layout preview={`Order ${orderNumber} is on its way`} title="Your order is on its way" action={{ label: "Track your order", href: url }}>
        <Text style={text.body}>
          We&apos;ve dispatched {items} from order {orderNumber}.{carrier ? ` Carrier: ${carrier}.` : ""}
          {trackingNumber ? ` Tracking number: ${trackingNumber}.` : ""}
        </Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  shipment_delivered: define({
    label: "Shipment delivered",
    carriesSecret: true,
    data: z.object({ orderNumber: z.string(), items: z.string(), carrier: z.string(), trackingNumber: z.string(), url: z.url() }),
    subject: ({ orderNumber }) => `Order ${orderNumber}: delivered`,
    render: ({ orderNumber, items, url }) => (
      <Layout preview={`Delivered: ${items}`} title="Delivered" action={{ label: "View your order", href: url }}>
        <Text style={text.body}>
          {items} from order {orderNumber} {items.includes(",") ? "were" : "was"} delivered. If anything isn&apos;t right, you can report a problem from your order page.
        </Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  problem_received: define({
    label: "Problem report received",
    carriesSecret: true,
    data: z.object({ orderNumber: z.string(), reference: z.string(), item: z.string(), url: z.url() }),
    subject: ({ reference }) => `We've got your report ${reference}`,
    render: ({ orderNumber, reference, item, url }) => (
      <Layout preview={`Report ${reference} received`} title="We've got your report" action={{ label: "View your order", href: url }}>
        <Text style={text.body}>
          Thanks for telling us about the problem with {item} (order {orderNumber}). Your reference is {reference}. We&apos;ll look at it within 1 working day and email you.
        </Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  problem_reply: define({
    label: "Reply to a problem report",
    carriesSecret: true,
    data: z.object({ reference: z.string(), body: z.string(), url: z.url() }),
    subject: ({ reference }) => `About your report ${reference}`,
    render: ({ reference, body, url }) => (
      <Layout preview={`About your report ${reference}`} title={`About your report ${reference}`} action={{ label: "View your order", href: url }}>
        <Text style={text.body}>{body}</Text>
        <Text style={text.support}>This link opens your order. Keep it private: anyone with it can see the order.</Text>
      </Layout>
    ),
  }),
  delivery_price_needed: define({
    label: "Delivery price needed (staff)",
    carriesSecret: false,
    data: z.object({ place: z.string(), url: z.url() }),
    subject: ({ place }) => `Delivery price needed · ${place}`,
    render: ({ place, url }) => (
      <Layout preview={`A customer is waiting for a delivery price to ${place}`} title="Delivery price needed" action={{ label: "Set the delivery price", href: url }}>
        <Text style={text.body}>
          A customer has finished checkout for delivery to {place}, outside the delivery zones. They can pay once you set the delivery price. Their checkout stays open for 72 hours.
        </Text>
      </Layout>
    ),
  }),
  delivery_price_ready: define({
    label: "Delivery price ready",
    carriesSecret: false,
    data: z.object({ delivery: z.string(), total: z.string(), url: z.url() }),
    subject: () => "Your delivery price is ready",
    render: ({ delivery, total, url }) => (
      <Layout preview={`Delivery ${delivery}. Your total is ${total}.`} title="Your delivery price is ready" action={{ label: "Review and pay", href: url }}>
        <Text style={text.body}>
          Delivery to your address is {delivery}, so your order total is {total} including VAT. Open your checkout on the device you used to place the order to review and pay.
        </Text>
        <Text style={text.support}>Your checkout stays open for 72 hours.</Text>
      </Layout>
    ),
  }),
  organization_invitation: define({
    label: "Workspace invitation",
    carriesSecret: true,
    data: z.object({ organization: z.string(), role: z.string(), invitedBy: z.string(), expires: z.string(), url: z.url() }),
    subject: ({ organization }) => `You're invited to ${organization} on HolyPearls`,
    render: ({ organization, role, invitedBy, expires, url }) => (
      <Layout preview={`${invitedBy} invited you to ${organization}`} title={`Join ${organization}`} action={{ label: "Accept the invitation", href: url }}>
        <Text style={text.body}>
          {invitedBy} invited you to {organization}&apos;s HolyPearls workspace as {role}. Sign in or create an account with this email address to accept.
        </Text>
        <Text style={text.support}>The invitation works once and expires on {expires}. Didn&apos;t expect it? Ignore this email.</Text>
      </Layout>
    ),
  }),
  staff_invitation: define({
    label: "Staff invitation",
    carriesSecret: true,
    data: z.object({ invitedBy: z.string(), permissions: z.string(), expires: z.string(), url: z.url() }),
    subject: () => "You're invited to the HolyPearls admin",
    render: ({ invitedBy, permissions, expires, url }) => (
      <Layout preview={`${invitedBy} invited you to the HolyPearls admin`} title="Join the HolyPearls team" action={{ label: "Accept the invitation", href: url }}>
        <Text style={text.body}>
          {invitedBy} invited you to the HolyPearls staff admin with these permissions: {permissions}. Sign in or create an account with this email address to accept, then sign in to the admin and set up your authenticator app.
        </Text>
        <Text style={text.support}>The invitation works once and expires on {expires}. Didn&apos;t expect it? Ignore this email.</Text>
      </Layout>
    ),
  }),
  organization_role_changed: define({
    label: "Workspace role changed",
    carriesSecret: false,
    data: z.object({ organization: z.string(), role: z.string(), url: z.url() }),
    subject: ({ organization }) => `Your role in ${organization} changed`,
    render: ({ organization, role, url }) => (
      <Layout preview={`You're now ${role} in ${organization}`} title="Your role changed" action={{ label: "Open the workspace", href: url }}>
        <Text style={text.body}>
          You&apos;re now {role} in {organization}&apos;s HolyPearls workspace. What you can see and do there has changed to match.
        </Text>
        <Text style={text.support}>Questions about the change? Ask your workspace Owner.</Text>
      </Layout>
    ),
  }),
  organization_request_staff: define({
    label: "New workspace request (staff)",
    carriesSecret: false,
    data: z.object({ company: z.string(), locations: z.number().int(), url: z.url() }),
    subject: ({ company }) => `New workspace request · ${company}`,
    render: ({ company, locations, url }) => (
      <Layout preview={`${company} asked for a workspace`} title="New workspace request" action={{ label: "Review the request", href: url }}>
        <Text style={text.body}>
          {company} asked for a HolyPearls workspace with {locations} {locations === 1 ? "location" : "locations"}. Approve or decline it in the admin.
        </Text>
      </Layout>
    ),
  }),
  organization_request_approved: define({
    label: "Workspace request approved",
    carriesSecret: false,
    data: z.object({ organization: z.string(), url: z.url() }),
    subject: ({ organization }) => `Your ${organization} workspace is ready`,
    render: ({ organization, url }) => (
      <Layout preview="Your workspace is ready" title="Your workspace is ready" action={{ label: "Open the workspace", href: url }}>
        <Text style={text.body}>
          We approved your request. {organization}&apos;s workspace is ready and you&apos;re its Owner, so you can invite your team and set what each person can do.
        </Text>
      </Layout>
    ),
  }),
  organization_request_declined: define({
    label: "Workspace request declined",
    carriesSecret: false,
    data: z.object({ company: z.string(), reason: z.string().max(1000) }),
    subject: ({ company }) => `About your workspace request for ${company}`,
    render: ({ company, reason }) => (
      <Layout preview="About your workspace request" title="We couldn't set up this workspace">
        <Text style={text.body}>We looked at your request for a {company} workspace and couldn&apos;t approve it this time.</Text>
        <Text style={text.body}>{reason}</Text>
        <Text style={text.support}>You can still order as usual, and you can send a new request from your account.</Text>
      </Layout>
    ),
  }),
  brand_asset_reviewed: define({
    label: "Brand asset reviewed",
    carriesSecret: false,
    data: z.object({ asset: z.string(), kind: z.string(), ready: z.boolean(), note: z.string().max(1000).optional(), url: z.url() }),
    subject: ({ asset, ready }) => (ready ? `${asset} is production ready` : `${asset} needs a change`),
    render: ({ asset, kind, ready, note, url }) => (
      <Layout preview={ready ? `${asset} is ready for new orders` : `HolyPearls checked ${asset}`} title={ready ? `${asset} is production ready` : `${asset} needs a change`} action={{ label: "Open the asset", href: url }}>
        <Text style={text.body}>
          {ready
            ? `HolyPearls checked your ${kind.toLowerCase()} file for print and embroidery. New orders can use it now; the previous version stays in your history.`
            : `HolyPearls checked your ${kind.toLowerCase()} file and it isn't ready for production yet. Upload a new version when you can.`}
        </Text>
        {note ? <Text style={text.body}>{note}</Text> : null}
      </Layout>
    ),
  }),
  order_request_submitted: define({
    label: "Order request waiting for approval",
    carriesSecret: false,
    data: z.object({ title: z.string(), requestedBy: z.string(), location: z.string(), amount: z.string().optional(), url: z.url() }),
    subject: ({ title }) => `Approval needed: ${title}`,
    render: ({ title, requestedBy, location, amount, url }) => (
      <Layout preview={`${requestedBy} needs your approval`} title="An order request needs your approval" action={{ label: "Review the request", href: url }}>
        <Text style={text.body}>
          {requestedBy} asked to order {title} for {location}
          {amount ? `, estimated at ${amount}` : ""}. Approving sends it to HolyPearls for a quote.
        </Text>
      </Layout>
    ),
  }),
  order_request_decided: define({
    label: "Order request decided",
    carriesSecret: false,
    data: z.object({ title: z.string(), decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]), decidedBy: z.string(), note: z.string().max(1000).optional(), url: z.url() }),
    subject: ({ title, decision }) => (decision === "APPROVED" ? `Approved: ${title}` : decision === "REJECTED" ? `Declined: ${title}` : `Changes requested: ${title}`),
    render: ({ title, decision, decidedBy, note, url }) => (
      <Layout
        preview={decision === "APPROVED" ? `${decidedBy} approved your request` : `${decidedBy} replied to your request`}
        title={decision === "APPROVED" ? "Your order request was approved" : decision === "REJECTED" ? "Your order request was declined" : "Changes requested on your order request"}
        action={{ label: "Open the request", href: url }}
      >
        <Text style={text.body}>
          {decision === "APPROVED"
            ? `${decidedBy} approved ${title}. It has gone to HolyPearls for a quote.`
            : decision === "REJECTED"
              ? `${decidedBy} declined ${title}.`
              : `${decidedBy} asked for changes to ${title}. Change it and send it for approval again.`}
        </Text>
        {note ? <Text style={text.body}>{note}</Text> : null}
      </Layout>
    ),
  }),
  collection_submitted: define({
    label: "Group collection answers sent",
    carriesSecret: false,
    data: z.object({ collection: z.string(), organization: z.string(), summary: z.array(z.string()).max(10), deadline: z.string().optional() }),
    subject: ({ collection }) => `Your answers for ${collection}`,
    render: ({ collection, organization, summary, deadline }) => (
      <Layout preview={`You're in: ${collection}`} title={`You're in: ${collection}`}>
        <Text style={text.body}>Your answers are part of {organization}&apos;s team order. Only you and your organiser see them.</Text>
        {summary.map((line) => (
          <Text key={line} style={text.body}>
            {line}
          </Text>
        ))}
        <Text style={text.body}>{deadline ? `You can change them until ${deadline} from the link we sent when you started.` : "Use the link we sent when you started to see them again."}</Text>
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
