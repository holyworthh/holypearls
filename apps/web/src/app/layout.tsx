import "@holypearls/ui/styles.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Open_Sans, Young_Serif } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { LinkTracker } from "../components/analytics/LinkTracker";
import { Motion, MOTION_BOOT } from "../components/motion/Motion";
import { Tooltips } from "../components/tooltip/Tooltips";
import { SITE_URL, verification } from "../lib/seo";
import { Providers } from "./providers";

/* Ledger type (Pen Stage 4.3 · Foundations): Young Serif headlines, Instrument Sans UI, IBM Plex Mono records; Open Sans 700 is the logo wordmark only. */
const display = Young_Serif({ subsets: ["latin"], weight: "400", variable: "--font-young-serif", display: "swap" });
const ui = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-instrument-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });
const wordmark = Open_Sans({ subsets: ["latin"], weight: "700", variable: "--font-wordmark", display: "swap" });

export const metadata: Metadata = {
  title: { default: "HolyPearls", template: "%s · HolyPearls" },
  // Canonical and social URLs are absolute on the public address (Stage 3 §53; found by the T14-01 check).
  metadataBase: new URL(SITE_URL),
  verification,
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Reading the request's nonce (set in proxy.ts) also makes every page render per request, which nonces need (TECH-06 §9).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable} ${wordmark.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Motion />
        <Tooltips />
        <LinkTracker />
      </body>
    </html>
  );
}
