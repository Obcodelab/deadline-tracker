import { z } from 'zod';
import { PaginationQuerySchema } from '../../common/dtos/pagination-query.dto';

export const MarkNotificationReadSchema = z
  .object({ isRead: z.boolean() })
  .strict();

export const ListNotificationsQuerySchema = PaginationQuerySchema.extend({
  unread: z.preprocess(
    (value) =>
      value === undefined ? undefined : value === 'true' || value === true,
    z.boolean().optional(),
  ),
}).strict();

export type MarkNotificationReadDto = z.infer<
  typeof MarkNotificationReadSchema
>;
export type ListNotificationsQueryDto = z.infer<
  typeof ListNotificationsQuerySchema
>;
