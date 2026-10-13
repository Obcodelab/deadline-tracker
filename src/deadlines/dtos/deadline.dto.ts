import { z } from 'zod';
import { DeadlineType, Priority } from '@prisma/client';
import { PaginationQuerySchema } from '../../common/dtos/pagination-query.dto';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DueTimeSchema = z
  .string()
  .regex(TIME_REGEX, 'dueTime must be in HH:mm 24-hour format.');
const DateStringSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    'must be a valid date string',
  );

export const CreateChecklistItemSchema = z
  .object({ text: z.string().nonempty() })
  .strict();

export const CreateDeadlineSchema = z
  .object({
    title: z.string().nonempty(),
    type: z.enum(DeadlineType),
    courseId: z.uuid(),
    dueDate: z.iso.date(),
    dueTime: DueTimeSchema,
    priority: z.enum(Priority),
    description: z.string().optional(),
    checklistItems: z.array(CreateChecklistItemSchema).optional(),
  })
  .strict();

export const UpdateDeadlineSchema = CreateDeadlineSchema.omit({
  courseId: true,
  checklistItems: true,
})
  .partial()
  .extend({ completed: z.boolean().optional() })
  .strict();

export const ToggleChecklistItemSchema = z
  .object({ isComplete: z.boolean() })
  .strict();

export const ListDeadlinesQuerySchema = PaginationQuerySchema.extend({
  course: z.uuid().optional(),
  status: z.enum(['upcoming', 'due_today', 'overdue', 'completed']).optional(),
  type: z.enum(DeadlineType).optional(),
  from: DateStringSchema.optional(),
  to: DateStringSchema.optional(),
  search: z.string().nonempty().optional(),
}).strict();

export type CreateChecklistItemDto = z.infer<typeof CreateChecklistItemSchema>;
export type CreateDeadlineDto = z.infer<typeof CreateDeadlineSchema>;
export type UpdateDeadlineDto = z.infer<typeof UpdateDeadlineSchema>;
export type ToggleChecklistItemDto = z.infer<typeof ToggleChecklistItemSchema>;
export type ListDeadlinesQueryDto = z.infer<typeof ListDeadlinesQuerySchema>;
