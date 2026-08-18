import { Test, TestingModule } from '@nestjs/testing';
import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { ResponseInterceptor } from '../../src/common/app.interceptor';
import { GlobalExceptionFilter } from '../../src/common/app.filter';
import { BadRequestException } from '../../src/common/app.exception';

/**
 * Boots a real Nest application with the same global pipes/filters/
 * interceptors main.ts applies, so e2e tests exercise the actual request
 * pipeline (validation, envelope shape, serialization) instead of the bare
 * TestingModule default.
 */
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(
    new ResponseInterceptor(reflector),
    new ClassSerializerInterceptor(reflector),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        return new BadRequestException('Validation failed.', {
          code: 'VALIDATION_ERROR',
          detail: errors.map((error) => ({
            field: error.property,
            errors: Object.values(error.constraints ?? {}),
          })),
        });
      },
    }),
  );

  await app.init();
  return app;
}
