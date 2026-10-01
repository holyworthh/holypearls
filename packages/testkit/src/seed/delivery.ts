import { NIGERIA_LGAS } from "@holypearls/contracts";
import { schema, type Transaction } from "@holypearls/db";

/*
 * Delivery zones TEST DATA (T04-01) from Pen 108: Lagos Mainland ₦5,000,
 * Lagos Island ₦6,500, Abuja FCT ₦12,000, other states quote required,
 * international freight by quote. Transit days are the T03-08 working values
 * (Lagos 1–2, elsewhere 2–5). Replace with real rates before launch.
 */

const ISLAND = ["Eti-Osa", "Lagos Island"];

export async function seedDelivery(tx: Transaction): Promise<void> {
  const [existing] = await tx.select({ id: schema.deliveryZones.id }).from(schema.deliveryZones).limit(1);
  if (existing) return;
  const lagos = NIGERIA_LGAS.Lagos ?? [];
  await tx.insert(schema.deliveryZones).values([
    { name: "Lagos Mainland", covers: lagos.filter((lga) => !ISLAND.includes(lga)).map((lga) => ({ state: "Lagos", lga })), pricing: "FIXED", rateMinor: 500_000n, transitMinDays: 1, transitMaxDays: 2, position: 0 },
    { name: "Lagos Island", covers: ISLAND.map((lga) => ({ state: "Lagos", lga })), pricing: "FIXED", rateMinor: 650_000n, transitMinDays: 1, transitMaxDays: 2, position: 1 },
    { name: "Abuja FCT", covers: [{ state: "FCT", lga: null }], pricing: "FIXED", rateMinor: 1_200_000n, transitMinDays: 2, transitMaxDays: 5, position: 2 },
    { name: "Other Nigerian states", kind: "REST_OF_NIGERIA", covers: [], pricing: "QUOTE", transitMinDays: 2, transitMaxDays: 5, position: 3 },
    { name: "International", kind: "INTERNATIONAL", covers: [], pricing: "QUOTE", position: 4 },
  ]);
}
