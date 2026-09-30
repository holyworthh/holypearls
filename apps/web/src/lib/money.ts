/** ₦52,500 or ₦3,937.50: kobo only when there are some. Amounts arrive as kobo strings. */
export function naira(minor: string | bigint | null | undefined): string {
  if (minor === null || minor === undefined || minor === "") return "—";
  const value = BigInt(minor);
  const whole = value / 100n;
  const kobo = value % 100n;
  return `₦${whole.toLocaleString("en-NG")}${kobo ? `.${kobo.toString().padStart(2, "0")}` : ""}`;
}

/** 7.5% from 750 basis points. */
export const percent = (bps: number) => `${(bps / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}%`;
