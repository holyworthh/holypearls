import type { PublicImage } from "@holypearls/contracts";
import c from "./content.module.css";

/** Breadcrumbs as Pen draws them: "Home / Projects", the path a person takes (Stage 3 §60). */
export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className={c.crumbs} aria-label="Breadcrumb">
      <ol>
        {items.map((item) => (
          <li key={item.label} aria-current={item.href ? undefined : "page"}>
            {item.href ? <a href={item.href}>{item.label}</a> : item.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A photo slot: the image covers it; sand shows until it loads. Decorative unless it has alt text. */
export function Photo({ image, className, eager = false, children }: { image: PublicImage | null; className?: string; eager?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`${c.photo} ${className ?? ""}`}>
      {image ? <img src={image.url} alt={image.alt} loading={eager ? "eager" : "lazy"} decoding="async" /> : null}
      {children}
    </div>
  );
}
