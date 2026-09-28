# One image for the API and the worker (TECH-07 §1). The host runs:
#   api:      node apps/api/dist/main.js
#   worker:   node apps/worker/dist/main.js
#   release:  node packages/db/dist/migrate-cli.js   (once, before new code starts; TECH-07 §6)
FROM node:22.15.0-slim AS build
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm turbo run build --filter=@holypearls/api --filter=@holypearls/worker --filter=@holypearls/db \
  && pnpm prune --prod

FROM node:22.15.0-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
