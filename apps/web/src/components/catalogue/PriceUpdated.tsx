import type { Configuration } from "@holypearls/contracts";
import { Notice } from "@holypearls/ui";
import { naira } from "@holypearls/web-kit/money";

/**
 * OPS-FR-130 (Pen 118 RW4ec): the draft was repriced after a price, rule or
 * VAT change. Shown until the customer changes the design.
 */
export function PriceUpdated({ draft }: { draft: Configuration | null }) {
  if (!draft?.priceUpdate) return null;
  const { wasMinor, nowMinor, currency } = draft.priceUpdate;
  return (
    <Notice tone="warning" title="Price updated" live>
      <p>
        Was {naira(wasMinor, currency)} · now {naira(nowMinor, currency)}
        {draft.quantity ? ` for ${draft.quantity.toLocaleString("en-NG")} × ${draft.productName}` : ""}. Your choices are unchanged.
      </p>
    </Notice>
  );
}
