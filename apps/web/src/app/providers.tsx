"use client";

import { ToastProvider } from "@holypearls/ui";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
