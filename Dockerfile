# One image for the API and the worker (TECH-07 §1). The host runs:
#   api:      node apps/api/dist/main.js
#   worker:   node apps/worker/dist/main.js
#   release:  node packages/db/dist/migrate-cli.js   (once, before new code starts; TECH-07 §6)
# On the free tier one container runs all three (deploy/start-single.sh).
FROM node:22.15.0-slim AS build
# pnpm asks before removing modules unless it knows it runs in CI.
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm turbo run build --filter=@holypearls/api --filter=@holypearls/worker --filter=@holypearls/db
# What the runtime needs, and nothing else (review P3-02): the workspace manifests,
# the built code, the migrations and the start script. No sources, tests, web app or tooling.
RUN mkdir /out \
  && cp --parents package.json pnpm-lock.yaml pnpm-workspace.yaml apps/*/package.json packages/*/package.json /out \
  && cp -r --parents apps/api/dist apps/worker/dist packages/*/dist packages/db/drizzle deploy /out

# A fresh production-only install of the three services and what they use. (Not
# `pnpm prune --prod`: in a workspace that removes the links between our own packages.)
FROM node:22.15.0-slim AS deps
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
WORKDIR /repo
COPY --from=build /out /repo
RUN pnpm install --prod --frozen-lockfile --filter "@holypearls/api..." --filter "@holypearls/worker..." --filter "@holypearls/db..."

FROM node:22.15.0-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=deps /repo /repo
# Free-tier local file storage and the email outbox live here and must be writable.
RUN mkdir -p /repo/.storage /repo/.outbox && chown node:node /repo/.storage /repo/.outbox
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
