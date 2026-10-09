import { z } from "zod";

/*
 * Where a checkout, project, quote or order was placed (T10-03): for an
 * organization and one of its locations, or null for a personal purchase.
 * Kept apart from organizations.ts so sales and projects can use it
 * without an import cycle.
 */

export const placedForInputSchema = z.object({ organizationId: z.uuid(), locationId: z.uuid() }).nullable();
export type PlacedForInput = z.infer<typeof placedForInputSchema>;

export const setPlacedForSchema = z.object({ placedFor: placedForInputSchema, version: z.number().int() });
export type SetPlacedFor = z.infer<typeof setPlacedForSchema>;

export const placedForSchema = z.object({
  organizationId: z.string(),
  locationId: z.string(),
  organizationName: z.string(),
  locationName: z.string(),
});
export type PlacedFor = z.infer<typeof placedForSchema>;
