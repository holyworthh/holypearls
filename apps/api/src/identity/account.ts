import { ACCOUNT_LISTS, type AccountHistory, type AccountLinking, type AccountList, type Profile, type ProfileInput } from "@holypearls/contracts";
import { type Database, eq, schema } from "@holypearls/db";
import { accountDrafts, linkCustomerDrafts } from "../configuration/drafts.js";
import { AppError } from "../errors.js";
import { accountOrders, accountReceipts, ordersBefore } from "../orders/orders.js";
import { recordAudit } from "../platform/audit.js";
import { accountProjects, linkCustomerProjects } from "../projects/projects.js";
import { accountQuotes, quotesBefore } from "../quotes/customer.js";
import { VERIFY_EMAIL_SECONDS } from "@holypearls/auth";
import type { ActorContext } from "./actor.js";
import { ensureAccountCustomer, linkCustomersToVerifiedEmail } from "./customers.js";

type UserActor = Extract<ActorContext, { type: "user" }>;
const DAY_MS = 86_400_000;
/** How long the overview announces records that linking added. */
const LINK_NEWS_DAYS = 14;

/**
 * An account's email was just verified (TECH-03 §6): its email's customer
 * record joins the account, which brings every order, quote, proof and
 * receipt placed with that email. Designs and projects started as a guest
 * with that record join too. Safe to run again; nothing already owned moves.
 */
export async function linkVerifiedAccount(db: Database, user: { id: string; email: string; name: string }, now = new Date()) {
  const linked = await linkCustomersToVerifiedEmail(db, user.id, user.email, now);
  const own = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.userId, user.id));
  const ids = own.map((row) => row.id);
  await linkCustomerDrafts(db, ids, user.id);
  await linkCustomerProjects(db, ids, user.id);
  if (linked) {
    await recordAudit(db, null, {
      action: "account.guest_records_linked",
      summary: "Earlier guest records joined the account after its email was verified",
      recordType: "USER",
      recordId: user.id,
      recordLabel: user.name,
    });
  }
  return linked;
}

/** What the API does when the sign-in library verifies an email or resets a password. */
export const accountEvents = (db: Database) => ({
  onEmailVerified: async (user: { id: string; email: string; name: string }) => {
    await linkVerifiedAccount(db, user);
  },
  onEmailChanged: async (user: { id: string; email: string; name: string }) => {
    await recordAudit(db, null, { action: "security.email_changed", summary: "Account email changed after the new address was verified; other sessions ended", recordType: "USER", recordId: user.id, recordLabel: user.name });
  },
  onPasswordReset: async (user: { id: string; name: string }) => {
    await recordAudit(db, null, { action: "security.password_reset", summary: "Password reset by email link; other sessions ended", recordType: "USER", recordId: user.id, recordLabel: user.name });
  },
});

/** The customer record the account owns: only ever one joined by a verified email. */
async function ownCustomer(db: Database, userId: string) {
  const [row] = await db.select().from(schema.customers).where(eq(schema.customers.userId, userId)).limit(1);
  return row ?? null;
}

async function linking(db: Database, actor: UserActor): Promise<AccountLinking> {
  if (!actor.session.emailVerified) return { state: "UNVERIFIED" };
  // Accounts verified before linking ran at verification catch up here.
  await linkVerifiedAccount(db, { id: actor.session.userId, email: actor.session.email, name: actor.session.name }, actor.now);
  const own = await ownCustomer(db, actor.session.userId);
  const [user] = await db.select({ createdAt: schema.users.createdAt }).from(schema.users).where(eq(schema.users.id, actor.session.userId));
  if (!own || !user) return { state: "NOTHING_LINKED" };
  const [orders, quotes] = await Promise.all([ordersBefore(db, own.id, user.createdAt), quotesBefore(db, own.id, user.createdAt)]);
  if (!orders && !quotes) return { state: "NOTHING_LINKED" };
  const recent = Boolean(own.emailVerifiedAt && actor.now.getTime() - own.emailVerifiedAt.getTime() < LINK_NEWS_DAYS * DAY_MS);
  return { state: "LINKED", orders, quotes, recent };
}

/** The account overview (PRD-00 §5, Pen frame 92): drafts to resume, orders, quotes and projects, receipts. */
export async function accountHistory(db: Database, actor: UserActor): Promise<AccountHistory> {
  const userId = actor.session.userId;
  const link = await linking(db, actor);
  const [designs, projects, orders, quotes, receipts] = await Promise.all([
    accountDrafts(db, userId, actor.now),
    accountProjects(db, userId),
    accountOrders(db, userId),
    accountQuotes(db, userId),
    accountReceipts(db, userId),
  ]);
  return {
    linking: link,
    drafts: [...designs, ...projects.drafts].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    orders,
    quotes: [...quotes, ...projects.sent],
    receipts,
  };
}

/** A new email still waiting for its check link; once the link has expired, there's nothing pending. */
async function pendingEmail(db: Database, actor: UserActor) {
  const [user] = await db.select({ email: schema.users.pendingEmail, at: schema.users.pendingEmailAt }).from(schema.users).where(eq(schema.users.id, actor.session.userId));
  return user?.email && user.at && actor.now.getTime() - user.at.getTime() < VERIFY_EMAIL_SECONDS * 1000 ? user.email : null;
}

// ponytail: one page of the newest 200; add paging when an account outgrows it.
const FULL_LIST = 200;

/** One history list in full (T09-01b): the overview shows only the newest few. Unknown lists are 404. */
export async function accountList(db: Database, actor: UserActor, list: string): Promise<AccountList> {
  const userId = actor.session.userId;
  const empty: AccountList = { drafts: [], orders: [], quotes: [], receipts: [] };
  if (!(ACCOUNT_LISTS as readonly string[]).includes(list)) throw new AppError("NOT_FOUND");
  if (list === "orders") return { ...empty, orders: await accountOrders(db, userId, FULL_LIST) };
  if (list === "quotes") return { ...empty, quotes: await accountQuotes(db, userId, FULL_LIST) };
  if (list === "receipts") return { ...empty, receipts: await accountReceipts(db, userId, FULL_LIST) };
  const projects = await accountProjects(db, userId, FULL_LIST);
  if (list === "projects") return { ...empty, drafts: projects.drafts, quotes: projects.sent };
  const designs = await accountDrafts(db, userId, actor.now, FULL_LIST);
  return { ...empty, drafts: [...designs, ...projects.drafts].sort((a, b) => b.savedAt.localeCompare(a.savedAt)) };
}

export async function getProfile(db: Database, actor: UserActor): Promise<Profile> {
  const own = await ownCustomer(db, actor.session.userId);
  return { name: actor.session.name, email: actor.session.email, phone: own?.phone ?? null, pendingEmail: await pendingEmail(db, actor) };
}

/**
 * Name and phone (Pen frame 91). The name is the account's; the phone lives on
 * the account's customer record, which exists once the email is verified, so
 * an unverified account can't write to a record it doesn't own.
 */
export async function updateProfile(db: Database, actor: UserActor, profile: ProfileInput): Promise<Profile> {
  const input = { name: profile.name, phone: profile.phone || null };
  const userId = actor.session.userId;
  // A verified account gets its own record here if it has never needed one (TECH-03 §6).
  const own = actor.session.emailVerified ? await ensureAccountCustomer(db, actor.session, actor.now) : null;
  if (input.phone && !own) {
    throw new AppError("RULE_FAILED", { message: "Verify your email first, then add a phone number.", context: { reason: "VERIFY_EMAIL_FIRST" } });
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ name: input.name, updatedAt: actor.now }).where(eq(schema.users.id, userId));
    if (own) await tx.update(schema.customers).set({ name: input.name, phone: input.phone, updatedAt: actor.now }).where(eq(schema.customers.id, own.id));
    await recordAudit(tx, actor, { action: "account.profile_updated", summary: "Profile updated", recordType: "USER", recordId: userId, recordLabel: input.name });
  });
  return { name: input.name, email: actor.session.email, phone: own ? input.phone : null, pendingEmail: await pendingEmail(db, actor) };
}
