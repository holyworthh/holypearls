import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadApiEnv } from "@holypearls/config";

@Module({})
class AppModule {}

const env = loadApiEnv();
const app = await NestFactory.create(AppModule);
// TECH-00 §2: every API route lives under /v1.
app.setGlobalPrefix("v1");
await app.listen(env.API_PORT);
