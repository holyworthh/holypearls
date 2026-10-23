import { Body, Controller, Get, HttpCode, Inject, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { createUploadSchema, type FileView } from "@holypearls/contracts";
import type { Request } from "express";
import { z } from "zod";
import { RateLimit } from "../platform/rate-limit.js";
import { FILE_DEPS } from "../tokens.js";
import { ZodValidationPipe } from "../validation.js";
import { completeUpload, createUpload, downloadUrl, type FileDeps, findFileForActor, previewUrl, toFileView } from "./files.js";

const previewKind = z.enum(["preview", "thumbnail", "page"]).default("preview");

/** File uploads and downloads (TECH-04 §3–7). */
@Controller("files")
export class FilesController {
  constructor(@Inject(FILE_DEPS) private readonly deps: FileDeps) {}

  @Post("uploads")
  @RateLimit("UPLOAD_INTENT")
  async create(@Req() request: Request, @Body(new ZodValidationPipe(createUploadSchema)) body: z.infer<typeof createUploadSchema>) {
    return createUpload(this.deps, await request.getActor!(), body);
  }

  @Post(":id/complete")
  @RateLimit("COMMERCIAL_WRITE")
  @HttpCode(200)
  async complete(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string): Promise<FileView> {
    return completeUpload(this.deps, await request.getActor!(), id);
  }

  /** The upload component polls this while the worker checks the file. */
  @Get(":id")
  async get(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string): Promise<FileView> {
    return toFileView(this.deps.db, await findFileForActor(this.deps.db, await request.getActor!(), id));
  }

  @Get(":id/download")
  async download(@Req() request: Request, @Param("id", new ParseUUIDPipe()) id: string) {
    return downloadUrl(this.deps, await request.getActor!(), id);
  }

  @Get(":id/preview")
  async preview(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("kind", new ZodValidationPipe(previewKind)) kind: z.infer<typeof previewKind>,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
  ) {
    return previewUrl(this.deps, await request.getActor!(), id, kind.toUpperCase() as "PREVIEW" | "THUMBNAIL" | "PAGE", page ?? 1);
  }
}
