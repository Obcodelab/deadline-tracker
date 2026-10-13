import { Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { BadRequestException } from './app.exception';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const byField = new Map<string, string[]>();
    for (const issue of result.error.issues) {
      const field = issue.path.join('.') || '(root)';
      byField.set(field, [...(byField.get(field) ?? []), issue.message]);
    }
    throw new BadRequestException('Validation failed.', {
      code: 'VALIDATION_ERROR',
      detail: Array.from(byField, ([field, errors]) => ({ field, errors })),
    });
  }
}
