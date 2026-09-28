import type { StorefrontNavigation } from "@holypearls/contracts";

export interface MenuLink {
  href: string;
  label: string;
}

export interface MenuColumn {
  heading: string;
  links: MenuLink[];
  all?: MenuLink;
}

export interface TopItem {
  label: string;
  href: string;
  /** Items with a mega-menu open a panel instead of navigating. */
  menu?: { columns: MenuColumn[]; feature: { eyebrow: string; title: string; link: MenuLink } };
}

export const categoryHref = (slug: string) => `/categories/${slug}`;

/**
 * Goals for "Shop by need" (Pen HP/Nav/MegaMenu) and the homepage's "What do you
 * need?". Each goes to the category hub that serves it until the project pages
 * arrive (T02-06, T05-01).
 */
export const GOALS: { label: string; body: string; href: string }[] = [
  { label: "Staff & uniforms", body: "Polos, aprons and workwear for your whole team", href: categoryHref("apparel-garment-production") },
  { label: "Events", body: "Backdrops, roll-ups, name badges and crew shirts", href: categoryHref("large-format-signage-displays") },
  { label: "Business launch", body: "Business cards, stationery, labels and signs", href: categoryHref("print-business-stationery") },
  { label: "Packaging", body: "Paper bags, mailers and presentation boxes", href: categoryHref("bags-packaging") },
  { label: "Gifts & merchandise", body: "Mugs, bottles and welcome packs for staff or clients", href: categoryHref("promotional-products-corporate-gifts") },
];

/**
 * Main navigation (PUB-FR-003): Products, Projects, Apparel, Print & Display,
 * Our Work and Resources. The Products mega-menu groups categories, the
 * admin-managed popular products and goals (PUB-FR-004).
 */
export function buildNavigation(data: StorefrontNavigation): TopItem[] {
  return [
    {
      label: "Products",
      href: "/products",
      menu: {
        columns: [
          {
            heading: "SHOP BY CATEGORY",
            links: data.categories.map((category) => ({ href: categoryHref(category.slug), label: category.name })),
            all: { href: "/products", label: "View all products →" },
          },
          {
            heading: "POPULAR PRODUCTS",
            links: data.popular.map((product) => ({ href: `/products/${product.slug}`, label: product.name })),
            all: { href: "/products?sort=popular", label: "View all popular →" },
          },
          { heading: "SHOP BY NEED", links: GOALS.map((goal) => ({ href: goal.href, label: goal.label })) },
        ],
        feature: {
          eyebrow: "CAN'T FIND IT?",
          title: "If it can be made or sourced, tell us what you need.",
          link: { href: "/contact?topic=custom-request", label: "Start a custom request →" },
        },
      },
    },
    {
      label: "Projects",
      href: "/products",
      menu: {
        columns: [
          { heading: "PLAN A PROJECT", links: GOALS.map((goal) => ({ href: goal.href, label: goal.label })) },
          {
            heading: "HOW IT WORKS",
            links: [
              { href: "/#how-it-works", label: "How ordering works" },
              { href: "/#how-its-made", label: "How it's made" },
            ],
          },
        ],
        feature: {
          eyebrow: "ONE BRIEF",
          title: "Several products, one quote. Approve each item before it's made.",
          link: { href: "/contact?topic=project", label: "Tell us about your project →" },
        },
      },
    },
    { label: "Apparel", href: categoryHref("apparel-garment-production") },
    { label: "Print & Display", href: categoryHref("print-business-stationery") },
    { label: "Our Work", href: "/#how-its-made" },
    { label: "Resources", href: "/#how-it-works" },
  ];
}
