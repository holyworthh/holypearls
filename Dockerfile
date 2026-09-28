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
# No `pnpm prune --prod`: in a workspace it removes the links between our own
# packages, and the migration step then can't find @holypearls/config.
RUN pnpm install --frozen-lockfile \
  && pnpm turbo run build --filter=@holypearls/api --filter=@holypearls/worker --filter=@holypearls/db

FROM node:22.15.0-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
# Free-tier local file storage and the email outbox live here and must be writable.
RUN mkdir -p /repo/.storage /repo/.outbox && chown node:node /repo/.storage /repo/.outbox
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
