import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import {
  addProjectItemSchema,
  attachProjectFileSchema,
  createProjectSchema,
  emailProjectLinkSchema,
  previewRecommendationsSchema,
  projectTypeSchema,
  saveRecommendationRulesSchema,
  updateProjectItemSchema,
  updateProjectSchema,
  updateRecommendationSchema,
} from "@holypearls/contracts";
import type { Request, Response } from "express";
import type { z } from "zod";
import { DEVICE_COOKIE, deviceKey } from "../configuration/drafts.controller.js";
import { AppError } from "../errors.js";
import { setGuestCookie } from "../identity/customer-access.controller.js";
import { StaffGuard } from "../identity/staff.guard.js";
import { RateLimit } from "../platform/rate-limit.js";
import { HELP_DEPS, type HelpDepsToken } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import {
  addProjectItem,
  attachProjectFile,
  claimDeviceProjects,
  createProject,
  currentProject,
  emailProjectLink,
  getProject,
  type ProjectAccess,
  removeProjectFile,
  removeProjectItem,
  updateProject,
  updateProjectItem,
  updateRecommendation,
} from "./projects.js";
import { getRuleSet, previewRules, saveRuleSet } from "./rules.js";

const uuid = new ParseUUIDPipe();
const DEVICE_COOKIE_DAYS = 90;

/** Start a Project drafts (T05-01; PROJ-FR-001–007). Owners only; anyone else gets 404. */
@Controller("projects")
export class ProjectsController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  private async access(request: Request): Promise<ProjectAccess> {
    const access = { actor: await request.getActor!(), deviceKey: deviceKey(request) };
    await claimDeviceProjects(this.deps.db, access);
    return access;
  }

  @Post()
  @RateLimit("COMMERCIAL_WRITE")
  async create(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body(new ZodValidationPipe(createProjectSchema)) body: z.infer<typeof createProjectSchema>) {
    const { project, newDeviceKey } = await createProject(this.deps.db, await this.access(request), body);
    if (newDeviceKey) {
      response.cookie(DEVICE_COOKIE, newDeviceKey, { httpOnly: true, sameSite: "lax", secure: this.deps.webOrigin.startsWith("https:"), path: "/", maxAge: DEVICE_COOKIE_DAYS * 86_400_000 });
    }
    return project;
  }

  /** The draft this person was last working on, for "Continue your … project" on /start. */
  @Get("current")
  async current(@Req() request: Request) {
    return { project: await currentProject(this.deps.db, await this.access(request)) };
  }

  @Get(":id")
  async get(@Req() request: Request, @Param("id", uuid) id: string) {
    return getProject(this.deps.db, await this.access(request), id);
  }

  /** Autosave. 409 VERSION_CONFLICT with the latest project. */
  @Patch(":id")
  @RateLimit("COMMERCIAL_WRITE")
  async update(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(updateProjectSchema)) body: z.infer<typeof updateProjectSchema>) {
    return updateProject(this.deps.db, await this.access(request), id, body);
  }

  @Patch(":id/recommendations/:key")
  @RateLimit("COMMERCIAL_WRITE")
  async recommendation(
    @Req() request: Request,
    @Param("id", uuid) id: string,
    @Param("key", uuid) key: string,
    @Body(new ZodValidationPipe(updateRecommendationSchema)) body: z.infer<typeof updateRecommendationSchema>,
  ) {
    return updateRecommendation(this.deps.db, await this.access(request), id, key, body);
  }

  @Post(":id/items")
  @RateLimit("COMMERCIAL_WRITE")
  async addItem(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(addProjectItemSchema)) body: z.infer<typeof addProjectItemSchema>) {
    return addProjectItem(this.deps.db, await this.access(request), id, body);
  }

  @Patch(":id/items/:itemId")
  @RateLimit("COMMERCIAL_WRITE")
  async updateItem(
    @Req() request: Request,
    @Param("id", uuid) id: string,
    @Param("itemId", uuid) itemId: string,
    @Body(new ZodValidationPipe(updateProjectItemSchema)) body: z.infer<typeof updateProjectItemSchema>,
  ) {
    return updateProjectItem(this.deps.db, await this.access(request), id, itemId, body);
  }

  @Delete(":id/items/:itemId")
  @RateLimit("COMMERCIAL_WRITE")
  async removeItem(@Req() request: Request, @Param("id", uuid) id: string, @Param("itemId", uuid) itemId: string, @Query("version") version?: string) {
    const expected = Number(version);
    if (!version || !Number.isInteger(expected)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { version: "Send the version you started from." } });
    return removeProjectItem(this.deps.db, await this.access(request), id, itemId, expected);
  }

  @Post(":id/files")
  @RateLimit("COMMERCIAL_WRITE")
  async attach(@Req() request: Request, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(attachProjectFileSchema)) body: z.infer<typeof attachProjectFileSchema>) {
    return attachProjectFile(this.deps.db, await this.access(request), id, body);
  }

  @Delete(":id/files/:fileId")
  @RateLimit("COMMERCIAL_WRITE")
  async removeFile(@Req() request: Request, @Param("id", uuid) id: string, @Param("fileId", uuid) fileId: string) {
    return removeProjectFile(this.deps.db, await this.access(request), id, fileId);
  }

  /** Emails a link to continue on any device (PROJ-FR-007). */
  @Post(":id/email")
  @HttpCode(200)
  @RateLimit("CONTACT")
  async email(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param("id", uuid) id: string,
    @Body(new ZodValidationPipe(emailProjectLinkSchema)) body: z.infer<typeof emailProjectLinkSchema>,
  ) {
    const { project, session } = await emailProjectLink(this.deps, await this.access(request), id, body.email);
    if (session) setGuestCookie(response, this.deps.webOrigin, session.token, session.expiresAt);
    return project;
  }
}

type ProjectTypeParam = z.infer<typeof projectTypeSchema>;
const typePipe = new ZodValidationPipe(projectTypeSchema);

/** Recommendation rules per project type (Pen 110; QUOTE_MANAGE by the owner's choice). Admin app only (ADR-017). */
@Controller("admin/recommendation-rules")
export class RecommendationRulesAdminController {
  constructor(@Inject(HELP_DEPS) private readonly deps: HelpDepsToken) {}

  @Get(":type")
  @UseGuards(StaffGuard("QUOTE_MANAGE"))
  get(@Param("type", typePipe) type: ProjectTypeParam) {
    return getRuleSet(this.deps.db, type);
  }

  @Put(":type")
  @UseGuards(StaffGuard("QUOTE_MANAGE"))
  @RateLimit("ADMIN_WRITE")
  async save(@Req() request: Request, @Param("type", typePipe) type: ProjectTypeParam, @Body(new ZodValidationPipe(saveRecommendationRulesSchema)) body: z.infer<typeof saveRecommendationRulesSchema>) {
    return saveRuleSet(this.deps.db, await request.getActor!(), type, body);
  }

  /** "Preview with 250 attendees" (Pen 110). */
  @Post(":type/preview")
  @HttpCode(200)
  @UseGuards(StaffGuard("QUOTE_MANAGE"))
  async preview(@Param("type", typePipe) type: ProjectTypeParam, @Body(new ZodValidationPipe(previewRecommendationsSchema)) body: z.infer<typeof previewRecommendationsSchema>) {
    return { items: await previewRules(this.deps.db, type, body.answers) };
  }
}
