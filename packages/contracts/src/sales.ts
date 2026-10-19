import { z } from "zod";
import { checkoutPaymentSchema } from "./payments.js";
import { placedForSchema } from "./placed-for.js";

/*
 * Cart, checkout and delivery zones (T04-01; COM-FR-080–084, OPS-FR-100–101).
 * Amounts are kobo as strings (bigint on the server). The browser never sends
 * an amount: every total here is worked out by the API (TECH-05 §1).
 */

/** The 36 states and the FCT. */
export const NIGERIA_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa",
  "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

/**
 * LGAs for the states whose zones are split by LGA. Other states are covered
 * whole, and their area is free text. Add a state here before splitting it.
 */
export const NIGERIA_LGAS: Partial<Record<(typeof NIGERIA_STATES)[number], readonly string[]>> = {
  Lagos: [
    "Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe", "Eti-Osa", "Ibeju-Lekki", "Ifako-Ijaiye",
    "Ikeja", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo", "Shomolu", "Surulere",
  ],
  FCT: ["Abaji", "Abuja Municipal", "Bwari", "Gwagwalada", "Kuje", "Kwali"],
};

const state = z.enum(NIGERIA_STATES);

// ——— Delivery zones (admin, Pen 108) ———

export const zoneCoverSchema = z.object({ state, lga: z.string().trim().min(1).max(80).nullable() });

export const deliveryZoneInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name the zone").max(80),
    covers: z.array(zoneCoverSchema).min(1, "Choose at least one state or LGA").max(200),
    pricing: z.enum(["FIXED", "QUOTE"]),
    /** Kobo as a string, before VAT. Required for FIXED. */
    rateMinor: z.string().regex(/^\d{1,12}$/, "Enter the rate in naira").nullable(),
    transitMinDays: z.number().int().min(0).max(60).nullable(),
    transitMaxDays: z.number().int().min(0).max(60).nullable(),
    version: z.number().int().optional(),
  })
  .superRefine((value, context) => {
    if (value.pricing === "FIXED" && value.rateMinor === null) context.addIssue({ code: "custom", path: ["rateMinor"], message: "Enter the rate, or choose Quote required" });
    if (value.transitMinDays !== null && value.transitMaxDays !== null && value.transitMinDays > value.transitMaxDays) {
      context.addIssue({ code: "custom", path: ["transitMaxDays"], message: "The longest time can't be shorter than the shortest" });
    }
  });

/** The fixed zones only change their rate and transit time. */
export const fixedZoneInputSchema = z.object({
  pricing: z.enum(["FIXED", "QUOTE"]),
  rateMinor: z.string().regex(/^\d{1,12}$/).nullable(),
  transitMinDays: z.number().int().min(0).max(60).nullable(),
  transitMaxDays: z.number().int().min(0).max(60).nullable(),
  version: z.number().int(),
});

/** Destinations abroad with their own freight (T13-01c; OPS-FR-101): calculated rate or staff will quote. */
export const countriesZoneInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name the destinations, for example Ghana, Togo, Benin").max(80),
    countries: z
      .array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use two-letter country codes, like GH"))
      .min(1, "Add at least one country")
      .max(80)
      .refine((codes) => !codes.includes("NG"), "Nigeria is covered by the delivery zones"),
    pricing: z.enum(["FIXED", "QUOTE"]),
    rateMinor: z.string().regex(/^\d{1,12}$/, "Enter the rate in naira").nullable(),
    transitMinDays: z.number().int().min(0).max(60).nullable(),
    transitMaxDays: z.number().int().min(0).max(60).nullable(),
    version: z.number().int().optional(),
  })
  .superRefine((value, context) => {
    if (value.pricing === "FIXED" && value.rateMinor === null) context.addIssue({ code: "custom", path: ["rateMinor"], message: "Enter the rate, or choose Staff will quote" });
  });

export const deliveryZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["AREA", "REST_OF_NIGERIA", "INTERNATIONAL", "COUNTRIES"]),
  covers: z.array(zoneCoverSchema),
  /** COUNTRIES zones: ISO codes. */
  countries: z.array(z.string()),
  pricing: z.enum(["FIXED", "QUOTE"]),
  rateMinor: z.string().nullable(),
  transitMinDays: z.number().int().nullable(),
  transitMaxDays: z.number().int().nullable(),
  version: z.number().int(),
});
export const deliveryZoneListSchema = z.object({ zones: z.array(deliveryZoneSchema) });

// ——— Cart (Pen 41/42) ———

export const cartItemSchema = z.object({
  id: z.string(),
  configurationId: z.string(),
  group: z.enum(["READY", "QUOTE"]),
  productName: z.string(),
  productSlug: z.string(),
  /** Short description of the choices, e.g. "Premium Matte 350gsm · double-sided". */
  summary: z.string(),
  quantity: z.number().int().nullable(),
  artwork: z.string().nullable(),
  totalMinor: z.string().nullable(),
  perUnitMinor: z.string().nullable(),
  /** Standard quantities the customer can switch to from the cart; empty when only the configurator can change it. */
  quantityOptions: z.array(z.number().int()),
  editHref: z.string(),
});

export const savedDraftSchema = z.object({
  configurationId: z.string(),
  productName: z.string(),
  summary: z.string(),
  quantity: z.number().int().nullable(),
  editHref: z.string(),
});

export const cartSchema = z.object({
  items: z.array(cartItemSchema),
  savedForLater: z.array(savedDraftSchema),
  /** READY items only (COM-FR-081). Delivery is set at checkout. */
  ready: z.object({ goodsMinor: z.string(), vatMinor: z.string(), totalMinor: z.string(), vatRateBps: z.number().int().nullable() }),
  /** Sum of the QUOTE items' estimates, never charged. */
  quoteEstimateMinor: z.string().nullable(),
});

export const addToCartSchema = z.object({ configurationId: z.uuid() });

export const cartQuoteRequestSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  name: z.string().trim().min(1, "Enter your name").max(120),
  phone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(2_000).optional(),
});
export const cartQuoteRequestResultSchema = z.object({ references: z.array(z.string()) });

// ——— Checkout (Pen 43/44/45) ———

/** Nigerian numbers: 11 digits from 0, or +234 and 10 digits. Spaces and dashes are ignored. */
export const nigerianPhone = (value: string) => /^(0\d{10}|\+?234\d{10})$/.test(value.replace(/[\s-]/g, ""));

export const checkoutContactSchema = z.object({
  name: z.string().trim().min(1, "Enter your full name").max(120),
  email: z.email("Enter an email address like name@example.com").max(254),
  phone: z.string().trim().min(1, "Enter your phone number").max(40),
});

export const checkoutAddressSchema = z
  .object({
    country: z.string().trim().length(2).toUpperCase(),
    name: z.string().trim().min(1, "Enter the full name for delivery").max(120),
    phone: z.string().trim().min(1, "Enter a phone number for delivery").max(40),
    street: z.string().trim().min(1, "Enter the street address").max(200),
    /** Nigeria: the LGA for split states, otherwise the area. Elsewhere: city. */
    area: z.string().trim().min(1, "Choose your area or LGA").max(80),
    state: z.string().trim().min(1, "Choose your state").max(80),
    landmark: z.string().trim().max(200).optional(),
    postcode: z.string().trim().max(20).optional(),
  })
  .superRefine((value, context) => {
    if (value.country !== "NG") return;
    if (!nigerianPhone(value.phone)) context.addIssue({ code: "custom", path: ["phone"], message: "Enter all 11 digits, e.g. 0800 000 0000" });
    if (!(NIGERIA_STATES as readonly string[]).includes(value.state)) context.addIssue({ code: "custom", path: ["state"], message: "Choose your state" });
    const lgas = NIGERIA_LGAS[value.state as (typeof NIGERIA_STATES)[number]];
    if (lgas && !lgas.includes(value.area)) context.addIssue({ code: "custom", path: ["area"], message: "Choose your area or LGA" });
  });

export const checkoutDeliverySchema = z.object({ option: z.literal("STANDARD") });

export const checkoutBillingSchema = z.object({
  sameAsDelivery: z.boolean(),
  /** For a VAT invoice in the company's name. */
  companyName: z.string().trim().max(160).optional(),
  taxId: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
});

export const checkoutSchema = z.object({
  id: z.string(),
  status: z.enum(["OPEN", "COMPLETED", "ABANDONED"]),
  step: z.enum(["contact", "address", "delivery", "billing", "review"]),
  version: z.number().int(),
  items: z.array(
    z.object({
      productName: z.string(),
      summary: z.string(),
      quantity: z.number().int(),
      totalMinor: z.string(),
      perUnitMinor: z.string().nullable(),
      /** The total shown in the cart, when the server's price at checkout differs from it. */
      cartTotalMinor: z.string().nullable(),
    }),
  ),
  contact: checkoutContactSchema.nullable(),
  address: z.object({ country: z.string(), name: z.string(), phone: z.string(), street: z.string(), area: z.string(), state: z.string(), landmark: z.string().nullable(), postcode: z.string().nullable() }).nullable(),
  delivery: z
    .object({
      zoneName: z.string(),
      pricing: z.enum(["FIXED", "QUOTE"]),
      rateMinor: z.string().nullable(),
      transitDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
      chosen: z.boolean(),
      /** Where the price came from: the zone rate, a courier (T08-05), or our team (null until set). */
      source: z.enum(["ZONE", "COURIER", "STAFF"]),
      courierName: z.string().nullable(),
      /** The courier's own delivery estimate, e.g. "Within 1 - 4 working days". */
      courierEta: z.string().nullable(),
    })
    .nullable(),
  billing: checkoutBillingSchema.nullable(),
  totals: z.object({ goodsMinor: z.string(), deliveryMinor: z.string().nullable(), vatMinor: z.string(), totalMinor: z.string(), vatRateBps: z.number().int() }),
  international: z.boolean(),
  /** Production working days after proof approval, across the items. */
  productionDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
  /** Why the customer can't pay yet, if anything stops it. */
  blockers: z.array(z.object({ code: z.enum(["STEPS_INCOMPLETE", "DELIVERY_QUOTE_REQUIRED", "PAYMENTS_NOT_AVAILABLE", "PAYMENTS_PAUSED"]), message: z.string() })),
  /** The payment for this checkout (T04-03): what can be used to pay, and the latest attempt. */
  payment: checkoutPaymentSchema,
  /** The order this checkout became once paid (T04-05). */
  order: z.object({ id: z.string(), number: z.string() }).nullable(),
  /** True when the quote items stayed in the cart. */
  quoteItemsLeftInCart: z.boolean(),
  /** The organization and location it is placed for (T10-03), or null for a personal order. */
  placedFor: placedForSchema.nullable().default(null),
});

// ——— Delivery priced by staff (owner, 2026-10-05) ———

/** Checkouts waiting for staff to price delivery to an address outside the zones. */
export const deliveryPriceQueueSchema = z.object({
  items: z.array(
    z.object({
      checkoutId: z.string(),
      version: z.number().int(),
      zoneName: z.string(),
      /** "Nassarawa, Kano, NG": where it's going (the full address stays on the checkout). */
      place: z.string(),
      customer: z.string(),
      items: z.string(),
      goodsMinor: z.string(),
      requestedAt: z.iso.datetime(),
      expiresAt: z.iso.datetime().nullable(),
      /** Why the courier couldn't price it (T08-05); null when courier prices aren't set up. */
      courierProblem: z.string().nullable(),
    }),
  ),
});
export const deliveryPriceInputSchema = z
  .object({
    rateMinor: z.string().regex(/^\d{1,12}$/, "Enter the delivery price"),
    transitMinDays: z.number().int().min(1).max(90),
    transitMaxDays: z.number().int().min(1).max(90),
    version: z.number().int(),
  })
  .refine((input) => input.transitMaxDays >= input.transitMinDays, { message: "The longest time can't be shorter than the shortest", path: ["transitMaxDays"] });
export type DeliveryPriceQueue = z.infer<typeof deliveryPriceQueueSchema>;

export type DeliveryZone = z.infer<typeof deliveryZoneSchema>;
export type Cart = z.infer<typeof cartSchema>;
export type CartItem = z.infer<typeof cartItemSchema>;
export type Checkout = z.infer<typeof checkoutSchema>;

// ——— Installation (T13-01c; OPS-FR-102; Pen 119) ———

export const INSTALLATION_PRICING = ["FIXED", "FIXED_PLUS_TRAVEL", "QUOTE"] as const;

export const installationAreaInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name the area, for example Lagos").max(80),
    states: z.array(state).min(1, "Choose at least one state").max(37),
    productIds: z.array(z.uuid()).max(100),
    pricing: z.enum(INSTALLATION_PRICING),
    /** Kobo before VAT, per piece installed. */
    rateMinor: z.string().regex(/^\d{1,12}$/, "Enter the fee in naira").nullable(),
    /** Kobo before VAT, once per order (FIXED_PLUS_TRAVEL). */
    travelMinor: z.string().regex(/^\d{1,12}$/, "Enter the travel fee in naira").nullable(),
    version: z.number().int().min(0),
  })
  .superRefine((value, context) => {
    if (value.pricing !== "QUOTE" && value.rateMinor === null) context.addIssue({ code: "custom", path: ["rateMinor"], message: "Enter the fee per piece, or choose Quote required" });
    if (value.pricing === "FIXED_PLUS_TRAVEL" && value.travelMinor === null) context.addIssue({ code: "custom", path: ["travelMinor"], message: "Enter the travel fee" });
  });

export const installationAreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  states: z.array(z.string()),
  products: z.array(z.object({ id: z.string(), name: z.string() })),
  pricing: z.enum(INSTALLATION_PRICING),
  rateMinor: z.string().nullable(),
  travelMinor: z.string().nullable(),
  version: z.number().int(),
});
export type InstallationArea = z.infer<typeof installationAreaSchema>;

/** Null turns a rule off. */
export const installationRulesSchema = z.object({
  surveyAboveSqM: z.number().int().min(1).max(10_000).nullable(),
  noticeWorkingDays: z.number().int().min(1).max(60).nullable(),
  version: z.number().int(),
});
export type InstallationRules = z.infer<typeof installationRulesSchema>;

export const installationSetupSchema = z.object({
  areas: z.array(installationAreaSchema),
  rules: installationRulesSchema,
  /** Products that can be installed (large format and wall art), for the capability choices. */
  installable: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type InstallationSetup = z.infer<typeof installationSetupSchema>;
