import { z } from 'zod';
import { AcademicTerm } from '@prisma/client';

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;
const ColorSchema = z
  .string()
  .regex(HEX_COLOR_REGEX, 'color must be a valid hex color.');

export const CreateCourseSchema = z
  .object({
    name: z.string().nonempty(),
    code: z.string().nonempty(),
    term: z.enum(AcademicTerm),
    color: ColorSchema,
  })
  .strict();

export const UpdateCourseSchema = CreateCourseSchema.partial()
  .extend({ archived: z.boolean().optional() })
  .strict();

export const JoinCourseSchema = z
  .object({ joinCode: z.string().nonempty() })
  .strict();

export type CreateCourseDto = z.infer<typeof CreateCourseSchema>;
export type UpdateCourseDto = z.infer<typeof UpdateCourseSchema>;
export type JoinCourseDto = z.infer<typeof JoinCourseSchema>;
