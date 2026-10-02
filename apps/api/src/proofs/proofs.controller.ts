import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import { approveProofSchema, decideChangeRequestSchema, fileDecisionSchema, newChangeRequestSchema, proofCommentInputSchema, proofQuestionSchema, proofReplySchema, proofRequestSchema, saveProofDraftSchema } from "@holypearls/contracts";
import type { Request, Response } from "express";
import { z } from "zod";
import { deviceKey } from "../configuration/drafts.controller.js";
import { StaffGuard } from "../identity/staff.guard.js";
import type { PaymentDeps } from "../payments/payments.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { PAYMENT_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { decideChangeRequest, listChangeRequests, requestChange, startChangeReview } from "./changes.js";
import {
  addProofComment,
  approveProof,
  askProofQuestion,
  createProofDraft,
  decideFile,
  getAdminProof,
  getCustomerProof,
  proofQueue,
  publishProof,
  replyToProof,
  requestProofChanges,
  saveProofDraft,
} from "./proofs.js";

const uuid = new ParseUUIDPipe();
const access = async (request: Request) => ({ actor: await request.getActor!(), deviceKey: deviceKey(request) });

/** A proof on the customer's order (FUL-FR-002–004): same access as the order; anyone else gets 404. Never cached. */
@Controller("orders/:orderId/proofs")
export class CustomerProofsController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Get(":id")
  async get(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Param("orderId", uuid) orderId: string, @Param("id", uuid) id: string) {
    response.setHeader("cache-control", "private, no-store");
    return getCustomerProof(this.deps.db, await access(request), orderId, id);
  }

  /** Approve for production: the acknowledgement and a recent email code; pressing twice is safe. */
  @Post(":id/approve")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async approve(@Req() request: Request, @Param("orderId", uuid) orderId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(approveProofSchema)) body: z.infer<typeof approveProofSchema>) {
    return approveProof(this.deps.db, await access(request), orderId, id, body.versionNumber);
  }

  @Post(":id/changes")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async changes(@Req() request: Request, @Param("orderId", uuid) orderId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(proofRequestSchema)) body: z.infer<typeof proofRequestSchema>) {
    return requestProofChanges(this.deps.db, await access(request), orderId, id, body);
  }

  /** A comment on the whole proof or a pin (FUL-FR-005). */
  @Post(":id/comments")
  @HttpCode(200)
  @RateLimit("CONTACT")
  async comment(@Req() request: Request, @Param("orderId", uuid) orderId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(proofCommentInputSchema)) body: z.infer<typeof proofCommentInputSchema>) {
    return addProofComment(this.deps.db, await access(request), orderId, id, body);
  }

  @Post(":id/questions")
  @HttpCode(200)
  @RateLimit("CONTACT")
  async question(@Req() request: Request, @Param("orderId", uuid) orderId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(proofQuestionSchema)) body: z.infer<typeof proofQuestionSchema>) {
    return askProofQuestion(this.deps.db, await access(request), orderId, id, body);
  }
}

/** Proofs and artwork for staff (Pen 112; OPS-FR-050–052). PROOF_MANAGE; admin app only (ADR-017). */
@Controller("admin/proofs")
@UseGuards(StaffGuard("PROOF_MANAGE"))
export class ProofsAdminController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  private get notify() {
    return { db: this.deps.db, jobs: this.deps.jobs, sealKey: this.deps.sealKey, webOrigin: this.deps.webOrigin };
  }

  @Get()
  queue(@Query("view") view?: string) {
    return proofQueue(this.deps.db, view);
  }

  @Get(":id")
  get(@Param("id", uuid) id: string) {
    return getAdminProof(this.deps.db, id);
  }

  @Post(":id/versions")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async draft(@Req() request: Request, @Param("id", uuid) id: string) {
    return createProofDraft(this.deps.db, await request.getActor!(), id);
  }

  @Put(":id/draft")
  @RateLimit("ADMIN_WRITE")
  async save(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(saveProofDraftSchema)) body: z.infer<typeof saveProofDraftSchema>) {
    return saveProofDraft(this.deps.db, await request.getActor!(), id, body);
  }

  /** Publish: the draft can never change after this, and the customer is emailed. */
  @Post(":id/publish")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("ADMIN_WRITE")
  async publish(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(z.object({ version: z.number().int() }))) body: { version: number }) {
    return publishProof(this.notify, await request.getActor!(), id, body.version);
  }

  @Post(":id/replies")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async reply(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(proofReplySchema)) body: z.infer<typeof proofReplySchema>) {
    return replyToProof(this.deps.db, await request.getActor!(), id, body);
  }
}

/** Artwork review: mark a file READY or REJECTED (OPS-FR-050). PROOF_MANAGE. */
@Controller("admin/files")
@UseGuards(StaffGuard("PROOF_MANAGE"))
export class FileReviewAdminController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Post(":id/decision")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async decide(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(fileDecisionSchema)) body: z.infer<typeof fileDecisionSchema>) {
    return decideFile(this.deps.db, await request.getActor!(), id, body);
  }
}

/** Changes after approval on the customer's order (FUL-FR-007). Same access as the order. */
@Controller("orders/:orderId/change-requests")
export class CustomerChangeRequestsController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Post()
  @HttpCode(200)
  @RateLimit("CONTACT")
  async create(@Req() request: Request, @Param("orderId", uuid) orderId: string, @Body(new ZodValidationPipe(newChangeRequestSchema)) body: z.infer<typeof newChangeRequestSchema>) {
    return { items: await requestChange(this.deps.db, await access(request), orderId, body) };
  }
}

/** Staff review of changes after approval (OPS-FR-054). PROOF_MANAGE. */
@Controller("admin/change-requests")
@UseGuards(StaffGuard("PROOF_MANAGE"))
export class ChangeRequestsAdminController {
  constructor(@Inject(PAYMENT_DEPS) private readonly deps: PaymentDeps) {}

  @Get()
  list(@Query("view") view?: string) {
    return listChangeRequests(this.deps.db, view);
  }

  @Post(":id/review")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async review(@Req() request: Request, @Param("id", uuid) id: string) {
    return startChangeReview(this.deps.db, await request.getActor!(), id);
  }

  @Post(":id/decision")
  @HttpCode(200)
  @RateLimit("ADMIN_WRITE")
  async decide(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(decideChangeRequestSchema)) body: z.infer<typeof decideChangeRequestSchema>) {
    return decideChangeRequest(this.deps.db, await request.getActor!(), id, body);
  }
}
