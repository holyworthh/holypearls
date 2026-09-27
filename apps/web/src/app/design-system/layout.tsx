import type { Metadata } from "next";
import type { ReactNode } from "react";
import { assertDemoEnabled } from "./gate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

export default function DesignSystemLayout({ children }: { children: ReactNode }) {
  assertDemoEnabled();
  return children;
}
