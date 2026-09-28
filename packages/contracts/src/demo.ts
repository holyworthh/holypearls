import { z } from "zod";

/** T00-04 end-to-end slice. Demo only; the routes are off in production. */
export const demoSliceCreateSchema = z.object({
  message: z.string().trim().min(1, "Enter a message").max(200, "Use 200 characters or fewer"),
});

export const demoSliceSchema = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "DONE", "FAILED"]),
  message: z.string(),
  result: z.string().nullable(),
  attempts: z.number().int(),
});
export type DemoSlice = z.infer<typeof demoSliceSchema>;
