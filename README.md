# HolyPearls

## Local setup

Use Node.js 22 and pnpm 11.15.1.

1. Run `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to `.env`. Change the values if your ports or credentials differ.
3. Run `docker compose up -d` to start PostgreSQL, MinIO, and Mailpit.
4. Run `pnpm dev` to start the web app on port 3000, the API on port 3001, and the worker.

The web app has a blank route during T00-01. The API has no business endpoints yet. The worker has no jobs yet.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before a pull request.
