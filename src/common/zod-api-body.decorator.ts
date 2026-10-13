import { ApiBody } from '@nestjs/swagger';
import { createSchema } from 'zod-openapi';
import type { ZodType } from 'zod';

export function ZodApiBody(schema: ZodType) {
  return ApiBody({
    schema: createSchema(schema, { io: 'input' }).schema as object,
  });
}
