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
