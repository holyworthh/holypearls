import { type HelpContext, type HelpTopic, helpTopicSchema, meSchema } from "@holypearls/contracts";
import { Mail, Map as MapIcon, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import { ContactForm } from "../../components/content/ContactForm";
import s from "../../components/content/contact.module.css";
import { JsonLd } from "../../components/seo/JsonLd";
import { SiteShell } from "../../components/site/SiteShell";
import { hasSessionCookie, serverApi } from "../../lib/server-api";
import { BUSINESS, breadcrumbLd, organizationLd, pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({
  kind: "page",
  name: "Contact us",
  path: "/contact",
  seoTitle: "Contact HolyPearls",
  summary: "Tell us what you need and we'll reply by email or phone. Production in Lagos, delivery across Nigeria.",
});

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const slug = (value: string) => (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80 ? value : null);

/** Older links name a topic by page ("order", "project"); they map onto the four enquiry types. */
const LEGACY: Record<string, HelpTopic> = {
  order: "EXISTING_ORDER",
  "custom-request": "NEW_ORDER",
  project: "NEW_ORDER",
  quote: "NEW_ORDER",
  product: "NEW_ORDER",
  artwork: "EXISTING_ORDER",
  delivery: "SOMETHING_ELSE",
};

/**
 * Contact (Pen 60 · Czozq; PUB-FR-015, PRD-00 §18): a structured enquiry that
 * carries the page it came from, beside the ways to reach us. Phone, email
 * and address are shown only once verified (PUB-SEO-006); until then the
 * cards say so and there's no map.
 */
export default async function ContactPage({ searchParams }: Params) {
  const params = await searchParams;
  const raw = one(params.topic);
  const topic = helpTopicSchema.safeParse(raw.toUpperCase()).data ?? LEGACY[raw] ?? "NEW_ORDER";
  const product = slug(one(params.product));
  const project = slug(one(params.project));
  const need = one(params.need).slice(0, 4000) || one(params.q).slice(0, 100);
  const context: HelpContext = {
    page: { path: "/contact", title: "Contact us" },
    ...(raw ? { step: raw.slice(0, 60) } : {}),
    ...(product ? { product: { id: product, label: product } } : {}),
    ...(project ? { project: { id: project, label: project } } : {}),
  };
  const me = (await hasSessionCookie()) ? await serverApi("/v1/me", meSchema) : null;
  const signedIn = me?.ok && !me.data.isStaff ? { name: me.data.name, email: me.data.email } : null;
  return (
    <SiteShell>
      <JsonLd data={[organizationLd(), breadcrumbLd([{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }])]} />
      <div className={s.body}>
        <section className={s.enquiry} aria-labelledby="contact-title">
          <h1 id="contact-title" className={s.h1} data-enter>
            Contact us
          </h1>
          <p className={s.lead}>Tell us what you need and we&apos;ll reply by email or phone. For a full quote, a structured project is faster.</p>
          <ContactForm initialTopic={topic} initialNeed={need} context={context} signedIn={signedIn} />
        </section>
        <aside className={s.options} aria-label="Other ways to reach us">
          <div className={s.option}>
            <Mail size={22} aria-hidden="true" />
            <div>
              <p className={s.optionTitle}>Email</p>
              <p className={s.optionBody}>Address confirmed before launch</p>
            </div>
          </div>
          <div className={s.option}>
            <Phone size={22} aria-hidden="true" />
            <div>
              <p className={s.optionTitle}>Phone</p>
              <p className={s.optionBody}>Number confirmed before launch</p>
            </div>
          </div>
          <div className={s.option}>
            <MessageCircle size={22} aria-hidden="true" />
            <div>
              <p className={s.optionTitle}>WhatsApp</p>
              <p className={s.optionBody}>Offered once verified; never the only way to reach us</p>
            </div>
          </div>
          <div className={s.area}>
            <p className={s.optionTitle}>Service area</p>
            <p className={s.optionBody}>Production in {BUSINESS.city}. Delivery across Nigeria; international on request.</p>
            <div className={s.mapSlot}>
              <MapIcon size={22} aria-hidden="true" />
              <p>MAP SHOWN ONCE THE ADDRESS IS VERIFIED</p>
            </div>
          </div>
        </aside>
      </div>
    </SiteShell>
  );
}
