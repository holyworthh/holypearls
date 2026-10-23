import { RequestMethod, type INestApplication } from "@nestjs/common";
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer } from "@nestjs/core";
import type { StaffPermission } from "@holypearls/contracts";
import { RATE_LIMIT_CLASS, type RateLimitClass } from "../platform/rate-limit.js";

/** One route the NestJS router serves, read from the controllers' own metadata (T15-01). */
export interface RouteInfo {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** "/v1/orders/:id" */
  path: string;
  /** "GET /v1/orders/:id" */
  key: string;
  rateLimit: RateLimitClass | undefined;
  /** undefined: no StaffGuard; null: StaffGuard() with no named permission. */
  staffPermission: StaffPermission | null | undefined;
}

type Guards = { staffPermission?: StaffPermission | null }[];

const pathOf = (value: unknown): string => {
  if (typeof value !== "string") throw new Error(`Route path ${JSON.stringify(value)} is not a plain string; teach listRoutes about it.`);
  return value;
};

/** Every controller route, with its rate-limit class and the staff permission its StaffGuard names. */
export function listRoutes(app: INestApplication): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new () => object) | null;
      if (!controller) continue;
      const base = pathOf(Reflect.getMetadata(PATH_METADATA, controller) ?? "");
      const classGuards = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as Guards;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        // Read the descriptor: some controllers have getters that only work on an instance.
        const handler = Object.getOwnPropertyDescriptor(controller.prototype, name)?.value as unknown;
        if (typeof handler !== "function" || name === "constructor") continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as unknown;
        const verb = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (sub === undefined || verb === undefined) continue;
        const method = RequestMethod[verb] as RouteInfo["method"];
        // app.ts keeps the health checks out of the /v1 prefix.
        const path = ("/" + [base.split("/")[0] === "health" ? null : "v1", base, pathOf(sub)].filter(Boolean).join("/")).replaceAll(/\/+/g, "/").replace(/(.)\/$/, "$1");
        const guards = [...classGuards, ...((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as Guards)];
        const staff = guards.find((guard) => "staffPermission" in guard);
        routes.push({
          method,
          path,
          key: `${method} ${path}`,
          rateLimit: Reflect.getMetadata(RATE_LIMIT_CLASS, handler) as RateLimitClass | undefined,
          staffPermission: staff ? staff.staffPermission : undefined,
        });
      }
    }
  }
  return routes.sort((a, b) => a.key.localeCompare(b.key));
}
