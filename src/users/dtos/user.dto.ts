import { z } from 'zod';
import { ReminderChannel } from '@prisma/client';

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()_\-+=])[A-Za-z\d@$!%*?&^#()_\-+=]{8,}$/;
const PASSWORD_MESSAGE =
  'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.';

export const UpdateProfileSchema = z
  .object({
    fullName: z.string().optional(),
    department: z.string().optional(),
    faculty: z.string().optional(),
    bio: z.string().max(300).optional(),
  })
  .strict();

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().nonempty(),
    newPassword: z.string().regex(PASSWORD_REGEX, PASSWORD_MESSAGE),
  })
  .strict();

export const UpdateReminderPreferencesSchema = z
  .object({
    channels: z
      .array(z.enum(ReminderChannel))
      .min(1, 'Select at least one reminder channel.')
      .refine(
        (arr) => new Set(arr).size === arr.length,
        'channels must be unique.',
      ),
  })
  .strict();

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type UpdateReminderPreferencesDto = z.infer<
  typeof UpdateReminderPreferencesSchema
>;
