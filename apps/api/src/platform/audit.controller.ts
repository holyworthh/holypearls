import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { type AuditEntry, type AuditPage, auditQuerySchema } from "@holypearls/contracts";
import type { Database } from "@holypearls/db";
import type { z } from "zod";
import { AppError } from "../errors.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { DATABASE } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { findAuditEntry, listAudit } from "./audit.js";

/** Admin audit viewer (OPS-FR-120). Read-only: no route changes or removes an entry. */
@Controller("admin/audit")
@UseGuards(StaffGuard("AUDIT_VIEW"))
export class AuditController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  list(@Query(new ZodValidationPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>): Promise<AuditPage> {
    return listAudit(this.db, query);
  }

  @Get(":id")
  async entry(@Param("id", new ParseUUIDPipe()) id: string): Promise<AuditEntry> {
    const entry = await findAuditEntry(this.db, id);
    if (!entry) throw new AppError("NOT_FOUND");
    return entry;
  }
}
