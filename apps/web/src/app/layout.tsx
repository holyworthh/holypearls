import "@holypearls/ui/styles.css";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Motion, MOTION_BOOT } from "../components/motion/Motion";
import { Tooltips } from "../components/tooltip/Tooltips";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "HolyPearls", template: "%s · HolyPearls" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Motion />
        <Tooltips />
      </body>
    </html>
  );
}
