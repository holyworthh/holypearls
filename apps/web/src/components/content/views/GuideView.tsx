import { GUIDE_TOPIC_LABEL, type GuideData, type PublicContentPage } from "@holypearls/contracts";
import { BookOpen, ArrowRight } from "lucide-react";
import { RichText } from "../../../components/content/Blocks";
import c from "../../../components/content/content.module.css";
import { Crumbs, Photo } from "../../../components/content/Parts";
import { JumpMenu, TocNav } from "../../../components/content/Toc";
import { JsonLd } from "../../../components/seo/JsonLd";
import { SiteShell } from "../../../components/site/SiteShell";
import { getContentIndex } from "../../../lib/content";
import { withHeadingIds } from "../../../lib/rich-text";
import { articleLd, breadcrumbLd } from "../../../lib/seo";

/**
 * Guide (Pen 57 · nbOI4 desktop, 58 · C43mU9 phone; PUB-FR-013): reading
 * first, with sticky contents on desktop and a jump menu on phones. Products
 * and projects to put it into practice come after the text.
 */
export async function GuideView({ page }: { page: PublicContentPage }) {
  const data = page.data as Partial<GuideData>;
  const topic = data.topic ? GUIDE_TOPIC_LABEL[data.topic] : "Guides";
  const { html, headings } = withHeadingIds(page.body);
  const related = [
    ...page.products.slice(0, 3).map((product) => ({ key: `p-${product.slug}`, eyebrow: "PRODUCT", title: product.name, href: `/products/${product.slug}`, image: product.image })),
    ...page.linkedPages.filter((card) => card.type !== "GUIDE").map((card) => ({ key: card.href, eyebrow: card.type === "PROJECT" ? "PROJECT" : "OUR WORK", title: card.title, href: card.href, image: card.image })),
  ].slice(0, 3);
  const guides = await getContentIndex("GUIDE");
  const linkedGuides = page.linkedPages.filter((card) => card.type === "GUIDE");
  const more = (linkedGuides.length ? linkedGuides : guides.filter((guide) => guide.slug !== page.slug && guide.data.topic === data.topic)).slice(0, 3);
  return (
    <SiteShell>
      <JsonLd data={[articleLd(page), breadcrumbLd([{ name: "Resources", path: "/resources" }, { name: topic, path: `/resources?topic=${(data.topic ?? "ordering").toLowerCase()}` }, { name: page.title, path: page.href }])]} />
      <header className={c.articleHead}>
        <div className={c.articleHeadInner}>
          <Crumbs items={[{ label: "Resources", href: "/resources" }, { label: topic, href: `/resources?topic=${(data.topic ?? "ordering").toLowerCase()}` }]} />
          <h1 className={c.articleTitle} data-enter>
            {page.title}
          </h1>
          <p className={c.articleDek}>{page.summary}</p>
          {headings.length || data.readingNote ? (
            <p className={c.articleMeta}>
              {[headings.length ? `${headings.length} sections` : "", data.readingNote ?? ""].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </header>
      <div className={c.articleBody}>
        <TocNav headings={headings} />
        <article className={c.article}>
          <JumpMenu headings={headings} />
          {page.hero ? <Photo image={page.hero} className={c.articleHero} eager /> : null}
          <RichText html={html} className={c.articleText} guide={data} />
          {related.length || more.length ? (
            <section className={c.related} aria-labelledby="practice-title">
              <h2 id="practice-title">Put it into practice</h2>
              {related.length ? (
                <ul className={c.relatedRow}>
                  {related.map((item) => (
                    <li key={item.key} className={`${c.card} ${c.relatedCard}`}>
                      <Photo image={item.image ? { ...item.image, alt: "" } : null} />
                      <p className={c.eyebrow}>{item.eyebrow}</p>
                      <p className={c.relatedName}>
                        <a className={c.stretch} href={item.href}>
                          {item.title}
                        </a>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {more.length ? (
                <ul className={c.moreGuides} aria-label="More guides">
                  {more.map((guide) => (
                    <li key={guide.slug}>
                      <a href={guide.href}>
                        <BookOpen size={16} aria-hidden="true" />
                        <span>{guide.title}</span>
                        <ArrowRight size={16} aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </article>
      </div>
    </SiteShell>
  );
}

