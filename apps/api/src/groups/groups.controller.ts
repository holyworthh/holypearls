import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Req, Res, UseGuards } from "@nestjs/common";
import { StaffGuard } from "../identity/staff.guard.js";
import { collectionActionSchema, correctionSchema, createCollectionSchema, joinCollectionSchema, participantActionSchema, reopenCollectionSchema, saveParticipationSchema, settleSizeSchema, submitParticipationSchema, updateCollectionSchema } from "@holypearls/contracts";
import type { Request, Response } from "express";
import { setGuestCookie } from "../identity/customer-access.controller.js";
import { z } from "zod";
import { AppError } from "../errors.js";
import type { OrganizationDeps } from "../organizations/team.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { HELP_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { changeCollection, collectionInvite, createCollection, getCollection, listCollections, updateCollection } from "./collections.js";
import { actOnParticipant, closeOrReopen, collectionDashboard, remindParticipants } from "./dashboard.js";
import { createOrderDraft, orderDraftOrigin, orderDraftState, submitOrderDraft } from "./order-drafts.js";
import { getParticipation, joinCollection, saveParticipation, submitParticipation } from "./participants.js";

const uuid = new ParseUUIDPipe();
const actorOf = (request: Request) => request.getActor!();
const inviteSchema = z.object({ secret: z.string().min(16).max(200) });

/** Group collections for a workspace (T12-01; Pen 132). */
@Controller("organizations/:organizationId/collections")
export class CollectionsController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Get()
  async list(@Req() request: Request, @Param("organizationId", uuid) organizationId: string) {
    return listCollections(this.deps.db, await actorOf(request), organizationId);
  }

  @Post()
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async create(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Body(new ZodValidationPipe(createCollectionSchema)) body: z.infer<typeof createCollectionSchema>) {
    return createCollection(this.deps, await actorOf(request), organizationId, body);
  }

  @Get(":collectionId")
  async get(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("collectionId", uuid) collectionId: string) {
    return getCollection(this.deps, await actorOf(request), organizationId, collectionId);
  }

  @Put(":collectionId")
  @RateLimit("COMMERCIAL_WRITE")
  async update(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("collectionId", uuid) collectionId: string,
    @Body(new ZodValidationPipe(updateCollectionSchema)) body: z.infer<typeof updateCollectionSchema>,
  ) {
    return updateCollection(this.deps, await actorOf(request), organizationId, collectionId, body);
  }

  /* The organizer's dashboard (T12-03; Pen 30, 74, 133, 134). */

  @Get(":collectionId/dashboard")
  async dashboard(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("collectionId", uuid) collectionId: string) {
    return collectionDashboard(this.deps.db, await actorOf(request), organizationId, collectionId);
  }

  @Post(":collectionId/remind")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async remind(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("collectionId", uuid) collectionId: string) {
    return remindParticipants(this.deps, await actorOf(request), organizationId, collectionId);
  }

  @Post(":collectionId/close")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async close(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("collectionId", uuid) collectionId: string, @Body(new ZodValidationPipe(collectionActionSchema)) body: z.infer<typeof collectionActionSchema>) {
    return closeOrReopen(this.deps, await actorOf(request), organizationId, collectionId, { kind: "close", version: body.version });
  }

  @Post(":collectionId/reopen")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async reopen(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("collectionId", uuid) collectionId: string, @Body(new ZodValidationPipe(reopenCollectionSchema)) body: z.infer<typeof reopenCollectionSchema>) {
    return closeOrReopen(this.deps, await actorOf(request), organizationId, collectionId, { kind: "reopen", deadline: body.deadline, version: body.version });
  }

  /* The Order Draft (T12-03b; Pen 133). */

  @Get(":collectionId/order-draft")
  async orderDraft(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("collectionId", uuid) collectionId: string) {
    return orderDraftState(this.deps.db, await actorOf(request), organizationId, collectionId);
  }

  @Post(":collectionId/order-draft")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async makeOrderDraft(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("collectionId", uuid) collectionId: string, @Body(new ZodValidationPipe(collectionActionSchema)) body: z.infer<typeof collectionActionSchema>) {
    return createOrderDraft(this.deps, await actorOf(request), organizationId, collectionId, body.version);
  }

  @Post(":collectionId/order-draft/submit")
  @HttpCode(200)
  @Idempotent()
  @RateLimit("COMMERCIAL_WRITE")
  async submitOrderDraft(@Req() request: Request, @Param("organizationId", uuid) organizationId: string, @Param("collectionId", uuid) collectionId: string, @Body(new ZodValidationPipe(collectionActionSchema)) body: z.infer<typeof collectionActionSchema>) {
    return submitOrderDraft(this.deps, await actorOf(request), organizationId, collectionId, body.version);
  }

  @Post(":collectionId/participants/:participantId/:action")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async participant(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("collectionId", uuid) collectionId: string,
    @Param("participantId", uuid) participantId: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ) {
    const actor = await actorOf(request);
    const parse = <T extends z.ZodType>(schema: T) => new ZodValidationPipe(schema).transform(body) as z.infer<T>;
    if (action === "correction") {
      const input = parse(correctionSchema);
      return actOnParticipant(this.deps, actor, organizationId, collectionId, participantId, { kind: "correction", note: input.note }, input.version);
    }
    if (action === "settle-size") {
      const input = parse(settleSizeSchema);
      return actOnParticipant(this.deps, actor, organizationId, collectionId, participantId, { kind: "settle-size", size: input.size }, input.version);
    }
    if (action === "exclude" || action === "include" || action === "remove") {
      const input = parse(participantActionSchema);
      return actOnParticipant(this.deps, actor, organizationId, collectionId, participantId, { kind: action }, input.version);
    }
    throw new AppError("NOT_FOUND");
  }

  @Post(":collectionId/:action")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async change(
    @Req() request: Request,
    @Param("organizationId", uuid) organizationId: string,
    @Param("collectionId", uuid) collectionId: string,
    @Param("action") action: string,
    @Body(new ZodValidationPipe(collectionActionSchema)) body: z.infer<typeof collectionActionSchema>,
  ) {
    if (action !== "open" && action !== "pause" && action !== "cancel") throw new AppError("NOT_FOUND");
    return changeCollection(this.deps, await actorOf(request), organizationId, collectionId, action, body.version);
  }
}

/** A participant opening the share link (B2B-FR-060): no account; the secret is sent in the body, never the URL. */
@Controller("collections")
export class CollectionInviteController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Post("invite")
  @HttpCode(200)
  @RateLimit("GUEST_LINK_VERIFY")
  async invite(@Req() request: Request, @Body(new ZodValidationPipe(inviteSchema)) body: z.infer<typeof inviteSchema>) {
    return collectionInvite(this.deps.db, body.secret, (await actorOf(request)).now);
  }

  /** Join (T12-01b): a guest session for this participant only, and their personal link by email. */
  @Post("join")
  @HttpCode(200)
  @RateLimit("GUEST_LINK_VERIFY")
  async join(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body(new ZodValidationPipe(joinCollectionSchema)) body: z.infer<typeof joinCollectionSchema>) {
    const result = await joinCollection(this.deps, await actorOf(request), body);
    setGuestCookie(response, this.deps.webOrigin, result.session.token, result.session.expiresAt);
    response.setHeader("referrer-policy", "no-referrer");
    return { participantId: result.participantId, redirectTo: `/collections/submissions/${result.participantId}` };
  }
}

/** A participant's own answers (T12-01b; B2B-FR-061): their guest session or the account they joined with, nothing else. */
@Controller("participants")
export class ParticipantsController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Get(":participantId")
  async get(@Req() request: Request, @Param("participantId", uuid) participantId: string) {
    return getParticipation(this.deps.db, await actorOf(request), participantId);
  }

  @Put(":participantId/answers")
  @RateLimit("COMMERCIAL_WRITE")
  async save(@Req() request: Request, @Param("participantId", uuid) participantId: string, @Body(new ZodValidationPipe(saveParticipationSchema)) body: z.infer<typeof saveParticipationSchema>) {
    return saveParticipation(this.deps.db, await actorOf(request), participantId, body);
  }

  @Post(":participantId/submit")
  @HttpCode(200)
  @RateLimit("COMMERCIAL_WRITE")
  async submit(@Req() request: Request, @Param("participantId", uuid) participantId: string, @Body(new ZodValidationPipe(submitParticipationSchema)) body: z.infer<typeof submitParticipationSchema>) {
    return submitParticipation(this.deps, await actorOf(request), participantId, body.version);
  }
}

/** Where an Order Draft came from, for staff quoting or producing it (OPS-FR-090; Pen 133 · u3BRd). Read only. */
@Controller("admin/order-drafts")
@UseGuards(StaffGuard("QUOTE_MANAGE"))
export class OrderDraftsAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: OrganizationDeps) {}

  @Get(":draftId")
  origin(@Param("draftId", uuid) draftId: string) {
    return orderDraftOrigin(this.deps.db, draftId);
  }
}
