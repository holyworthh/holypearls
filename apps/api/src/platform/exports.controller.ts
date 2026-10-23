import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { type ExportRequest, exportRequestSchema } from "@holypearls/contracts";
import type { Request } from "express";
import type { FileDeps } from "../files/files.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "./rate-limit.js";
import { FILE_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { downloadExport, listExports, requestExport, retryExport } from "./exports.js";

const uuid = new ParseUUIDPipe();

/** Exports (T13-03b; PRD-06 §19; Pen 120). Each type needs its own permission; Customers also EXPORT_PERSONAL_DATA and recent MFA. */
@Controller("admin/exports")
@UseGuards(StaffGuard())
export class ExportsController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Get()
  async list(@Req() request: Request) {
    return listExports(this.deps.db, await request.getActor!());
  }

  @Post()
  @RateLimit("ADMIN_WRITE")
  async request(@Req() request: Request, @Body(new ZodValidationPipe(exportRequestSchema)) body: ExportRequest) {
    return requestExport(this.deps, await request.getActor!(), body);
  }

  @Post(":id/retry")
  @RateLimit("ADMIN_WRITE")
  @HttpCode(200)
  async retry(@Req() request: Request, @Param("id", uuid) id: string) {
    return retryExport(this.deps, await request.getActor!(), id);
  }

  @Post(":id/download")
  @RateLimit("ADMIN_WRITE")
  @HttpCode(200)
  async download(@Req() request: Request, @Param("id", uuid) id: string) {
    return downloadExport(this.deps, await request.getActor!(), id);
  }
}
