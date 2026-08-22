import 'reflect-metadata';

import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { AppIoAdapter } from './realtime/socket-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Preserves the exact request bytes on `req.rawBody` alongside the
    // normally-parsed `req.body` — payment webhook signature verification
    // (see payments/webhook.controller.ts) must hash/sign the literal
    // bytes the provider sent, not a re-serialized JSON.parse of them.
    rawBody: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const config = app.get(AppConfigService);

  // Security headers. `contentSecurityPolicy` is left to the frontend
  // (which actually renders HTML); this API only ever returns JSON.
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
  });

  app.set('trust proxy', 1);

  app.useWebSocketAdapter(new AppIoAdapter(app));

  await app.listen(config.port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
