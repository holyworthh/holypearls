import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { theme } from "../theme.js";

const styles = {
  body: { margin: 0, padding: theme.space(24), backgroundColor: theme.bone, fontFamily: theme.fontFamily, color: theme.ink },
  container: {
    maxWidth: "560px",
    margin: "0 auto",
    padding: theme.space(32),
    backgroundColor: theme.paper,
    border: `1px solid ${theme.line}`,
    borderRadius: "10px",
  },
  brand: { margin: 0, fontSize: "19px", fontWeight: 600, color: theme.ink },
  title: { margin: `${theme.space(24)} 0 ${theme.space(12)}`, fontSize: theme.text.title, fontWeight: 600, lineHeight: 1.2 },
  button: {
    display: "inline-block",
    padding: `${theme.space(12)} ${theme.space(20)}`,
    borderRadius: theme.radius,
    backgroundColor: theme.accent,
    color: theme.paper,
    fontSize: theme.text.body,
    fontWeight: 600,
    textDecoration: "none",
  },
  footer: { margin: 0, fontSize: theme.text.support, color: theme.graphite, lineHeight: 1.5 },
} as const;

export const text = {
  body: { margin: `0 0 ${theme.space(16)}`, fontSize: theme.text.body, lineHeight: 1.5, color: theme.ink },
  support: { margin: `0 0 ${theme.space(12)}`, fontSize: theme.text.support, lineHeight: 1.5, color: theme.graphite },
  code: {
    margin: `${theme.space(8)} 0 ${theme.space(20)}`,
    fontFamily: theme.monoFamily,
    fontSize: theme.text.code,
    fontWeight: 600,
    letterSpacing: "6px",
    color: theme.ink,
  },
  quote: {
    margin: `0 0 ${theme.space(16)}`,
    padding: theme.space(16),
    backgroundColor: theme.bone,
    borderRadius: theme.radius,
    fontSize: theme.text.body,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
  },
};

export interface LayoutProps {
  preview: string;
  title: string;
  children: ReactNode;
  action?: { label: string; href: string };
}

/**
 * Shared email frame. Emails never ask for a password or a code the person
 * didn't request (TECH-06 §10), and every email links straight to its action.
 */
export function Layout({ preview, title, children, action }: LayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>HolyPearls</Text>
          <Text style={styles.title}>{title}</Text>
          {children}
          {action ? (
            <Section style={{ margin: `${theme.space(8)} 0 ${theme.space(24)}` }}>
              <Button href={action.href} style={styles.button}>
                {action.label}
              </Button>
            </Section>
          ) : null}
          <Hr style={{ borderColor: theme.line, margin: `${theme.space(24)} 0 ${theme.space(16)}` }} />
          <Text style={styles.footer}>
            HolyPearls will never ask for your password by email. If you didn&apos;t expect this email, you can ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
