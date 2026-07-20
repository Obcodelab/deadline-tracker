import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { ResponseInterceptor } from './common/app.interceptor';
import { GlobalExceptionFilter } from './common/app.filter';
import { BadRequestException } from './common/app.exception';

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
  await app.listen(process.env.PORT ?? 8000);
}
void bootstrap();
