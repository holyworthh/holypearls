import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Req } from "@nestjs/common";
import { collectionActionSchema, createCollectionSchema, updateCollectionSchema } from "@holypearls/contracts";
import type { Request } from "express";
import { z } from "zod";
import { AppError } from "../errors.js";
import type { OrganizationDeps } from "../organizations/team.js";
import { Idempotent } from "../platform/idempotency.js";
import { RateLimit } from "../platform/rate-limit.js";
import { HELP_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { changeCollection, collectionInvite, createCollection, getCollection, listCollections, updateCollection } from "./collections.js";

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
}
