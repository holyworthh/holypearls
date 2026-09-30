"use client";

import { type Configurator as ConfiguratorData, type PublicImage, SOURCING_LABEL } from "@holypearls/contracts";
import { ArrowRight, Layers, MessageCircleQuestion, ZoomIn } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import styles from "./garment.module.css";
import { ImageViewer } from "./ImageViewer";

type Route = "SOURCE_CUSTOMIZE" | "MAKE_FROM_SCRATCH" | "CUSTOMER_SUPPLIED";

/*
 * Route copy only: `meta` from Pen 19 (desktop), `short` from Pen 20 (mobile).
 * Which routes a product offers comes from the API (configurator.allowedRoutes).
 * Pen's "from 20" is left out: a scratch minimum isn't product data yet.
 */
const ROUTE_COPY: Record<Route, { title: string; meta: string; short: string }> = {
  SOURCE_CUSTOMIZE: { title: SOURCING_LABEL.SOURCE_CUSTOMIZE, meta: "Your branding", short: "Quality blank" },
  MAKE_FROM_SCRATCH: { title: SOURCING_LABEL.MAKE_FROM_SCRATCH, meta: "Quote · your fabric and fit", short: "Your fabric and fit · quote" },
  CUSTOMER_SUPPLIED: { title: SOURCING_LABEL.CUSTOMER_SUPPLIED, meta: "Accepted after inspection", short: "Your garments, after inspection" },
};
const isRoute = (value: string): value is Route => value in ROUTE_COPY;

/** Swatches shown before "+N" on phones (Pen 20). */
const PHONE_SWATCHES = 6;

/** Gallery with vertical thumbnails (Pen 19); on phones a full-bleed swipe with position dots (Pen 20). */
export function GarmentGallery({ images, name, fallback }: { images: PublicImage[]; name: string; fallback: string[] }) {
  const sources = images.length ? images.map((image) => ({ url: image.url, thumb: image.thumbnailUrl, alt: image.alt })) : fallback.map((url) => ({ url, thumb: url, alt: "" }));
  const [index, setIndex] = useState(0);
  const main = sources[index];
  const [shown, setShown] = useState(0);
  const [viewing, setViewing] = useState(false);
  const view = (position: number) => {
    setIndex(position);
    setViewing(true);
  };
  const strip = useRef<HTMLDivElement>(null);
  const onStrip = () => {
    const element = strip.current;
    if (element) setShown(Math.round(element.scrollLeft / Math.max(element.clientWidth, 1)));
  };
  return (
    <div className={styles.gallery}>
      <div className={styles.swipe}>
        <div className={styles.strip} ref={strip} onScroll={onStrip} tabIndex={0} aria-label={`${name} images, swipe for more`}>
          {sources.map((image, position) => (
            <img key={image.url} src={image.url} alt={image.alt || name} loading="lazy" onClick={() => view(position)} />
          ))}
        </div>
        {sources.length > 1 ? (
          <span className={styles.dots} aria-hidden="true">
            {sources.map((image, position) => (
              <span key={image.url} className={position === shown ? styles.dotOn : undefined} />
            ))}
          </span>
        ) : null}
      </div>
      {sources.length > 1 ? (
        <ul className={styles.thumbs} aria-label={`${name} images`}>
          {sources.slice(0, 6).map((image, position) => (
            <li key={image.url}>
              <button
                type="button"
                className={styles.thumb}
                style={{ backgroundImage: `url("${image.thumb}")` }}
                aria-pressed={position === index}
                aria-label={`Show image ${position + 1}${image.alt ? `: ${image.alt}` : ""}`}
                onClick={() => setIndex(position)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.main}>
        {main ? <img key={main.url} className={styles.mainImg} src={main.url} alt={main.alt || name} onClick={() => view(index)} /> : null}
        <span className={styles.mainTop}>
          <span className={styles.ticket}>COLOUR AND LOGO CONFIRMED IN YOUR PROOF</span>
          {main ? (
            <button type="button" className={styles.zoom} onClick={() => view(index)} aria-label="View images full size" aria-haspopup="dialog">
              <ZoomIn size={14} aria-hidden="true" />
            </button>
          ) : null}
        </span>
        <span className={styles.count}>
          {index + 1} / {sources.length}
        </span>
      </div>
      <ImageViewer images={sources} name={name} open={viewing} index={index} onIndex={setIndex} onClose={() => setViewing(false)} />
    </div>
  );
}

/**
 * The decision panel's choices (Pen 19): colour swatches and how it's made,
 * then "Configure yours" opens the configurator with them already chosen.
 */
export function GarmentStart({ slug, data, facts, compareHref }: { slug: string; data: ConfiguratorData; facts?: ReactNode; compareHref?: string }) {
  const colour = data.options.find((option) => option.key === "colour");
  const [chosen, setChosen] = useState(colour?.values.find((value) => value.isDefault)?.key ?? colour?.values[0]?.key ?? "");
  // The product page offers the production routes; Help Me Choose waits in the configurator.
  const routes = data.allowedRoutes.filter(isRoute).map((value) => ({ value, ...ROUTE_COPY[value] }));
  const [route, setRoute] = useState<Route | null>(routes[0]?.value ?? null);
  const href = `/products/${slug}/configure?${new URLSearchParams({ ...(route ? { sourcing: route } : {}), ...(chosen ? { colour: chosen } : {}) })}`;
  const label = colour?.values.find((value) => value.key === chosen)?.label;
  const [allColours, setAllColours] = useState(false);
  const hidden = colour ? colour.values.length - PHONE_SWATCHES : 0;
  return (
    <>
      {colour ? (
        <fieldset className={`${styles.group} ${styles.colourGroup}`}>
          <legend className={styles.groupHead}>
            <span>
              Colour <span className={styles.groupNote}>{label} · colour range confirmed per route</span>
            </span>
          </legend>
          <div className={`${styles.swatches} ${allColours ? styles.allSwatches : ""}`}>
            {colour.values.map((value, position) => (
              <label key={value.key} className={`${styles.swatch} ${position >= PHONE_SWATCHES && value.key !== chosen ? styles.extraSwatch : ""}`} title={value.label}>
                <input type="radio" name="colour" value={value.key} checked={chosen === value.key} onChange={() => setChosen(value.key)} aria-label={value.label} />
                <span className={styles.chip} style={value.swatch ? { background: value.swatch } : undefined} />
              </label>
            ))}
            {hidden > 0 && !allColours ? (
              <button type="button" className={styles.moreSwatches} onClick={() => setAllColours(true)} aria-label={`Show ${hidden} more colours`}>
                +{hidden}
              </button>
            ) : null}
          </div>
        </fieldset>
      ) : null}
      {facts}
      {routes.length ? (
        <fieldset className={`${styles.group} ${styles.routesGroup}`}>
          <legend className={styles.groupHead}>
            How should we make it?
            {compareHref ? (
              <a className={styles.groupLink} href={compareHref}>
                Compare routes
              </a>
          ) : null}
        </legend>
        {routes.map((option) => (
          <label key={option.value} className={styles.route}>
            <input type="radio" name="route" value={option.value} checked={route === option.value} onChange={() => setRoute(option.value)} />
            <span className={styles.ring} aria-hidden="true" />
            <span className={styles.routeText}>
              <span className={styles.routeTitle}>{option.title}</span>
              <span className={`${styles.routeMeta} ${styles.wide}`}>{withLead(option.meta, option.value, data)}</span>
              <span className={`${styles.routeMeta} ${styles.narrow}`}>{withLead(option.short, option.value, data)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      ) : null}
      <div className={styles.actions}>
        <a className={styles.configure} href={href} id="configure-yours">
          Configure yours
          <ArrowRight size={18} aria-hidden="true" />
        </a>
        <div className={styles.secondary}>
          <a className={styles.outline} href={`/contact?topic=project&product=${slug}`}>
            <Layers size={16} aria-hidden="true" />
            Add to a Project
          </a>
          <a className={styles.quiet} href={`/contact?topic=product&product=${slug}`}>
            <MessageCircleQuestion size={16} aria-hidden="true" />
            Ask us a question
          </a>
        </div>
      </div>
    </>
  );
}

const withLead = (text: string, route: string, data: ConfiguratorData) =>
  route === "SOURCE_CUSTOMIZE" && data.leadDays ? `${text} · ${data.leadDays.min}–${data.leadDays.max} working days` : text;

/**
 * The phone's sticky Configure bar (Pen 20): it appears only once the in-page
 * "Configure yours" button has scrolled out of view, so it never covers the form.
 */
export function StickyConfigure({ state, price, href }: { state: string; price: string | null; href: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const target = document.getElementById("configure-yours");
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry!.isIntersecting && entry!.boundingClientRect.top < 0));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return (
    <div className={`${styles.stickyBar} ${visible ? styles.stickyOn : ""}`} aria-hidden={!visible}>
      <span>
        <span className={styles.stickyState}>{price ? `${state} · FROM` : state}</span>
        {price ? <strong className={styles.stickyPrice}>{price}</strong> : null}
      </span>
      <a className={styles.stickyCta} href={href} tabIndex={visible ? 0 : -1}>
        Configure
      </a>
    </div>
  );
}
