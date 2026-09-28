import { z } from "zod";

export const healthLiveSchema = z.object({ status: z.literal("ok") });

export const healthReadySchema = z.object({
  status: z.enum(["ok", "unavailable"]),
  checks: z.object({ database: z.enum(["ok", "unavailable"]) }),
});

export type HealthReady = z.infer<typeof healthReadySchema>;
