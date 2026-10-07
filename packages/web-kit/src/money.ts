import { displayMoney } from "@holypearls/contracts";

/** ₦52,500 or ₦3,937.50: kobo only when there are some. Amounts arrive as kobo strings. */
export function naira(minor: string | bigint | null | undefined, currency?: string | null): string {
  if (minor === null || minor === undefined || minor === "") return "—";
  return displayMoney(minor, currency ?? "NGN");
}

/** 7.5% from 750 basis points. */
export const percent = (bps: number) => `${(bps / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}%`;
