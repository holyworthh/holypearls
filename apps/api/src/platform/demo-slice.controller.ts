import { Public } from "../identity/identified.guard.js";
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { type DemoSlice, demoSliceCreateSchema } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { Jobs } from "@holypearls/jobs";
import type { Request } from "express";
import type { z } from "zod";
import { AppError } from "../errors.js";
import { DATABASE, JOBS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { requireRecentEmailCode } from "../identity/customers.js";
import { createDemoSlice, findDemoSlice } from "./demo-slice.js";

/** T00-04 end-to-end slice: web form → API → database → job → result. Off in production. */
@Controller("demo/slice")
export class DemoSliceController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JOBS) private readonly jobs: Jobs,
  ) {}

  @Post()
  @Public()
  create(
    @Req() request: Request,
    @Body(new ZodValidationPipe(demoSliceCreateSchema)) body: z.infer<typeof demoSliceCreateSchema>,
  ): Promise<DemoSlice> {
    return createDemoSlice(this.db, this.jobs, body.message, request.requestId ?? "unknown");
  }

  /** Stands in for an important action (accept a quote, approve a proof) so the email-code dialog can be tried. */
  @Post("important-action")
  @Public()
  @HttpCode(200)
  async importantAction(@Req() request: Request) {
    await requireRecentEmailCode(this.db, await request.getActor!());
    return { done: true as const };
  }

  @Get(":id")
  async get(@Param("id", new ParseUUIDPipe()) id: string): Promise<DemoSlice> {
    const demo = await findDemoSlice(this.db, id);
    if (!demo) throw new AppError("NOT_FOUND");
    return demo;
  }
}
