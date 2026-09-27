import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadApiEnv } from "@holypearls/config";

@Module({})
class AppModule {}

const env = loadApiEnv();
const app = await NestFactory.create(AppModule);
await app.listen(env.API_PORT);
