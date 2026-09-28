import type { PipeTransform } from "@nestjs/common";
import { toFieldErrors } from "@holypearls/contracts";
import type { z } from "zod";
import { AppError } from "./errors.js";

/**
 * Validates one request part with its contract schema:
 * `@Body(new ZodValidationPipe(createThingSchema)) body: CreateThing`.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError("VALIDATION_FAILED", { fieldErrors: toFieldErrors(result.error) });
    }
    return result.data;
  }
}
