# HolyPearls — PRD 01: Public Website, Search & SEO

**Version:** 2.1 (1 October 2026). 2.1 amends PUB-FR-003 (main navigation items). 2.0 replaced PRD 01 v0.1. **Built in:** Pass P02 (catalogue and discovery), hardened in P14.

## 1\. Purpose

The public website helps people understand what HolyPearls does, find the right product or project, trust the business, and move into ordering or Start a Project. Search engines must be able to read it well.

## 2\. Goals

- Be found by people in Nigeria and abroad searching for production services with buying intent.  
- Help people find a product even when they don't know the trade name for it.  
- Show how much HolyPearls can make without overwhelming the navigation.  
- Build credibility in garment production, embroidery, print, display, packaging and projects.  
- Send people cleanly to a product page or to Start a Project.  
- Stay fast and accessible on mobile.

## 3\. Not in scope

Product configuration; quotes, payments, proofs and orders; workspace and admin; city-by-city "printing in X" pages that repeat the same text.

## 4\. Who uses it

Shoppers, business buyers, project planners, returning customers looking for a product, and search engines.

## 5\. Pages

Homepage, main navigation and mega-menu, search, Product Directory, Category Hubs, Project / Solution pages, Our Work (case studies), Resources (guides), About, Contact. Product pages are specified with PRD 02\.

## 6\. Requirements

**PUB-FR-001 — Homepage search entry (P0).** The homepage has a prominent "What do you need made?" search box and a Start a Project button.

**PUB-FR-002 — Homepage goal routes (P0).** The homepage offers routes by goal: uniforms, events, business launch, merchandise, packaging, custom projects.

**PUB-FR-003 — Main navigation (P0).** Shows Products, Projects, Our Work and Help. Apparel and Print & Display are reached from the Products mega-menu (PUB-FR-004). Help leads to the Resources guides. No giant wall of links.

**PUB-FR-004 — Desktop mega-menu (P0).** Groups categories, popular products, project goals, and a "Can't find it? Tell us what you need" route. The popular-products list is managed in admin.

**PUB-FR-005 — Mobile navigation (P0).** Drill-down menu with Search first, Start a Project always visible, and 44 px touch targets.

**PUB-FR-006 — Search (P0).** Returns products, categories, projects and guides, grouped by type. Works fully by keyboard and on mobile. Search result pages are never indexed.

**PUB-FR-007 — Everyday words in search (P0).** Staff can add everyday phrases ("company shirts", "staff uniform", "souvenir", "banner") that point to the right product. Search tolerates small spelling mistakes. (Raised from P1 to P0 because PUB-FR-006 depends on it for ordinary customers.)

**PUB-FR-008 — Product Directory (P0).** Search within products, filter by category and other useful fields, and page through results. Filtered URLs are not indexed.

**PUB-FR-009 — Category Hub (P0).** Each main category combines products with genuinely useful guidance: how it's made, how to choose, related projects, real work, FAQs. No SEO filler text.

**PUB-FR-010 — Product card (P0).** Shows name, a short helpful description, price or price state, image and the right action (View or Configure). At most two lines of extra information.

**PUB-FR-011 — Project / Solution pages (P0).** Explain the goal, suggested products, the process and examples, and link to Start a Project.

**PUB-FR-012 — Case studies (P1).** Show project type, products used, real photos and outcome. Never publish invented clients or results.

**PUB-FR-013 — Resources (P1).** Practical buying and production guides that link naturally to products and projects.

**PUB-FR-014 — Delivery coverage (P0).** Explain Nigeria-wide and international delivery accurately, without promising times or prices we can't guarantee.

**PUB-FR-015 — Contact with context (P0).** When someone contacts HolyPearls from a product or project page, that page's context is attached (see PRD 00 section 18).

**PUB-FR-016 — No-result recovery (P0).** A search with no results says "We may still be able to make or source this", keeps the search text, and offers a custom request.

## 7\. SEO requirements

**PUB-SEO-001.** One strong page per real product, category and project. No near-duplicate city or variant pages.

**PUB-SEO-002.** Product variants (colour, size, fabric weight) stay on one product page unless a variant has genuinely separate search demand.

**PUB-SEO-003.** Direct-purchase products publish Product and Offer structured data only when the price and availability are real.

**PUB-SEO-004.** Quote-only products never publish Offer data that implies you can buy at a fixed price.

**PUB-SEO-005.** Breadcrumb structured data on detail pages.

**PUB-SEO-006.** Business name, contact details and location or service area are identical everywhere, including Google Business Profile.

**PUB-SEO-007.** Images have descriptive filenames and alt text.

**PUB-SEO-008.** Private pages (cart, checkout, quote, proof, order, workspace, account, collection, search results) send a noindex instruction by default in code, not by a manual checkbox.

**PUB-SEO-009.** XML sitemap of public pages, updated when content is published or removed. Changed URLs are submitted through IndexNow.

## 8\. Content staff manage

Categories, products, project/solution pages, case studies, guides, navigation lists, search phrases, SEO title, description and canonical URL, structured-data fields, hero images and media.

## 9\. Performance

LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile. Images sized for the device. Hero video always has a still poster. Search never downloads the whole catalogue to the browser.

## 10\. Accessibility

WCAG 2.2 AA. Proper headings and page landmarks. Visible focus. Mega-menu and search work by keyboard. Useful alt text. Nothing is available only on hover.

## 11\. Analytics

Track: searches, searches with no results, clicks on products, categories and projects, Start a Project entries, Configure entries, contact entries, and guide-to-product or guide-to-project clicks. Don't store more search text than needed, and never store personal details from search.

## 12\. Done when

- A person can reach a relevant product from the homepage in 3 clicks or fewer.  
- A person can reach Start a Project without knowing any product names.  
- Mobile navigation and search are complete.  
- Public pages are readable with JavaScript turned off.  
- No private or customer data can be indexed.  
- SEO titles, descriptions and canonical URLs are generated by fixed rules.