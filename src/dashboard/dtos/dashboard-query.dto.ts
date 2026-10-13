import { z } from 'zod';
import { DeadlineType } from '@prisma/client';

export const DashboardQuerySchema = z
  .object({
    course: z.uuid().optional(),
    type: z.enum(DeadlineType).optional(),
  })
  .strict();
export type DashboardQueryDto = z.infer<typeof DashboardQuerySchema>;
