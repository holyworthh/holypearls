import { loadApiEnv } from "@holypearls/config";
import { createDatabaseClient } from "@holypearls/db";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";

const env = loadApiEnv();
const logger = createLogger();
const database = createDatabaseClient(env.DATABASE_URL);
const app = await createApp({ db: database.db, logger });
app.enableShutdownHooks();
await app.listen(env.API_PORT);
logger.info({ port: env.API_PORT }, "api started");
