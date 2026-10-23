import { Notice } from "@holypearls/ui";
import type { Metadata } from "next";
import { SiteShell } from "../../components/site/SiteShell";
import s from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What Holypearls collects, why, how long it is kept and who processes it.",
  // The wording is a placeholder until a data protection lawyer confirms it (TECH-06 §12).
  robots: { index: false },
};

/** Privacy notice (Pen 136 · TLRc6 desktop, nDtGs mobile). Placeholder copy, word for word from the design. */
const SECTIONS: { id: string; title: string; body: string; processors?: boolean }[] = [
  { id: "collect", title: "What we collect", body: "Contact details, delivery addresses, order and artwork files, payment references (never card numbers)." },
  { id: "why", title: "Why we use it", body: "To carry out your order (contract). Marketing emails only with your consent, off by default." },
  { id: "keep", title: "How long we keep it", body: "Unused uploads 7 days · abandoned drafts 90 days · order, payment and tax records 7 years." },
  { id: "who", title: "Who processes it", body: "Paystack, Resend, Cloudflare, Neon, Vercel, our API host and Sentry.", processors: true },
  { id: "rights", title: "Your rights", body: "Ask for a copy of your data or ask us to delete it. We reply within 30 days." },
];

export default function PrivacyPage() {
  return (
    <SiteShell>
      <section className={s.page} aria-labelledby="privacy-title">
        <p className={s.kicker}>Last updated — date to be set · placeholder wording</p>
        <h1 id="privacy-title" className={s.title}>
          Privacy notice
        </h1>
        <Notice tone="warning" title="Placeholder copy">
          <p>Legal wording will be confirmed with a data protection lawyer before launch.</p>
        </Notice>
        <div className={s.columns}>
          <div className={s.main}>
            {SECTIONS.map((section) => (
              <section key={section.id} id={section.id} className={s.panel} aria-labelledby={`${section.id}-title`}>
                <h2 id={`${section.id}-title`} className={s.panelTitle}>
                  {section.title}
                </h2>
                <p className={s.body}>
                  {section.body}
                  {section.processors ? (
                    <>
                      {" "}
                      See the{" "}
                      <a className={s.link} href="/privacy/processors">
                        processor list
                      </a>
                      .
                    </>
                  ) : null}
                </p>
              </section>
            ))}
          </div>
          <aside className={s.rail}>
            <nav className={s.panel} aria-labelledby="toc-title">
              <h2 id="toc-title" className={s.panelTitle}>
                On this page
              </h2>
              <div className={s.toc}>
                {SECTIONS.map((section) => (
                  <a key={section.id} className={s.link} href={`#${section.id}`}>
                    {section.title}
                  </a>
                ))}
                <a className={s.link} href="/contact">
                  Contact
                </a>
              </div>
            </nav>
          </aside>
        </div>
      </section>
    </SiteShell>
  );
}
