import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createSchema } from 'zod-openapi';
import type { ZodType } from 'zod';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import { ResponseInterceptor } from './common/app.interceptor';
import { GlobalExceptionFilter } from './common/app.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());

  const configService = app.get(ConfigService);
  app.enableCors({
    origin: configService.getOrThrow<string[]>('cors.origins'),
    credentials: true,
  });

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(
    new ResponseInterceptor(reflector),
    new ClassSerializerInterceptor(reflector),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Assignment & Deadline Tracker API')
    .setDescription('Backend for tracking course deadlines and reminders.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    standardSchemaConverter: (schema, options) =>
      createSchema(schema as ZodType, { io: options.schemaType }),
  });
  SwaggerModule.setup('docs', app, swaggerDocument);

  app.use('/redoc', (_req: Request, res: Response) => {
    res.removeHeader('Content-Security-Policy');
    res.send(`
     <!DOCTYPE html>
     <html>
     <head>
       <title>Redoc UI</title>
     </head>
     <body>
       <redoc spec-url="/docs-json"></redoc>
       <script src="https://cdn.jsdelivr.net/npm/redoc@2/bundles/redoc.standalone.js"></script>
     </body>
     </html>
     `);
  });

  await app.listen(process.env.PORT ?? 8000);
}
void bootstrap();
