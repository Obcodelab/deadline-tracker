import { z } from 'zod';

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()_\-+=])[A-Za-z\d@$!%*?&^#()_\-+=]{8,}$/;
const PASSWORD_MESSAGE =
  'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.';

const PasswordSchema = z.string().regex(PASSWORD_REGEX, PASSWORD_MESSAGE);

export const SignUpSchema = z
  .object({
    fullName: z.string().nonempty(),
    emailAddress: z.email(),
    password: PasswordSchema,
  })
  .strict();

export const VerifyOtpSchema = z
  .object({
    emailAddress: z.email(),
    code: z.string().length(6),
  })
  .strict();

export const ResendOtpSchema = z.object({ emailAddress: z.email() }).strict();

export const ForgotPasswordSchema = z
  .object({ emailAddress: z.email() })
  .strict();

export const ResetPasswordSchema = z
  .object({
    token: z.uuid(),
    password: PasswordSchema,
  })
  .strict();

export const LoginSchema = z
  .object({
    emailAddress: z.email(),
    password: z.string().nonempty(),
  })
  .strict();

export const RefreshTokenSchema = z
  .object({ refreshToken: z.string().nonempty() })
  .strict();

export type SignUpDto = z.infer<typeof SignUpSchema>;
export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;
export type ResendOtpDto = z.infer<typeof ResendOtpSchema>;
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
