import type { Metadata } from "next";
import { SiteShell } from "../../components/site/SiteShell";
import s from "./credits.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Photo credits",
  description: "Credits for the stand-in photography used on the Holypearls site.",
  robots: { index: false },
};

/*
 * Stand-in photography (owner design canvas · Photo credits board). Creative
 * Commons photos found through Openverse, used until Holypearls' own shoot.
 * BY and BY-SA licences require this credit; BY-SA also requires sharing
 * adaptations under the same licence.
 */
const CREDITS: [title: string, creator: string, licence: string, source: string][] = [
  ["Man’s Wrapper (Kente Cloth)", "Unknown creator", "CC0 1.0", "https://www.rawpixel.com/image/8551519/mans-wrapper-kente-cloth"],
  ["Erdoğan Düğme", "Jorge Franganillo", "CC BY 2.0", "https://www.flickr.com/photos/46191841@N00/11588328685"],
  ["Wool Thread Spools", "Steve Snodgrass", "CC BY 2.0", "https://www.flickr.com/photos/10710442@N08/15807233565"],
  ["Stack of folded t-shirts", "Unknown creator", "CC0 1.0", "https://www.rawpixel.com/image/11515802/stack-folded-t-shirts"],
  ["Lasser embroidery machines", "akusrianto", "CC BY 2.0", "https://www.flickr.com/photos/117167485@N05/12458199464"],
  ["sew little time", "MissMessie", "CC BY-SA 2.0", "https://www.flickr.com/photos/97335141@N00/4552792626"],
  ["Women wearing a teal polo shirt", "Rydale Country Clothing", "CC BY 2.0", "https://www.flickr.com/photos/182435424@N02/52362118765"],
  ["Free School", "auspices", "CC BY 2.0", "https://www.flickr.com/photos/26432632@N08/14217652698"],
  ["Cydcor Conference", "Cydcor", "CC BY 2.0", "https://www.flickr.com/photos/47341270@N03/9323706488"],
  ["moo business cards", "osde8info", "CC BY-SA 2.0", "https://www.flickr.com/photos/8764442@N07/2638381777"],
  ["Plaid Baseball Cap", "Menswear Market", "CC BY 2.0", "https://www.flickr.com/photos/85546319@N04/15600797831"],
  ["2018, Mumbai, India, sewing workshop", "t66t", "CC BY 2.0", "https://www.flickr.com/photos/157015973@N08/44311337395"],
  ["Arriel at the digital sewing workshop", "colleen_taugher", "CC BY 2.0", "https://www.flickr.com/photos/70268842@N00/227491151"],
  ["GIT_lifestyle2", "specialwheat", "CC BY-SA 2.0", "https://www.flickr.com/photos/191883982@N03/52068124395"],
  ["Event team T-shirts ready for action at PHP Camp 2024", "Makarand Mane", "CC0 1.0", "https://wordpress.org/photos/photo/4796710dba/"],
  ["20111031-FNS-LSC-0143", "USDAgov", "CC BY 2.0", "https://www.flickr.com/photos/41284017@N08/6758757633"],
  ["Women sewing workshop", "hdptcar", "CC BY 2.0", "https://www.flickr.com/photos/8788342@N08/2399257276"],
  ["Victoria Nwogu’s African Fashion", "Victoria Nwogu", "CC BY-SA 4.0", "https://commons.wikimedia.org/w/index.php?curid=113654558"],
];

export default function PhotoCreditsPage() {
  return (
    <SiteShell>
      <section className={s.page} aria-labelledby="credits-title">
        <p className={s.eyebrow}>Photo credits</p>
        <h1 id="credits-title" className={s.title}>
          Stand-in photography
        </h1>
        <p className={s.lede}>Until our own photos are ready, some pages use Creative Commons photos. Thank you to the photographers below.</p>
        <ul className={s.list}>
          {CREDITS.map(([title, creator, licence, source]) => (
            <li key={source} className={s.item}>
              <span className={s.name}>{title}</span>
              <span className={s.meta}>
                {creator} · {licence} ·{" "}
                <a className={s.link} href={source} rel="noopener noreferrer">
                  Source
                </a>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </SiteShell>
  );
}
