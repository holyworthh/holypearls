import type { TemplateOrderForm, TemplateOrderInput, TemplateOrderResult } from "@holypearls/contracts";
import { type Database, eq, schema } from "@holypearls/db";
import { configurationFromTemplate, previewTemplatePrice, quoteIn, quotable } from "../configuration/drafts.js";
import { productOptions } from "../configuration/pricing.js";
import { configurationChoices } from "../configuration/specification.js";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { enforce } from "../platform/policy.js";
import { addToCart } from "../sales/cart.js";
import { approvalCheck, createOrderRequest, policyFor } from "./approvals.js";
import { type Member, requireMember } from "./members.js";
import { needsPermission } from "./policies.js";
import type { OrganizationDeps } from "./team.js";
import { getTemplate } from "./templates.js";

/*
 * Order from a template (T11-01c; PRD-05 B2B-FR-033, Journey 8; frame 131).
 * A buyer changes only the fields the template marks editable, for one of
 * the template's locations that is also theirs. Today's price decides the
 * route: a direct price goes to the cart and checkout, anything else becomes
 * a quote request. A Template Order is not an Exact Reorder: it uses today's
 * template and prices. The saved copy of the template goes with the order
 * (TECH-01 §5). Internal approval arrives in T11-04.
 */

type Template = Awaited<ReturnType<typeof getTemplate>>;

/** The template's locations that the member can order for (frame 131 "Only your allowed locations are listed"). */
function allowedLocations(member: Member, template: Template, all: readonly { id: string; name: string }[]) {
  const templateIds = template.allLocations ? null : new Set(template.locations.map((location) => location.id));
  return all.filter((location) => (!templateIds || templateIds.has(location.id)) && (member.allLocations || member.locationIds.has(location.id)));
}

async function context(db: Database, actor: ActorContext, organizationId: string, templateId: string) {
  const member = await requireMember(db, actor, organizationId);
  const template = await getTemplate(db, actor, organizationId, templateId);
  const [row] = await db.select({ productId: schema.templates.productId, sourceConfigurationId: schema.templates.sourceConfigurationId }).from(schema.templates).where(eq(schema.templates.id, templateId));
  const locations = await db.select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.organizationId, organizationId)).orderBy(schema.locations.name);
  return { member, template, productId: row!.productId, sourceConfigurationId: row!.sourceConfigurationId, locations: allowedLocations(member, template, locations) };
}

const blockedReason = (member: Member, template: Template, locations: readonly unknown[]) =>
  template.status === "NEEDS_REVIEW"
    ? "Blocked — asset review required. This template's logo version was retired. Ask your workspace Admin to update it."
    : template.status !== "APPROVED"
      ? "This template isn't approved by HolyPearls yet, so it can't be ordered."
      : !member.permissions.has("CREATE_REQUESTS")
        ? "Your role can't place orders. Ask your workspace Admin."
        : !locations.length
          ? "None of your locations can order this template."
          : null;

export async function templateOrderForm(db: Database, actor: ActorContext, organizationId: string, templateId: string): Promise<TemplateOrderForm> {
  const { member, template, productId, sourceConfigurationId, locations } = await context(db, actor, organizationId, templateId);
  const [options, chosen] = await Promise.all([productOptions(db, productId), configurationChoices(db, sourceConfigurationId)]);
  const choices = template.fields.flatMap((field) => {
    if (field.control !== "EDITABLE" || !field.key.startsWith("option:")) return [];
    const option = options.find((item) => item.key === field.key.slice("option:".length));
    return option ? [{ key: option.key, label: field.label, reason: field.reason, value: chosen[option.key] ?? null, options: option.values.map((value) => ({ value: value.key, label: value.label })) }] : [];
  });
  const quantity = template.fields.find((field) => field.key === "quantity");
  const [source] = await db.select({ quantity: schema.configurations.quantity }).from(schema.configurations).where(eq(schema.configurations.id, sourceConfigurationId));
  const policy = await policyFor(db, organizationId);
  const applies = policy.rule === "ALL" || (policy.rule === "REQUESTERS" && policy.requesterIds.has(member.membershipId)) ? "ALWAYS" : policy.rule === "ABOVE_AMOUNT" ? "ABOVE_AMOUNT" : "NEVER";
  return {
    template,
    choices,
    quantity: { editable: quantity?.control !== "LOCKED", value: source?.quantity ?? null, reason: quantity?.reason ?? "Chosen per order" },
    locations,
    blocked: blockedReason(member, template, locations),
    approval: { applies, thresholdMinor: applies === "ABOVE_AMOUNT" ? (policy.thresholdMinor?.toString() ?? null) : null },
  };
}

/**
 * The buyer's changes, checked against the template's controls: a locked
 * field can't be changed by any route (B2B-FR-031; frame 131 "Can't change
 * colour"), and an unknown field is a validation error.
 */
function checkChanges(template: Template, input: { choices: Record<string, string>; quantity: number }, sourceQuantity: number | null) {
  for (const key of Object.keys(input.choices)) {
    const field = template.fields.find((item) => item.key === `option:${key}`);
    if (!field) throw new AppError("VALIDATION_FAILED", { fieldErrors: { [`choices.${key}`]: "This template has no such choice." } });
    if (field.control === "LOCKED") throw lockedField(field.label, field.key);
  }
  const quantity = template.fields.find((item) => item.key === "quantity");
  if (quantity?.control === "LOCKED" && input.quantity !== sourceQuantity) throw lockedField(quantity.label, quantity.key);
}

const lockedField = (label: string, key: string) =>
  new AppError("RULE_FAILED", { message: `${label} is set by your company and can't be changed on this order.`, context: { reason: "LOCKED_FIELD", field: key } });

/** Today's price for the buyer's choices (frame 131's price panel). Nothing is saved. */
export async function previewTemplateOrder(db: Database, actor: ActorContext, organizationId: string, templateId: string, input: { choices: Record<string, string>; quantity: number }) {
  const { template, sourceConfigurationId } = await context(db, actor, organizationId, templateId);
  const [source] = await db.select({ quantity: schema.configurations.quantity }).from(schema.configurations).where(eq(schema.configurations.id, sourceConfigurationId));
  checkChanges(template, input, source?.quantity ?? null);
  return previewTemplatePrice(db, sourceConfigurationId, input, actor.now);
}

export async function orderFromTemplate(deps: OrganizationDeps, actor: ActorContext, organizationId: string, templateId: string, input: TemplateOrderInput): Promise<TemplateOrderResult> {
  const db = deps.db;
  if (actor.type !== "user") throw new AppError("NOT_SIGNED_IN");
  const { member, template, sourceConfigurationId, locations } = await context(db, actor, organizationId, templateId);
  enforce(needsPermission(member, "CREATE_REQUESTS"));
  if (template.version !== input.templateVersion) throw new AppError("VERSION_CONFLICT", { message: "This template changed. Reload to see the current version.", context: { currentVersion: template.version } });
  if (template.status !== "APPROVED") {
    throw new AppError("RULE_FAILED", { message: blockedReason(member, template, locations) ?? "This template can't be ordered.", context: { reason: template.status === "NEEDS_REVIEW" ? "TEMPLATE_BLOCKED" : "TEMPLATE_NOT_APPROVED" } });
  }
  if (!locations.some((location) => location.id === input.locationId)) throw new AppError("FORBIDDEN", { context: { reason: "LOCATION_NOT_ALLOWED" } });
  const [source] = await db.select({ quantity: schema.configurations.quantity }).from(schema.configurations).where(eq(schema.configurations.id, sourceConfigurationId));
  checkChanges(template, input, source?.quantity ?? null);

  const editable = template.fields.filter((field) => field.control === "EDITABLE").map((field) => field.key);
  const draft = await configurationFromTemplate(db, actor, {
    sourceConfigurationId,
    choices: input.choices,
    quantity: input.quantity,
    controls: { templateId, organizationId, locationId: input.locationId, name: template.name, editable },
  });
  const estimate = draft.price?.totalMinor ? BigInt(draft.price.totalMinor) : null;
  const approval = await approvalCheck(db, member, estimate, actor.session.name);
  const route = approval.needed ? "APPROVAL" : draft.price?.state === "PRICE_READY" && draft.price.valid ? "CHECKOUT" : "QUOTE";
  const access = { actor, deviceKey: null };
  const snapshot = {
    schema: "template-order/v1",
    templateId,
    name: template.name,
    templateVersion: template.version,
    productName: template.productName,
    fields: template.fields,
    assets: template.assets,
    choices: input.choices,
    quantity: input.quantity,
    locationId: input.locationId,
    orderedAt: actor.now.toISOString(),
  };
  const record = async (tx: Parameters<Parameters<Database["transaction"]>[0]>[0], reference: string | null) => {
    await tx.insert(schema.templateOrders).values({ templateId, organizationId, locationId: input.locationId, configurationId: draft.id, orderedByUserId: actor.session.userId, route, snapshot });
    await recordAudit(tx, actor, {
      action: "template.ordered",
      summary: `Ordered from template ${template.name}${reference ? ` (quote ${reference})` : ""}`,
      recordType: "TEMPLATE",
      recordId: templateId,
      after: { configurationId: draft.id, route, locationId: input.locationId, quantity: input.quantity, reference },
    });
  };

  if (route === "APPROVAL") {
    // Over the organization's rule: an order request waits for an approver (frame 131 "Approval needed").
    const request = await db.transaction(async (tx) => {
      const created = await createOrderRequest(deps, tx, actor, member, {
        locationId: input.locationId,
        title: `${template.name} × ${input.quantity.toLocaleString("en-NG")}`,
        designs: [draft],
        estimateMinor: estimate,
        currency: draft.price?.currency ?? "NGN",
        policyNote: approval.note,
        templateName: template.name,
      });
      await record(tx, null);
      return created;
    });
    return { route, configurationId: draft.id, next: `/workspace/${organizationId}/approvals/${request.id}`, reference: null };
  }
  if (route === "CHECKOUT") {
    await addToCart(db, access, draft.id);
    await db.transaction((tx) => record(tx, null));
    return { route, configurationId: draft.id, next: "/cart", reference: null };
  }
  const checked = await quotable(db, access, draft.id);
  if ("reference" in checked) throw new AppError("CONFLICT");
  const reference = await db.transaction(async (tx) => {
    const ref = await quoteIn(tx, deps, access, checked, {
      email: actor.session.email,
      name: actor.session.name,
      note: `Ordered from the ${template.name} template.`,
      placedFor: { organizationId, locationId: input.locationId },
    });
    await record(tx, ref);
    return ref;
  });
  return { route, configurationId: draft.id, next: "/account", reference };
}
