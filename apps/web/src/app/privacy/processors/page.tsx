import type { Metadata } from "next";
import { SiteShell } from "../../../components/site/SiteShell";
import s from "../privacy.module.css";

export const metadata: Metadata = {
  title: "Who processes your data",
  description: "The companies that process personal data for Holypearls.",
  robots: { index: false },
};

/** Processor list (Pen 136 · TDnMA desktop, HBwdg mobile). Regions are open until ADR-015 and Sentry's region are confirmed. */
const PROCESSORS: [name: string, purpose: string, region: string][] = [
  ["Paystack", "Payments", "Nigeria"],
  ["Resend", "Email", "United States"],
  ["Cloudflare R2", "File storage", "Hosting region (ADR-015, to be decided)"],
  ["Neon", "Database", "Hosting region (ADR-015)"],
  ["Vercel", "Website hosting", "Hosting region (ADR-015)"],
  ["API host", "Application server", "Hosting region (ADR-015)"],
  ["Sentry", "Error monitoring", "To be confirmed"],
];

export default function ProcessorsPage() {
  return (
    <SiteShell>
      <section className={s.page} aria-labelledby="processors-title">
        <p className={s.kicker}>TECH-06 §12 · TECH-07 §3</p>
        <h1 id="processors-title" className={s.title}>
          Who processes your data
        </h1>
        <ul className={`${s.panel} ${s.list}`}>
          {PROCESSORS.map(([name, purpose, region]) => (
            <li key={name} className={s.line}>
              <span className={s.name}>{name}</span>
              <span className={s.sub}>
                {purpose} · {region}
              </span>
            </li>
          ))}
        </ul>
        <a className={s.link} href="/privacy">
          Back to the privacy notice
        </a>
      </section>
    </SiteShell>
  );
}
