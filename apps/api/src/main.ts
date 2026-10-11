import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

export function resolveAllowedOrigins(): string[] {
  const isProduction = process.env.NODE_ENV === 'production';
  const corsOrigin = process.env.CORS_ORIGIN?.trim();

  if (isProduction) {
    if (!corsOrigin) {
      throw new Error(
        '[FATAL CONFIGURATION ERROR] CORS_ORIGIN environment variable is required in production mode. ' +
          'Specify comma-separated allowed origin URLs (e.g. https://bts.college.edu,https://admin.bts.college.edu).',
      );
    }
    const origins = corsOrigin
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    if (origins.length === 0) {
      throw new Error(
        '[FATAL CONFIGURATION ERROR] CORS_ORIGIN must contain at least one valid origin URL in production mode.',
      );
    }
    return origins;
  }

  // Development / Test fallbacks
  if (corsOrigin) {
    return corsOrigin
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global response transformer — wraps all success responses
  app.useGlobalInterceptors(new TransformInterceptor());

  // Global exception filter — standardizes error responses
  app.useGlobalFilters(new HttpExceptionFilter());

  // Enable Validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Environment-driven CORS configuration
  const allowedOrigins = resolveAllowedOrigins();
  logger.log(
    `Configuring CORS origin whitelist: ${allowedOrigins.join(', ')}`,
  );

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`API Application is running on port: ${port}`);
}
bootstrap();
