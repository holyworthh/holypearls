import type { ProjectData } from "@holypearls/contracts";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import c from "../../components/content/content.module.css";
import { Crumbs, Photo } from "../../components/content/Parts";
import { JsonLd } from "../../components/seo/JsonLd";
import { SiteShell } from "../../components/site/SiteShell";
import { getContentIndex } from "../../lib/content";
import { breadcrumbLd, pageMetadata } from "../../lib/seo";

// Rendered per request (like the home page): the build has no API to read published content from.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  kind: "page",
  name: "Projects",
  path: "/projects",
  seoTitle: "Branding projects in Nigeria: uniforms, events, launches | HolyPearls",
  summary: "Pick the closest project. HolyPearls suggests the items and quantities and sends one quote. Delivery across Nigeria.",
});

/**
 * Projects directory (Pen 12 · xiB3h, PUB-FR-011): outcome-led, not a product
 * grid. Two lead outcomes at double height, then rows of 3 and 4; no prices,
 * because projects are always quoted.
 */
export default async function ProjectsPage() {
  const projects = await getContentIndex("PROJECT");
  return (
    <SiteShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Projects", path: "/projects" }])} />
      <div className={`${c.projectsHead} ${c.pad}`}>
        <div className={c.projectsHeadText}>
          <Crumbs items={[{ label: "Home", href: "/" }, { label: "Projects" }]} />
          <h1 className={c.h1} data-enter>
            What are you putting together?
          </h1>
        </div>
        <div className={c.projectsHeadAside}>
          <p className={c.lead}>Pick the closest project. We&apos;ll suggest the items, quantities and a quote, and you can change anything before you pay.</p>
          <a className={c.red} href="/start">
            Start a project
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
      <ul className={`${c.projectGrid} ${c.pad}`} role="list">
        {projects.map((project, index) => {
          const data = project.data as Partial<ProjectData>;
          const lead = index < 2;
          return (
            <li key={project.slug} className={`${c.card} ${c.projectCard} ${lead ? c.lead : ""}`}>
              <Photo image={project.image ? { ...project.image, alt: "" } : null} eager={index < 2}>
                <span className={c.ticket} aria-hidden="true">
                  PROJECT
                </span>
              </Photo>
              <div className={c.projectText}>
                <h2 className={c.projectTitle}>
                  <a className={c.stretch} href={project.href}>
                    {project.title}
                  </a>
                </h2>
                <p className={c.cardBody}>{project.summary}</p>
                {data.productHints ? <p className={c.hints}>{data.productHints}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <section className={`${c.custom} ${c.pad} ${c.onDark}`} aria-labelledby="custom-title">
        <div className={c.customText}>
          <h2 id="custom-title">Something else?</h2>
          <p>Tell us what it&apos;s for, roughly how many and when. A person reads every brief and replies with suggestions and a quote.</p>
        </div>
        <div className={c.actions}>
          <a className={c.red} href="/contact?topic=project">
            Tell us something else
            <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a className={c.outlineLight} href="/resources/after-you-accept-a-quote">
            See how projects work
          </a>
        </div>
      </section>
    </SiteShell>
  );
}
