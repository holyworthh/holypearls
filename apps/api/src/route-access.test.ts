import { apiErrorSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testIdempotencyKey } from "./testing/actors.js";
import { orderFlows } from "./testing/flows.js";
import { createHarness, type Harness, TEST_ADMIN_PROXY_SECRET as ADMIN_SECRET, TEST_WEB_ORIGIN, TEST_WEB_PROXY_SECRET as WEB_SECRET } from "./testing/harness.js";
import { listRoutes, type RouteInfo } from "./testing/routes.js";

/*
 * T15-01, TECH-03 §17 and TECH-06 §13: one generated test over every route the
 * router serves. Anything not listed as open is private, so a new route fails
 * here until it is made private or someone lists it on purpose. Run with
 * ROUTE_REPORT=<file> to write the coverage table there.
 */

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 });

const ADMIN_ORIGIN = "http://localhost:3002";

/** Routes that need no identity, or answer only for the visitor's own device or secret link. Each has its reason. */
const OPEN_ROUTES: Record<string, string> = {
  "GET /health/live": "health check",
  "GET /health/ready": "health check",
  "GET /v1/catalogue/categories": "public catalogue",
  "GET /v1/catalogue/hubs/:slug": "public catalogue",
  "GET /v1/catalogue/navigation": "public catalogue",
  "GET /v1/catalogue/products": "public catalogue",
  "GET /v1/catalogue/products/:slug": "public catalogue",
  "GET /v1/catalogue/suggest": "public search suggestions",
  "POST /v1/catalogue/products/:slug/price": "public price check",
  "GET /v1/content": "published content",
  "GET /v1/content/:type/:slug": "published content",
  "GET /v1/content/preview/:token": "staff preview link: the token is the secret",
  "GET /v1/content/preview/:token/media/:fileId/:kind": "staff preview link: the token is the secret",
  "GET /v1/media/:fileId/:kind": "public media",
  "GET /v1/search": "public search",
  "POST /v1/search/clicks": "anonymous search analytics",
  "POST /v1/analytics/events": "anonymous analytics beacon",
  "GET /v1/seo/sitemap": "public sitemap",
  "GET /v1/cart": "the visitor's own device cart",
  "POST /v1/configurations": "starts a draft on the visitor's device",
  "POST /v1/projects": "starts a project on the visitor's device",
  "GET /v1/projects/current": "the visitor's own device project",
  "POST /v1/help-requests": "contact form",
  "POST /v1/orders/find": "order lookup by emailed link, never by order number alone",
  "POST /v1/guest-links/redeem": "the link's secret is the credential",
  "DELETE /v1/guest-session": "ends the caller's own guest session",
  "GET /v1/invitations/preview": "invitation link: the token is the secret",
  "POST /v1/invitations/accept": "invitation link: the token is the secret",
  "GET /v1/staff-invitations/preview": "invitation link: the token is the secret",
  "POST /v1/staff-invitations/accept": "invitation link: the token is the secret",
  "POST /v1/collections/join": "collection link: the code is the secret",
  "POST /v1/collections/invite": "collection link: the code is the secret",
  "POST /v1/webhooks/paystack": "signed by Paystack",
  "POST /v1/webhooks/shipbubble": "signed by Shipbubble",
};

/** Routes whose parameter names a list, not a record, so they answer with the caller's own data. */
const STRANGER_EXEMPT: Record<string, string> = {
  "GET /v1/me/history/:list": ":list is orders, quotes, projects and so on, always the signed-in caller's own",
};

/** Writes that carry no rate-limit class, with the reason. */
const RATE_LIMIT_EXEMPT: Record<string, string> = {
  "POST /v1/webhooks/paystack": "signed by Paystack and checked against the raw body",
  "POST /v1/webhooks/shipbubble": "signed by Shipbubble and checked against the raw body",
  "DELETE /v1/guest-session": "only ends the caller's own guest session",
};

let harness: Harness;
/** A second API on the same database with one front end, so the flows can drive staff and customers the way other tests do. */
let setup: Harness;
let gateway: FakeGateway;
let routes: RouteInfo[];
const db = () => harness.database.db;

/** Real record IDs by "resource:parameter" (the path segment before the parameter, then its name). */
let fixtures: Record<string, string> = {};

const NON_ID_PARAMS: Record<string, string> = { ":action": "pause", ":list": "orders", ":position": "1" };

/** Fills the path's parameters. `real` is true when every ID parameter had a fixture. */
function fill(path: string, useFixtures: boolean) {
  let real = true;
  const parts = path.split("/");
  const url = parts
    .map((part, index) => {
      if (!part.startsWith(":")) return part;
      if (NON_ID_PARAMS[part]) return NON_ID_PARAMS[part];
      const id = useFixtures ? fixtures[`${parts[index - 1]}:${part.slice(1)}`] : undefined;
      if (!id) real = false;
      return id ?? randomUUID();
    })
    .join("/");
  return { url, real: real && useFixtures };
}

const hasParams = (path: string) => path.includes("/:");

interface Sent {
  status: number;
  code?: string;
  reason?: string;
}

function send(route: RouteInfo, url: string, as: { cookie?: string; admin?: boolean }): Promise<Sent> {
  const agent = request(harness.url);
  const test = { GET: agent.get, POST: agent.post, PUT: agent.put, PATCH: agent.patch, DELETE: agent.delete }[route.method].call(agent, url);
  test.set("origin", as.admin ? ADMIN_ORIGIN : TEST_WEB_ORIGIN);
  if (as.admin) test.set("x-hp-surface", "admin").set("x-hp-proxy-secret", ADMIN_SECRET);
  if (as.cookie) test.set("cookie", as.cookie);
  if (route.method !== "GET") test.set("idempotency-key", testIdempotencyKey()).send({});
  return test.then((response) => {
    const parsed = apiErrorSchema.safeParse(response.body);
    return { status: response.status, code: parsed.success ? parsed.data.code : undefined, reason: parsed.success ? String(parsed.data.context?.reason ?? "") : undefined };
  });
}

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway, adminOrigin: ADMIN_ORIGIN, adminProxySecret: ADMIN_SECRET, proxySecret: WEB_SECRET });
  setup = await createHarness({ payments: gateway, database: harness.database });
  routes = listRoutes(harness.app);
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
});

afterAll(async () => {
  await setup?.close();
  await harness?.close();
});

describe("every route the router serves", () => {
  it("is private unless listed as open: signed-out, stranger and staff checks", async () => {
    const flows = orderFlows(() => setup, () => gateway);
    const ada = flows.staff(await setup.signInAs("adminAda"));
    const cookies = {
      chidi: await harness.signInAs("customerChidi"),
      folake: await harness.signInAs("financeFolake"),
      tunde: await harness.signInAs("adminTunde"),
      noMfa: await harness.signInAs("catalogueNoMfa"),
      acmeOwner: await harness.signInAs("acmeOwner"),
    };

    // Fixtures: one paid order (owner: a browser), one accepted quote (owner: a guest link), and what hangs off them.
    const paid = await flows.paidOrder();
    const quoted = await flows.acceptedQuote(ada);
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, paid.orderId));
    const [receipt] = await db().select().from(schema.receipts).where(eq(schema.receipts.orderId, paid.orderId));
    const [item] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, paid.orderId));
    const [proof] = await db().select().from(schema.proofs).where(eq(schema.proofs.orderItemId, quoted.items[0]!.id));
    const [quoteOrder] = await db().select().from(schema.orders).where(eq(schema.orders.id, quoted.orderId));
    const [quoteVersion] = await db().select().from(schema.quoteVersions).where(eq(schema.quoteVersions.id, quoteOrder!.quoteVersionId!));
    const [quote] = await db().select().from(schema.quotes).where(eq(schema.quotes.id, quoteVersion!.quoteId));
    const [organization] = await db().select().from(schema.organizations).where(sql`${schema.organizations.name} like 'ACME%'`);
    const intent = await quoted.guest.post("/v1/files/uploads", { purpose: "ARTWORK", fileName: "logo.png", size: 1000, contentType: "image/png" });
    const help = await quoted.guest.post("/v1/help-requests", {
      message: "Where is my order?",
      email: quoted.email,
      context: { page: { path: "/orders", title: "Orders" }, step: "Orders", product: { id: "prod_polo", label: "Polo Shirt" }, configuration: { id: "cfg_1", label: "Polo", summary: "left chest" }, files: [{ id: "file_1", label: "logo.ai", status: "READY" }] },
    });
    const project = await paid.b.post("/v1/projects", { type: "EVENT", title: "Attack suite (TEST DATA)" });
    expect([intent.status, help.status, project.status]).toEqual([201, 201, 201]);
    fixtures = {
      "orders:id": paid.orderId,
      "orders:orderId": paid.orderId,
      "receipts:receiptId": receipt!.id,
      "checkouts:id": order!.checkoutId!,
      "configurations:id": item!.configurationId!,
      "saved:configurationId": item!.configurationId!,
      "projects:id": project.body.id,
      "quotes:id": quote!.id,
      "proofs:id": proof!.id,
      "proofs:proofId": proof!.id,
      "files:id": intent.body.file.id,
      "help-requests:id": help.body.id,
      "organizations:organizationId": organization!.id,
    };

    // Positive controls, so "hidden from a stranger" can't pass because the record is missing.
    const owner = async (url: string) => (await paid.b.get(url)).status;
    const guestOwner = async (url: string) => (await quoted.guest.get(url)).status;
    expect(await owner(`/v1/orders/${paid.orderId}`)).toBe(200);
    expect(await owner(`/v1/orders/${paid.orderId}/receipts/${receipt!.id}`)).toBe(200);
    expect(await owner(`/v1/checkouts/${fixtures["checkouts:id"]}`)).toBe(200);
    expect(await guestOwner(`/v1/files/${fixtures["files:id"]}`)).toBe(200);
    expect(await guestOwner(`/v1/help-requests/${fixtures["help-requests:id"]}`)).toBe(200);
    expect((await quoted.guest.get(`/v1/orders/${quoted.orderId}`)).status).toBe(200);
    expect((await quoted.guest.get(`/v1/quotes/${quote!.id}`)).status).toBe(200);
    expect(await owner(`/v1/projects/${fixtures["projects:id"]}`)).toBe(200);
    expect((await request(harness.url).get(`/v1/organizations/${organization!.id}`).set("origin", TEST_WEB_ORIGIN).set("cookie", cookies.acmeOwner)).status).toBe(200);

    const failures: string[] = [];
    const rows: { route: RouteInfo; kind: string; signedOut: string; stranger: string; staff: string }[] = [];
    const fail = (route: RouteInfo, what: string, got: unknown) => failures.push(`${route.key}: ${what}; got ${JSON.stringify(got)}`);
    const show = (sent: Sent) => `${sent.status}${sent.code ? ` ${sent.code}` : ""}`;

    // Every open entry must be a real route, so stale entries fail.
    const keys = new Set(routes.map((route) => route.key));
    for (const key of [...Object.keys(OPEN_ROUTES), ...Object.keys(RATE_LIMIT_EXEMPT), ...Object.keys(STRANGER_EXEMPT)]) if (!keys.has(key)) failures.push(`${key}: listed but the router has no such route`);

    for (const route of routes) {
      const admin = route.path.startsWith("/v1/admin/") || route.staffPermission !== undefined;
      const open = route.key in OPEN_ROUTES;
      const kind = admin ? "admin" : open ? "open" : "private";
      const row = { route, kind, signedOut: "-", stranger: "-", staff: "-" };
      rows.push(row);
      const seen: Sent[] = [];
      const record = async (as: { cookie?: string; admin?: boolean }, url: string) => {
        const sent = await send(route, url, as);
        seen.push(sent);
        return sent;
      };

      if (admin) {
        const { url } = fill(route.path, false);
        const adminAs = (cookie?: string) => record({ cookie, admin: true }, url);
        const signedOut = await adminAs();
        row.signedOut = show(signedOut);
        if (signedOut.status !== 404) fail(route, "signed-out admin request should be 404", signedOut);
        const customer = await adminAs(cookies.chidi);
        if (customer.status !== 404) fail(route, "a customer on the admin should get 404", customer);
        const noMfa = await adminAs(cookies.noMfa);
        if (noMfa.status !== 403 || noMfa.code !== "MFA_REQUIRED") fail(route, "staff without MFA should get 403 MFA_REQUIRED", noMfa);
        const parts = [show(noMfa)];
        if (typeof route.staffPermission === "string") {
          const without = await adminAs(route.staffPermission === "PAYMENT_VIEW" ? cookies.tunde : cookies.folake);
          if (without.status !== 403 || without.code !== "FORBIDDEN") fail(route, `staff without ${route.staffPermission} should get 403 FORBIDDEN`, without);
          parts.push(show(without));
        }
        row.staff = parts.join(" / ");
      } else {
        if (open) {
          // An open route still must not fall over on an empty or unknown request.
          row.signedOut = show(await record({}, fill(route.path, false).url));
        } else {
          const { url } = fill(route.path, true);
          const signedOut = await record({}, url);
          row.signedOut = show(signedOut);
          if (signedOut.status !== 401 && signedOut.status !== 404) fail(route, "signed-out request should be 401 or 404", signedOut);
        }
        if (hasParams(route.path) && !(route.key in STRANGER_EXEMPT)) {
          const real = fill(route.path, true);
          const random = fill(route.path, false);
          const seenReal = await record({ cookie: cookies.chidi }, real.url);
          const seenRandom = await record({ cookie: cookies.chidi }, random.url);
          row.stranger = `${real.real ? "real" : "random"} ${show(seenReal)} / random ${show(seenRandom)}`;
          if (seenReal.status < 300 || seenRandom.status < 300) fail(route, "a stranger must not get a success", { real: seenReal, random: seenRandom });
          if (seenReal.status !== seenRandom.status || seenReal.code !== seenRandom.code) fail(route, "a stranger must not tell a real record from a random ID", { real: seenReal, random: seenRandom });
          if (route.method === "GET" && !open && ![403, 404].includes(seenReal.status)) fail(route, "a stranger's read should be 403 or 404", seenReal);
        }
      }
      for (const sent of seen) if (sent.status >= 500) fail(route, "must never be 5xx", sent);
    }

    if (process.env.ROUTE_REPORT) {
      const lines = rows.map(({ route, kind, signedOut, stranger, staff }) => `| ${route.key} | ${kind} | ${route.rateLimit ?? "-"} | ${route.staffPermission === undefined ? "-" : (route.staffPermission ?? "any staff")} | ${signedOut} | ${stranger} | ${staff} |`);
      writeFileSync(process.env.ROUTE_REPORT, `\n| Route | Kind | Rate limit | Permission | Signed out | Stranger (customer) | Staff checks |\n|---|---|---|---|---|---|---|\n${lines.join("\n")}\n`);
    }
    expect(failures.join("\n")).toBe("");
    expect(rows.length).toBe(routes.length);
  });

  it("gives every write a rate-limit class, and every admin write ADMIN_WRITE", () => {
    const failures: string[] = [];
    for (const route of routes) {
      if (route.method === "GET") continue;
      if (!route.rateLimit && !(route.key in RATE_LIMIT_EXEMPT)) failures.push(`${route.key}: write with no rate-limit class`);
      const admin = route.path.startsWith("/v1/admin/") || route.staffPermission !== undefined;
      if (admin && route.rateLimit !== "ADMIN_WRITE") failures.push(`${route.key}: admin write should be ADMIN_WRITE, got ${route.rateLimit}`);
    }
    expect(failures.join("\n")).toBe("");
  });
});
