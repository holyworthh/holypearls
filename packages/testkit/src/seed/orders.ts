import { readFile } from "node:fs/promises";
import { TEST_PEOPLE } from "@holypearls/auth";
import { eq, schema, type Transaction } from "@holypearls/db";
import type { SeedMediaStore } from "./media.js";

const TEST_DATA_LABEL = "TEST DATA";
const DAY_MS = 86_400_000;

/** `0190c5b3-0000-7000-8000-00000000<prefix><nn>`. Never …0001 or …0002: e2e treats those as "someone else's" IDs. */
const id = (prefix: "a1" | "b1", n: number) => `0190c5b3-0000-7000-8000-00000000${prefix}${n.toString(16).padStart(2, "0")}`;

/**
 * Fixed IDs of the TECH-08 §11 order fixtures, for tests that open them.
 * A is the Event order from an accepted quote (balance due ₦340,000, Name Badge proof V1 changes requested and V2 awaiting).
 * B is a paid Business Cards checkout.
 */
export const SEED_ORDERS = {
  quote: id("a1", 1),
  order: id("a1", 6),
  items: [id("a1", 7), id("a1", 8), id("a1", 9)],
  depositIntent: id("a1", 13),
  balanceIntent: id("a1", 14),
  receipt: id("a1", 16),
  proof: id("a1", 17),
  proofVersions: [id("a1", 18), id("a1", 19)],
  checkout: id("b1", 1),
  checkoutOrder: id("b1", 2),
  checkoutReceipt: id("b1", 8),
} as const;

const ORDER_A_NUMBER = "HP-TEST-0001";
const ORDER_B_NUMBER = "HP-TEST-0002";
/** The proof artwork: the sample event-badges photo. */
const PROOF_ASSET = new URL("../../assets/products/event-badges.webp", import.meta.url);
const PROOF_KEY = "files/source/seed-proof-name-badge";
const PROOF_SIZE = { width: 928, height: 1152 };

async function chidi(tx: Transaction) {
  const person = TEST_PEOPLE.customerChidi;
  const [user] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, person.email));
  if (!user) throw new Error("Seed the identity step before orders.");
  const email = person.email.trim();
  const emailNormalized = email.toLowerCase();
  await tx
    .insert(schema.customers)
    .values({ email, emailNormalized, name: person.name, userId: user.id, emailVerifiedAt: new Date() })
    .onConflictDoNothing({ target: schema.customers.emailNormalized });
  const [customer] = await tx.select().from(schema.customers).where(eq(schema.customers.emailNormalized, emailNormalized));
  return { customer: customer!, userId: user.id, contact: { name: person.name, email, phone: "08000000000" } };
}

/**
 * The Event order and the Business Cards order for Chidi (TECH-08 §11), made the way the API makes them:
 * accepting a quote (apps/api quotes/customer.ts) and a paid checkout (orders/orders.ts). Runs once.
 * `files` is the private store; without it the proof's picture isn't written (database-only tests).
 */
export async function seedOrders(tx: Transaction, files?: SeedMediaStore) {
  const [seeded] = await tx.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.id, SEED_ORDERS.order));
  if (seeded) return;
  const { customer, userId, contact } = await chidi(tx);
  const now = Date.now();
  const placedAt = new Date(now - 3 * DAY_MS);
  const paidAt = new Date(now - 3 * DAY_MS + 3_600_000);

  /* ---------------- A: the Event order from an accepted quote ---------------- */
  const lines = [
    { title: `Event Name Badges ${TEST_DATA_LABEL}`, summary: "Printed badge with lanyard", quantity: 250, unit: 84_000n, status: "AWAITING_PREREQUISITE" as const },
    { title: `Event Backdrop ${TEST_DATA_LABEL}`, summary: "3 m × 2 m step-and-repeat", quantity: 2, unit: 9_000_000n, status: "IN_PRODUCTION" as const },
    { title: `Staff Polo ${TEST_DATA_LABEL}`, summary: "Navy, embroidered chest logo", quantity: 30, unit: 700_000n, status: "QUALITY_CHECK" as const },
  ];
  // ₦600,000 of goods + 7.5% VAT + ₦35,000 delivery (no VAT) = ₦680,000.
  const goods = lines.reduce((sum, line) => sum + line.unit * BigInt(line.quantity), 0n);
  const delivery = 3_500_000n;
  const vatBps = 750;
  const vatOf = (amount: bigint) => (amount * BigInt(vatBps) + 5_000n) / 10_000n;
  const vat = lines.reduce((sum, line) => sum + vatOf(line.unit * BigInt(line.quantity)), 0n);
  const total = goods + vat + delivery;
  const half = total / 2n;

  const [quote] = await tx
    .insert(schema.quotes)
    .values({
      id: SEED_ORDERS.quote,
      reference: "HP-Q-TEST-0001",
      status: "ACCEPTED",
      customerId: customer.id,
      requestSnapshot: { productName: `Event package ${TEST_DATA_LABEL}` },
      contact,
    })
    .returning({ id: schema.quotes.id });
  const [version] = await tx
    .insert(schema.quoteVersions)
    .values({
      id: id("a1", 2),
      quoteId: quote!.id,
      number: 1,
      // Lines can only be added to a draft; the version is accepted once they are in.
      status: "DRAFT",
      currency: "NGN",
      designMinor: 0n,
      deliveryMinor: delivery,
      deliveryNote: "Delivered to the venue in Lagos",
      installationMinor: 0n,
      otherMinor: 0n,
      vatRateBps: vatBps,
      vatOnDelivery: false,
      goodsMinor: goods,
      feesMinor: delivery,
      vatMinor: vat,
      totalMinor: total,
      validDays: 14,
      validUntil: new Date(now + 11 * DAY_MS),
      terms: "50% deposit to start, balance before dispatch.",
      schedule: [
        { label: "Deposit", kind: "PERCENT", value: "5000", trigger: "ON_ACCEPTANCE" },
        { label: "Balance", kind: "PERCENT", value: "5000", trigger: "BEFORE_DISPATCH" },
      ],
      sentAt: new Date(now - 4 * DAY_MS),
    })
    .returning({ id: schema.quoteVersions.id });
  await tx.insert(schema.quoteLineItems).values(
    lines.map((line, index) => ({
      id: id("a1", 3 + index),
      quoteVersionId: version!.id,
      position: index + 1,
      source: "MANUAL" as const,
      title: line.title,
      summary: line.summary,
      quantity: line.quantity,
      unitMinor: line.unit,
      totalMinor: line.unit * BigInt(line.quantity),
    })),
  );
  await tx.update(schema.quoteVersions).set({ status: "ACCEPTED" }).where(eq(schema.quoteVersions.id, version!.id));
  await tx.insert(schema.quoteAcceptances).values({
    quoteVersionId: version!.id,
    customerId: customer.id,
    actorType: "USER",
    emailVerifiedAt: placedAt,
    acknowledgement: "I have reviewed the scope, pricing and production terms in this quote.",
  });
  await tx
    .insert(schema.orders)
    .values({
      id: SEED_ORDERS.order,
      number: ORDER_A_NUMBER,
      quoteVersionId: version!.id,
      customerId: customer.id,
      ownerUserId: userId,
      currency: "NGN",
      goodsMinor: goods,
      deliveryMinor: delivery,
      vatMinor: vat,
      totalMinor: total,
      vatRateBps: vatBps,
      contact: { name: contact.name, email: contact.email },
      address: null,
      delivery: { note: "Delivered to the venue in Lagos", installation: "" },
      billing: null,
      placedAt,
    })
    .returning({ id: schema.orders.id });
  const items = await tx
    .insert(schema.orderItems)
    .values(
      lines.map((line, index) => {
        const lineGoods = line.unit * BigInt(line.quantity);
        return {
          id: SEED_ORDERS.items[index]!,
          orderId: SEED_ORDERS.order,
          position: index + 1,
          productName: line.title,
          summary: line.summary,
          quantity: line.quantity,
          goodsMinor: lineGoods,
          vatMinor: vatOf(lineGoods),
          totalMinor: lineGoods + vatOf(lineGoods),
          snapshot: { schema: "quote-line/v1", quoteReference: "HP-Q-TEST-0001", version: 1, line: { title: line.title, quantity: line.quantity, unitMinor: line.unit.toString(), totalMinor: lineGoods.toString() } },
          status: line.status,
        };
      }),
    )
    .returning({ id: schema.orderItems.id });

  const [schedule] = await tx.insert(schema.paymentSchedules).values({ id: id("a1", 10), quoteVersionId: version!.id, currency: "NGN", totalMinor: total }).returning({ id: schema.paymentSchedules.id });
  const [deposit, balance] = await tx
    .insert(schema.installments)
    .values([
      { id: id("a1", 11), scheduleId: schedule!.id, position: 1, label: "Deposit", amountMinor: half, currency: "NGN", trigger: "ON_ACCEPTANCE", status: "PAID" as const, paidAt },
      { id: id("a1", 12), scheduleId: schedule!.id, position: 2, label: "Balance", amountMinor: total - half, currency: "NGN", trigger: "BEFORE_DISPATCH", status: "DUE" as const },
    ])
    .returning({ id: schema.installments.id });
  // An intent can only be SUCCEEDED with its attempt, and the attempt needs the intent: open it, add the attempt, then settle it.
  await tx.insert(schema.paymentIntents).values([
    { id: SEED_ORDERS.depositIntent, installmentId: deposit!.id, amountMinor: half, currency: "NGN" },
    { id: SEED_ORDERS.balanceIntent, installmentId: balance!.id, amountMinor: total - half, currency: "NGN" },
  ]);
  await tx.insert(schema.paymentAttempts).values({
    id: id("a1", 15),
    intentId: SEED_ORDERS.depositIntent,
    reference: `HPPAY-${id("a1", 15)}`,
    status: "SUCCEEDED",
    amountMinor: half,
    currency: "NGN",
    paidAmountMinor: half,
    paidCurrency: "NGN",
    channel: "card",
    gatewayResponse: "Successful",
    paidAt,
    finishedAt: paidAt,
  });
  await tx.update(schema.paymentIntents).set({ status: "SUCCEEDED", succeededAttemptId: id("a1", 15) }).where(eq(schema.paymentIntents.id, SEED_ORDERS.depositIntent));
  await tx.insert(schema.receipts).values({
    id: SEED_ORDERS.receipt,
    number: "HP-R-TEST-0001",
    attemptId: id("a1", 15),
    intentId: SEED_ORDERS.depositIntent,
    orderId: SEED_ORDERS.order,
    customerId: customer.id,
    amountMinor: half,
    currency: "NGN",
    paystackReference: `HPPAY-${id("a1", 15)}`,
    channel: "card",
    payer: { name: contact.name, email: contact.email },
    lines: lines.map((line) => ({ label: `${line.title} · ${line.summary}`, quantity: line.quantity, totalMinor: (line.unit * BigInt(line.quantity)).toString() })),
    paidAt,
  });

  // The Name Badge proof: V1 changes requested, V2 waiting for the customer.
  await tx.insert(schema.proofs).values([
    { id: SEED_ORDERS.proof, orderItemId: items[0]!.id, status: "AWAITING_APPROVAL", requirement: "REQUIRED" },
    ...items.slice(1).map((item, index) => ({ id: id("a1", 28 + index), orderItemId: item.id, status: "NOT_REQUIRED" as const, requirement: "NOT_REQUIRED" })),
  ]);
  const file = id("a1", 22);
  const views = [{ label: "Front", fileId: file }];
  const details = { placement: "Centred on the front of the badge", dimensions: "86 mm × 54 mm", colourReference: "Holy Blue, as supplied", quantity: "250", notes: `Names are printed from the supplied list. ${TEST_DATA_LABEL}` };
  await tx.insert(schema.proofVersions).values([
    { id: SEED_ORDERS.proofVersions[0], proofId: SEED_ORDERS.proof, number: 1, status: "CHANGES_REQUESTED", views, details, publishedAt: new Date(now - 2 * DAY_MS) },
    { id: SEED_ORDERS.proofVersions[1], proofId: SEED_ORDERS.proof, number: 2, status: "PUBLISHED", views, details: { ...details, notes: `Logo enlarged and the event date corrected. ${TEST_DATA_LABEL}` }, publishedAt: new Date(now - DAY_MS) },
  ]);
  await tx.insert(schema.proofDecisions).values({
    proofVersionId: SEED_ORDERS.proofVersions[0],
    decision: "CHANGES_REQUESTED",
    customerId: customer.id,
    actorType: "USER",
    decidedBy: contact.name,
    note: "Please make the logo larger and fix the event date.",
  });
  await tx.insert(schema.proofComments).values([
    { id: id("a1", 26), proofVersionId: SEED_ORDERS.proofVersions[0], kind: "CHANGE_REQUEST", body: "Please make the logo larger and fix the event date.", customerId: customer.id },
    { id: id("a1", 27), proofVersionId: SEED_ORDERS.proofVersions[1], kind: "QUESTION", body: "Is this the right spelling of the venue name?", customerId: customer.id, pinX: "0.42000", pinY: "0.31000", pinView: 0, pinNumber: 1 },
  ]);
  // The picture belongs to V2; V1 shows the same file, which is reached through the file's own access check.
  const source = await readFile(PROOF_ASSET);
  await tx.insert(schema.files).values({
    id: file,
    purpose: "PROOF",
    status: "READY",
    bucket: "private",
    ownerType: "PROOF_VERSION",
    ownerId: SEED_ORDERS.proofVersions[1],
    attachedAt: new Date(),
    originalName: "name-badge-proof.webp",
    safeName: "name-badge-proof.webp",
    declaredType: "image/webp",
    detectedType: "image/webp",
    declaredSize: source.length,
    sizeBytes: source.length,
    storageKey: PROOF_KEY,
    metadata: PROOF_SIZE,
  });
  await tx.insert(schema.fileRenditions).values([
    { fileId: file, kind: "PREVIEW", page: 1, storageKey: PROOF_KEY, contentType: "image/webp", ...PROOF_SIZE },
    { fileId: file, kind: "PAGE", page: 1, storageKey: PROOF_KEY, contentType: "image/webp", ...PROOF_SIZE },
  ]);
  await files?.write(PROOF_KEY, source, "image/webp");

  /* ---------------- B: a paid Business Cards checkout ---------------- */
  const cardGoods = 5_000_000n;
  const cardDelivery = 1_500_000n;
  const cardVat = vatOf(cardGoods);
  const cardTotal = cardGoods + cardVat + cardDelivery;
  const cardTitle = `Business Cards ${TEST_DATA_LABEL}`;
  const cardSummary = "Matte, double-sided";
  const address = { country: "NG", name: contact.name, phone: "08000000000", street: "12 Test Street", area: "Ikeja", state: "Lagos", landmark: null, postcode: null };
  const deliveryChoice = { zoneId: id("b1", 3), zoneName: "Lagos", pricing: "FIXED", rateMinor: cardDelivery.toString(), transitDays: { min: 1, max: 3 }, chosen: true, source: "ZONE" };
  const configurationId = id("b1", 4);
  const cardSnapshot = {
    schema: "orderable-configuration/v1",
    takenAt: placedAt.toISOString(),
    configuration: { id: configurationId, version: 1 },
    product: { id: id("b1", 5), slug: "business-cards", name: "Business Cards", family: "PRINT" },
    choices: [],
    quantity: 500,
  };
  await tx.insert(schema.checkouts).values({
    id: SEED_ORDERS.checkout,
    status: "COMPLETED",
    ownerUserId: userId,
    customerId: customer.id,
    currency: "NGN",
    items: [
      {
        configurationId,
        productName: cardTitle,
        summary: cardSummary,
        quantity: 500,
        goodsMinor: cardGoods.toString(),
        vatMinor: cardVat.toString(),
        totalMinor: (cardGoods + cardVat).toString(),
        perUnitMinor: "10000",
        cartTotalMinor: null,
        leadDays: { min: 3, max: 5 },
        priceResultId: id("b1", 6),
        snapshot: cardSnapshot,
      },
    ],
    configurationIds: [],
    contact,
    address,
    delivery: deliveryChoice,
    billing: { sameAsDelivery: true },
    goodsMinor: cardGoods,
    deliveryMinor: cardDelivery,
    vatMinor: cardVat,
    totalMinor: cardTotal,
    vatRateBps: vatBps,
    vatOnDelivery: false,
    step: "review",
    completedAt: paidAt,
  });
  await tx.insert(schema.paymentSchedules).values({ id: id("b1", 9), checkoutId: SEED_ORDERS.checkout, currency: "NGN", totalMinor: cardTotal });
  await tx.insert(schema.installments).values({ id: id("b1", 10), scheduleId: id("b1", 9), position: 1, label: "Pay in full", amountMinor: cardTotal, currency: "NGN", trigger: "ON_ACCEPTANCE", status: "PAID", paidAt });
  await tx.insert(schema.paymentIntents).values({ id: id("b1", 11), installmentId: id("b1", 10), amountMinor: cardTotal, currency: "NGN" });
  await tx.insert(schema.paymentAttempts).values({
    id: id("b1", 12),
    intentId: id("b1", 11),
    reference: `HPPAY-${id("b1", 12)}`,
    status: "SUCCEEDED",
    amountMinor: cardTotal,
    currency: "NGN",
    paidAmountMinor: cardTotal,
    paidCurrency: "NGN",
    channel: "card",
    gatewayResponse: "Successful",
    paidAt,
    finishedAt: paidAt,
  });
  await tx.update(schema.paymentIntents).set({ status: "SUCCEEDED", succeededAttemptId: id("b1", 12) }).where(eq(schema.paymentIntents.id, id("b1", 11)));
  await tx.insert(schema.orders).values({
    id: SEED_ORDERS.checkoutOrder,
    number: ORDER_B_NUMBER,
    checkoutId: SEED_ORDERS.checkout,
    customerId: customer.id,
    ownerUserId: userId,
    currency: "NGN",
    goodsMinor: cardGoods,
    deliveryMinor: cardDelivery,
    vatMinor: cardVat,
    totalMinor: cardTotal,
    vatRateBps: vatBps,
    contact,
    address,
    delivery: deliveryChoice,
    billing: { sameAsDelivery: true },
    placedAt: paidAt,
  });
  await tx.insert(schema.orderItems).values({
    id: id("b1", 7),
    orderId: SEED_ORDERS.checkoutOrder,
    position: 1,
    productName: cardTitle,
    summary: cardSummary,
    quantity: 500,
    goodsMinor: cardGoods,
    vatMinor: cardVat,
    totalMinor: cardGoods + cardVat,
    leadDays: { min: 3, max: 5 },
    snapshot: cardSnapshot,
    status: "QUEUED",
  });
  await tx.insert(schema.proofs).values({ id: id("b1", 13), orderItemId: id("b1", 7), status: "NOT_REQUIRED", requirement: "NOT_REQUIRED" });
  await tx.insert(schema.receipts).values({
    id: SEED_ORDERS.checkoutReceipt,
    number: "HP-R-TEST-0002",
    attemptId: id("b1", 12),
    intentId: id("b1", 11),
    orderId: SEED_ORDERS.checkoutOrder,
    customerId: customer.id,
    amountMinor: cardTotal,
    currency: "NGN",
    paystackReference: `HPPAY-${id("b1", 12)}`,
    channel: "card",
    payer: { name: contact.name, email: contact.email },
    lines: [{ label: `${cardTitle} · ${cardSummary}`, quantity: 500, totalMinor: (cardGoods + cardVat).toString() }],
    paidAt,
  });
}
