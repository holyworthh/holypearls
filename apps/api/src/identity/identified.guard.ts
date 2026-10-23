import { type CanActivate, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import { AppError } from "../errors.js";
import { deviceCookieValue } from "../platform/rate-limit.js";

const PUBLIC = "hp:public-write";

/** Marks a write anyone may start with no sign-in, guest session or device (a first cart item, a contact form, a secret link). */
export const Public = () => SetMetadata(PUBLIC, true);

/**
 * Global guard (T15-01, TECH-03 §12): a write needs an identity before its body
 * is even read, so a signed-out caller gets 401 and never a validation error
 * that varies with the route. Identity is a sign-in, a guest session, or the
 * device cookie that anonymous drafts belong to. Routes that really are open
 * say so with @Public(); a new write is private until it does. Admin routes
 * answer 404 to outsiders through StaffGuard, and reads check ownership in
 * their own policies.
 */
export class IdentifiedGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method) || request.path.startsWith("/v1/admin/")) return true;
    if (Reflect.getMetadata(PUBLIC, context.getHandler()) || Reflect.getMetadata(PUBLIC, context.getClass())) return true;
    if ((await request.getActor!()).type !== "anonymous" || deviceCookieValue(request)) return true;
    throw new AppError("NOT_SIGNED_IN");
  }
}
