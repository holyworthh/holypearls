import "@holypearls/ui/styles.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Open_Sans, Young_Serif } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "./providers";

/* Ledger type, as on the customer site: Young Serif headlines, Instrument Sans UI, IBM Plex Mono records; Open Sans 700 is the wordmark. */
const display = Young_Serif({ subsets: ["latin"], weight: "400", variable: "--font-young-serif", display: "swap" });
const ui = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-instrument-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });
const wordmark = Open_Sans({ subsets: ["latin"], weight: "700", variable: "--font-wordmark", display: "swap" });

export const metadata: Metadata = {
  title: { default: "HolyPearls admin", template: "%s · HolyPearls admin" },
  robots: { index: false, follow: false },
};

/** The staff admin (ADR-017). */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Reading the request headers forces per-request rendering, so Next can put this request's nonce on its scripts (TECH-06 §9).
  await headers();
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable} ${wordmark.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
