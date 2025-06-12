import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as serverless from 'serverless-http';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';

const bootstrap = async () => {
  const expressApp = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );

  app.enableCors({
    origin: (_req, callback) => callback(null, true),
  });
  app.use(helmet());

  await app.init();
  return serverless(expressApp);
};

let server: any;

export const handler = async (event, context) => {
  if (!server) {
    server = await bootstrap();
  }
  return server(event, context);
};
