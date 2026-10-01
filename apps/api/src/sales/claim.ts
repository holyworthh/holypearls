import { and, type Database, eq, schema, sql } from "@holypearls/db";
import type { DraftAccess } from "../configuration/drafts.js";
import { deviceHash } from "./cart.js";

/*
 * Signing in brings the browser's designs, cart and checkout into the account,
 * all in one transaction (review P1-04):
 *
 * 1. every design the browser started becomes the account's, so the account
 *    can open, edit and quote them on any device;
 * 2. the browser's cart becomes the account's cart, or its items join the
 *    account's existing cart (an item is unique per design, so nothing doubles);
 * 3. the browser's open checkout is abandoned: the account starts a fresh one,
 *    priced from what is now its cart. Older checkouts move to the account too,
 *    so no checkout is left with a browser owner and no cart.
 *
 * Safe to run on every request that has both a session and a device cookie:
 * once claimed, the browser owns nothing and this changes nothing. Two claims
 * at once queue on the browser cart's row lock.
 */
export async function claimDeviceCommerce(db: Database, access: DraftAccess): Promise<void> {
  if (access.actor.type !== "user" || !access.deviceKey) return;
  const userId = access.actor.session.userId;
  const device = deviceHash(access.deviceKey);
  const pending = await db.execute(sql`
    select 1 from ${schema.configurations} where ${schema.configurations.ownerDeviceHash} = ${device}
    union all select 1 from ${schema.carts} where ${schema.carts.ownerDeviceHash} = ${device}
    union all select 1 from ${schema.checkouts} where ${schema.checkouts.ownerDeviceHash} = ${device}
    limit 1`);
  if (!pending.rows.length) return;

  await db.transaction(async (tx) => {
    const [deviceCart] = await tx.select().from(schema.carts).where(eq(schema.carts.ownerDeviceHash, device)).for("update");
    const [accountCart] = await tx.select().from(schema.carts).where(eq(schema.carts.ownerUserId, userId)).for("update");

    await tx
      .update(schema.configurations)
      .set({ ownerUserId: userId, ownerDeviceHash: null })
      .where(eq(schema.configurations.ownerDeviceHash, device));

    await tx
      .update(schema.checkouts)
      .set({ status: "ABANDONED" })
      .where(and(eq(schema.checkouts.ownerDeviceHash, device), eq(schema.checkouts.status, "OPEN")));

    let cartId = accountCart?.id ?? null;
    if (deviceCart && !accountCart) {
      await tx.update(schema.carts).set({ ownerUserId: userId, ownerDeviceHash: null }).where(eq(schema.carts.id, deviceCart.id));
      cartId = deviceCart.id;
    } else if (deviceCart && accountCart) {
      await tx.update(schema.cartItems).set({ cartId: accountCart.id }).where(eq(schema.cartItems.cartId, deviceCart.id));
      // The browser's checkouts follow its items, so their answers can carry over to the account's next checkout.
      await tx.update(schema.checkouts).set({ cartId: accountCart.id }).where(eq(schema.checkouts.cartId, deviceCart.id));
      await tx.delete(schema.carts).where(eq(schema.carts.id, deviceCart.id));
    }

    await tx
      .update(schema.checkouts)
      .set({ ownerUserId: userId, ownerDeviceHash: null, ...(cartId ? { cartId } : {}) })
      .where(eq(schema.checkouts.ownerDeviceHash, device));
  });
}
