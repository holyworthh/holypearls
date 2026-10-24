import type { AdminProblem } from "@holypearls/contracts";
import { PROBLEM_TYPE_LABEL } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, schema, sql, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink, customerForActor, ofPerson, type PersonSubject } from "../identity/customers.js";
import { attachFile, findFileForActor } from "../files/files.js";
import { loadOrderFor, type OrderAccess, type OrderEmailDeps } from "../orders/orders.js";
import { recordAudit, withoutPersonalData } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";

/*
 * Report a problem (T08-01; FUL-FR-070). The customer picks the item, the
 * type of issue, how many are affected, adds photos and a description, and
 * gets a reference number (HP-RP-2026-0012). Only someone who can open the
 * order can report on it (a guest's link opens one order; anything else is
 * 404). Staff triage it: NEW → TRIAGED → CLOSED, with an internal note and
 * replies emailed to the customer. Full claims handling isn't part of launch.
 */

type Row = typeof schema.problemReports.$inferSelect;

async function nextNumber(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], now: Date) {
  const result = await tx.execute<{ n: string }>(sql`select nextval('problem_report_seq')::text as n`);
  return `HP-RP-${now.getUTCFullYear()}-${result.rows[0]!.n.padStart(4, "0")}`;
}

export async function customerProblems(db: Database, orderId: string) {
  const rows = await db
    .select({ report: schema.problemReports, item: schema.orderItems.productName })
    .from(schema.problemReports)
    .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.problemReports.orderItemId))
    .where(eq(schema.problemReports.orderId, orderId))
    .orderBy(desc(schema.problemReports.createdAt));
  return rows.map(({ report, item }) => ({ id: report.id, number: report.number, status: report.status, type: report.type, item, quantity: report.quantity, createdAt: report.createdAt.toISOString() }));
}

/** FUL-FR-070: a report on the customer's own order, with a reference and an email. */
export async function reportProblem(
  deps: OrderEmailDeps,
  access: OrderAccess,
  orderId: string,
  input: { itemPosition: number; type: Row["type"]; quantity: number; description: string; photoFileIds: string[] },
) {
  const order = await loadOrderFor(deps.db, access, orderId);
  const [item] = await deps.db
    .select()
    .from(schema.orderItems)
    .where(and(eq(schema.orderItems.orderId, order.id), eq(schema.orderItems.position, input.itemPosition)));
  if (!item) throw new AppError("NOT_FOUND");
  if (input.quantity > item.quantity) throw new AppError("VALIDATION_FAILED", { fieldErrors: { quantity: `This item has ${item.quantity.toLocaleString("en-NG")}. Enter ${item.quantity.toLocaleString("en-NG")} or fewer.` } });
  // Photos must be the reporter's own uploads, checked and ready.
  for (const fileId of input.photoFileIds) {
    const file = await findFileForActor(deps.db, access.actor, fileId);
    if (file.purpose !== "PROBLEM_PHOTO" || file.ownerId) throw new AppError("VALIDATION_FAILED", { fieldErrors: { photoFileIds: "Add photos with the upload on this page." } });
  }
  const customer = await customerForActor(deps.db, access.actor);
  const report = await deps.db.transaction(async (tx) => {
    const number = await nextNumber(tx, access.actor.now);
    const [row] = await tx
      .insert(schema.problemReports)
      .values({ number, orderId: order.id, orderItemId: item.id, customerId: customer?.id ?? order.customerId, type: input.type, quantity: input.quantity, description: input.description })
      .returning();
    for (const fileId of input.photoFileIds) {
      await tx.insert(schema.problemReportPhotos).values({ problemReportId: row!.id, fileId });
      await attachFile(tx, fileId, { type: "PROBLEM_REPORT", id: row!.id });
    }
    await recordAudit(tx, access.actor, { action: "problem_report.created", summary: `${number}: ${PROBLEM_TYPE_LABEL[input.type]} · ${input.quantity} of ${item.productName} (${order.number})`, recordType: "PROBLEM_REPORT", recordId: row!.id, recordLabel: number });
    const contact = order.contact as { email: string };
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order.id, customerId: order.customerId, now: access.actor.now });
    await queueEmail(deps, tx, {
      template: "problem_received",
      to: contact.email,
      customerId: order.customerId,
      data: { orderNumber: order.number, reference: number, item: item.productName, url: link.url },
      record: { type: "ORDER", id: order.id, label: order.number },
      linkLabel: `Opens order ${order.number}`,
      requestId: access.actor.requestId,
    });
    return row!;
  });
  return { id: report.id, number: report.number, status: report.status, type: report.type, item: item.productName, quantity: report.quantity, createdAt: report.createdAt.toISOString() };
}

async function adminViews(db: Database, rows: Row[]): Promise<AdminProblem[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [items, orders, photos, replies, staff] = await Promise.all([
    db
      .select({ id: schema.orderItems.id, name: schema.orderItems.productName, quantity: schema.orderItems.quantity })
      .from(schema.orderItems)
      .where(
        inArray(
          schema.orderItems.id,
          rows.map((row) => row.orderItemId),
        ),
      ),
    db
      .select({ id: schema.orders.id, number: schema.orders.number, contact: schema.orders.contact })
      .from(schema.orders)
      .where(
        inArray(
          schema.orders.id,
          rows.map((row) => row.orderId),
        ),
      ),
    db
      .select({ reportId: schema.problemReportPhotos.problemReportId, id: schema.files.id, name: schema.files.safeName })
      .from(schema.problemReportPhotos)
      .innerJoin(schema.files, eq(schema.files.id, schema.problemReportPhotos.fileId))
      .where(inArray(schema.problemReportPhotos.problemReportId, ids)),
    db.select().from(schema.problemReplies).where(inArray(schema.problemReplies.problemReportId, ids)).orderBy(asc(schema.problemReplies.createdAt)),
    db.select({ id: schema.staffProfiles.id, name: schema.staffProfiles.displayName }).from(schema.staffProfiles),
  ]);
  return rows.map((row) => {
    const item = items.find((entry) => entry.id === row.orderItemId);
    const order = orders.find((entry) => entry.id === row.orderId);
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      type: row.type,
      item: item?.name ?? "",
      quantity: row.quantity,
      createdAt: row.createdAt.toISOString(),
      orderId: row.orderId,
      orderNumber: order?.number ?? "",
      ordered: item?.quantity ?? 0,
      customerName: (order?.contact as { name?: string } | undefined)?.name ?? "",
      description: row.description,
      triageNote: row.triageNote,
      version: row.version,
      photos: photos.filter((photo) => photo.reportId === row.id).map((photo) => ({ id: photo.id, name: photo.name })),
      replies: replies.filter((reply) => reply.problemReportId === row.id).map((reply) => ({ body: reply.body, by: staff.find((person) => person.id === reply.staffProfileId)?.name ?? "Staff", at: reply.createdAt.toISOString() })),
    };
  });
}

/** Staff queue (Pen 129 triage): open reports first, oldest first; closed on request. */
export async function problemQueue(db: Database, view: string | undefined) {
  const statuses = view === "closed" ? (["CLOSED"] as const) : (["NEW", "TRIAGED"] as const);
  const rows = await db.select().from(schema.problemReports).where(inArray(schema.problemReports.status, [...statuses])).orderBy(asc(schema.problemReports.createdAt)).limit(100);
  return { items: await adminViews(db, rows) };
}

export async function getProblem(db: Database, id: string) {
  const [row] = await db.select().from(schema.problemReports).where(eq(schema.problemReports.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return (await adminViews(db, [row]))[0]!;
}

/** NEW → TRIAGED → CLOSED (TECH-01 §4), with an internal note. */
export async function triageProblem(db: Database, actor: ActorContext, id: string, input: { version: number; status: "TRIAGED" | "CLOSED"; triageNote?: string }) {
  const staffId = actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null;
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.problemReports).where(eq(schema.problemReports.id, id)).for("update");
    if (!row) throw new AppError("NOT_FOUND");
    if (row.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { latest: (await adminViews(db, [row]))[0] } });
    const allowed = row.status === "NEW" ? ["TRIAGED", "CLOSED"] : row.status === "TRIAGED" ? ["CLOSED"] : [];
    if (!allowed.includes(input.status)) throw new AppError("RULE_FAILED", { message: `${row.number} can't move from ${row.status} to ${input.status}.`, context: { reason: "ILLEGAL_MOVE" } });
    await tx
      .update(schema.problemReports)
      .set({
        status: input.status,
        ...(input.triageNote !== undefined && { triageNote: input.triageNote || null }),
        ...(input.status === "TRIAGED" && { triagedAt: actor.now, triagedByStaffId: staffId }),
        ...(input.status === "CLOSED" && { closedAt: actor.now }),
        version: sql`${schema.problemReports.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.problemReports.id, id));
    await recordAudit(tx, actor, { action: "problem_report.status_changed", summary: `${row.number}: ${row.status} → ${input.status}`, recordType: "PROBLEM_REPORT", recordId: id, recordLabel: row.number, permission: "CUSTOMER_SUPPORT" });
  });
  return getProblem(db, id);
}

/** A reply to the customer, kept with the report and emailed. */
export async function replyToProblem(deps: OrderEmailDeps, actor: ActorContext, id: string, input: { body: string }) {
  const staffId = actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null;
  await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.problemReports).where(eq(schema.problemReports.id, id));
    if (!row) throw new AppError("NOT_FOUND");
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, row.orderId));
    await tx.insert(schema.problemReplies).values({ problemReportId: id, body: input.body, staffProfileId: staffId });
    await recordAudit(tx, actor, { action: "problem_report.replied", summary: `Replied on ${row.number}`, recordType: "PROBLEM_REPORT", recordId: id, recordLabel: row.number, permission: "CUSTOMER_SUPPORT" });
    const contact = order!.contact as { email: string };
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order!.id, customerId: order!.customerId, now: actor.now });
    await queueEmail(deps, tx, {
      template: "problem_reply",
      to: contact.email,
      customerId: order!.customerId,
      data: { reference: row.number, body: input.body, url: link.url },
      record: { type: "ORDER", id: order!.id, label: order!.number },
      linkLabel: `Opens order ${order!.number}`,
      requestId: actor.requestId,
    });
  });
  return getProblem(deps.db, id);
}

/** Privacy export (T15-03): problem reports the person sent, with the replies. */
export async function problemsForPerson(db: Database, subject: PersonSubject) {
  const reports = await db
    .select({ id: schema.problemReports.id, number: schema.problemReports.number, type: schema.problemReports.type, description: schema.problemReports.description, status: schema.problemReports.status, createdAt: schema.problemReports.createdAt })
    .from(schema.problemReports)
    .where(ofPerson(subject, schema.problemReports.customerId));
  const replies = reports.length
    ? await db.select({ problemReportId: schema.problemReplies.problemReportId, body: schema.problemReplies.body, createdAt: schema.problemReplies.createdAt }).from(schema.problemReplies).where(inArray(schema.problemReplies.problemReportId, reports.map((report) => report.id)))
    : [];
  return reports.map((report) => ({ ...report, replies: replies.filter((reply) => reply.problemReportId === report.id) }));
}

/** Privacy erasure (T15-03): free text loses emails and phone numbers; the report stays as the order's history. */
export async function eraseProblems(tx: Transaction, subject: PersonSubject) {
  const reports = await tx.select({ id: schema.problemReports.id, description: schema.problemReports.description }).from(schema.problemReports).where(ofPerson(subject, schema.problemReports.customerId));
  if (!reports.length) return;
  for (const report of reports) await tx.update(schema.problemReports).set({ description: String(withoutPersonalData(report.description)) }).where(eq(schema.problemReports.id, report.id));
  const replies = await tx.select({ id: schema.problemReplies.id, body: schema.problemReplies.body }).from(schema.problemReplies).where(inArray(schema.problemReplies.problemReportId, reports.map((report) => report.id)));
  for (const reply of replies) await tx.update(schema.problemReplies).set({ body: String(withoutPersonalData(reply.body)) }).where(eq(schema.problemReplies.id, reply.id));
}
