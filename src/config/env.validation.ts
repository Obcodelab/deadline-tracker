import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(8000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  DATABASE_URL: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().required(),
  FRONTEND_URL: Joi.string().uri().required(),
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().required(),
  CORS_ORIGINS: Joi.string()
    .custom((value: string, helpers: Joi.CustomHelpers) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        return helpers.error('any.invalid');
      }

      if (
        !Array.isArray(parsed) ||
        !parsed.every((origin) => typeof origin === 'string')
      ) {
        return helpers.error('any.invalid');
      }

      return value;
    }, 'JSON array of origin strings')
    .required(),
});
