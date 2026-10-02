import type { AboutData } from "@holypearls/contracts";
import { ArrowRight, Check, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import c from "../../components/content/content.module.css";
import { Photo } from "../../components/content/Parts";
import { JsonLd } from "../../components/seo/JsonLd";
import { SiteShell } from "../../components/site/SiteShell";
import { getContentPage } from "../../lib/content";
import { breadcrumbLd, organizationLd, pageMetadata } from "../../lib/seo";

// Rendered per request (like the home page): the build has no API to read published content from.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getContentPage("ABOUT", "about");
  if (!page) return { title: "About", robots: { index: false } };
  return pageMetadata({ kind: "page", name: page.title, path: "/about", summary: page.summary, seoTitle: page.seo.title, seoDescription: page.seo.description, indexable: page.seo.indexable, image: page.hero });
}

/**
 * About (Pen 59 · LXw1v): what HolyPearls makes itself and what it manages,
 * how every order is made, and where it delivers. No invented history or
 * "biggest" claims; team photos appear only with consent.
 */
export default async function AboutPage() {
  const page = await getContentPage("ABOUT", "about");
  if (!page) notFound();
  const data = page.data as Partial<AboutData>;
  return (
    <SiteShell>
      <JsonLd data={[{ ...organizationLd(), "@type": "Organization" }, breadcrumbLd([{ name: "Home", path: "/" }, { name: "About", path: "/about" }])]} />
      <section className={`${c.aboutHero} ${c.pad}`} aria-labelledby="about-title">
        <div>
          <p className={c.noteSmall}>{page.title}</p>
          <h1 id="about-title" className={c.h1Page} data-enter>
            {data.headline || page.title}
          </h1>
        </div>
        <p className={c.leadLarge}>{page.summary}</p>
      </section>
      {page.hero ? <Photo image={page.hero} className={c.aboutPhoto} eager /> : null}
      {data.capabilities?.length ? (
        <section className={`${c.whatWeMake} ${c.pad}`} aria-labelledby="make-title">
          <div className={c.whatWeMakeIntro}>
            <h2 id="make-title" className={c.h2Large}>
              {data.capabilitiesTitle || "What we make"}
            </h2>
            {data.capabilitiesIntro ? <p className={c.lead}>{data.capabilitiesIntro}</p> : null}
          </div>
          <ul className={c.capabilities}>
            {data.capabilities.map((capability) => (
              <li key={capability.name} className={c.capability}>
                <p className={c.capabilityName}>{capability.name}</p>
                <p className={c.capabilityDetail}>{capability.detail}</p>
                <span className={capability.own ? c.tagOwn : c.tagManaged}>{capability.own ? "OUR OWN PRODUCTION" : "MANAGED BY HOLYPEARLS"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.steps?.length ? (
        <section id="how-we-work" className={`${c.howMade} ${c.pad}`} aria-labelledby="how-title">
          <h2 id="how-title" className={c.h2Large}>
            {data.stepsTitle || "How every order is made"}
          </h2>
          <ol className={c.howSteps}>
            {data.steps.map((step) => (
              <li key={step.title} className={c.howStep}>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <div className={`${c.aboutTrio} ${c.pad}`}>
        {data.teamTitle ? (
          <section className={c.team} aria-labelledby="team-title">
            <div className={c.teamSlot}>
              <Users size={32} aria-hidden="true" />
              <p className={c.eyebrow}>TEAM PHOTOS AND NAMES · ADDED WITH CONSENT</p>
            </div>
            <h2 id="team-title" className={c.trioTitle}>
              {data.teamTitle}
            </h2>
            {data.teamBody ? <p className={c.note}>{data.teamBody}</p> : null}
          </section>
        ) : null}
        {data.reachTitle ? (
          <section className={c.reach} aria-labelledby="reach-title">
            <MapPin size={24} aria-hidden="true" />
            <h2 id="reach-title" className={c.trioTitle}>
              {data.reachTitle}
            </h2>
            {data.reachBody ? <p className={c.note}>{data.reachBody}</p> : null}
          </section>
        ) : null}
        {data.values?.length ? (
          <section className={c.values} aria-labelledby="values-title">
            <h2 id="values-title" className={c.trioTitle}>
              {data.valuesTitle || "How we work"}
            </h2>
            <ul>
              {data.values.map((value) => (
                <li key={value}>
                  <Check size={16} aria-hidden="true" />
                  {value}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      {page.body ? <div className={`${c.prose} ${c.pad}`} dangerouslySetInnerHTML={{ __html: page.body }} /> : null}
      <section className={`${c.aboutCta} ${c.pad} ${c.onDark}`} aria-labelledby="about-cta">
        <h2 id="about-cta">{data.ctaTitle || "Tell us what you need made."}</h2>
        <a className={c.outlineLight} href="/start">
          Start a project
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </section>
    </SiteShell>
  );
}
