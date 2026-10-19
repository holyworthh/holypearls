import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import { fabricInputSchema, savePlacementBlocksSchema } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { Request } from "express";
import type { z } from "zod";
import { StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "../platform/rate-limit.js";
import { DATABASE } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { getGarmentData, saveFabric, savePlacementBlocks } from "./garment-data.js";

const uuid = new ParseUUIDPipe();

/** Garment and production data (OPS-FR-020–022; Pen 118). CATALOGUE_MANAGE; every change audited. */
@Controller("admin/garment-data")
@UseGuards(StaffGuard("CATALOGUE_MANAGE"))
export class GarmentDataAdminController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  data() {
    return getGarmentData(this.db);
  }

  @Post("fabrics")
  @HttpCode(201)
  @RateLimit("ADMIN_WRITE")
  async addFabric(@Req() request: Request, @Body(new ZodValidationPipe(fabricInputSchema)) body: z.infer<typeof fabricInputSchema>) {
    return saveFabric(this.db, await request.getActor!(), null, body);
  }

  @Put("fabrics/:id")
  @RateLimit("ADMIN_WRITE")
  async changeFabric(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(fabricInputSchema)) body: z.infer<typeof fabricInputSchema>) {
    return saveFabric(this.db, await request.getActor!(), id, body);
  }

  @Put("placements")
  @RateLimit("ADMIN_WRITE")
  async placements(@Req() request: Request, @Body(new ZodValidationPipe(savePlacementBlocksSchema)) body: z.infer<typeof savePlacementBlocksSchema>) {
    return savePlacementBlocks(this.db, await request.getActor!(), body.blocked);
  }
}
