/** The shared-element name a product card's photo morphs from into the product gallery (View Transitions; Ledger Motion board · product image morph). */
export const productTransition = (slug: string) => `product-${slug.replace(/[^a-z0-9-]/gi, "-")}`;
