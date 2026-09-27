import { notFound } from "next/navigation";

/**
 * The design-system demo is a developer page. It is hidden in production
 * unless HP_DESIGN_SYSTEM_DEMO=on (used by the accessibility tests).
 */
export function assertDemoEnabled(): void {
  if (process.env.NODE_ENV === "production" && process.env.HP_DESIGN_SYSTEM_DEMO !== "on") {
    notFound();
  }
}
