import { type Configuration, DECORATION_LABEL, SOURCING_LABEL } from "@holypearls/contracts";

/*
 * What a garment can be made and decorated with (COM-FR-020, 024), from the
 * product's stored capabilities (products.routes, products.decorations).
 * This is the one place that turns them into configurator choices; the API
 * returns the result and refuses anything else, so the browser never decides.
 *
 * - Routes: exactly the product's routes. Help Me Choose is not a production
 *   route: it asks staff to recommend one, so every garment offers it.
 * - Decorations: the product stores production methods; the configurator asks
 *   in plain words. Embroidery is EMBROIDERY. Print is any garment print
 *   method (SCREEN_PRINT, HEAT_TRANSFER); paper and large-format printing
 *   never decorate garments. Both needs embroidery and a garment print method.
 *   Recommend for Me needs at least one of them to recommend.
 */

type Sourcing = NonNullable<NonNullable<Configuration["garment"]>["sourcing"]>;
type Decoration = NonNullable<NonNullable<Configuration["garment"]>["decoration"]>;
export interface Capabilities {
  routes: readonly string[];
  decorations: readonly string[];
}

const ROUTES = ["SOURCE_CUSTOMIZE", "MAKE_FROM_SCRATCH", "CUSTOMER_SUPPLIED"] as const;
const GARMENT_PRINT = ["SCREEN_PRINT", "HEAT_TRANSFER"];

const LABEL: Record<Sourcing | Decoration, string> = { ...SOURCING_LABEL, ...DECORATION_LABEL };

/** The sourcing and decoration choices this product offers, in display order. */
export function garmentChoices(product: Capabilities): { sourcing: Sourcing[]; decoration: Decoration[] } {
  const embroidery = product.decorations.includes("EMBROIDERY");
  const print = product.decorations.some((method) => GARMENT_PRINT.includes(method));
  return {
    sourcing: [...ROUTES.filter((route) => product.routes.includes(route)), "HELP_ME_CHOOSE"],
    decoration: [
      ...(embroidery ? (["EMBROIDERY"] as const) : []),
      ...(print ? (["PRINT"] as const) : []),
      ...(embroidery && print ? (["BOTH"] as const) : []),
      ...(embroidery || print ? (["RECOMMEND"] as const) : []),
    ],
  };
}

export type UnavailableChoice = { field: string; value: string; message: string };

/**
 * Saved answers the product no longer offers (staff changed it after the
 * customer answered). The draft keeps them so nothing is lost; the customer
 * chooses a replacement before asking for a quote.
 */
export function unavailableGarmentChoices(
  product: Capabilities,
  answers: { sourcing: Sourcing | null; decoration: Decoration | null; placements: { position: string; method: Decoration | null }[] },
): UnavailableChoice[] {
  const allowed = garmentChoices(product);
  const list: UnavailableChoice[] = [];
  if (answers.sourcing && !allowed.sourcing.includes(answers.sourcing)) {
    list.push({ field: "sourcing", value: answers.sourcing, message: `${LABEL[answers.sourcing]} isn't available for this product any more. Choose another way to make it.` });
  }
  if (answers.decoration && !allowed.decoration.includes(answers.decoration)) {
    list.push({ field: "decoration", value: answers.decoration, message: `${LABEL[answers.decoration]} isn't available for this product any more. Choose another decoration.` });
  }
  for (const placement of answers.placements) {
    if (placement.method && !allowed.decoration.includes(placement.method)) {
      list.push({
        field: `placements.${placement.position}`,
        value: placement.method,
        message: `${LABEL[placement.method]} isn't available for this product any more. Choose another method for this placement.`,
      });
    }
  }
  return list;
}
