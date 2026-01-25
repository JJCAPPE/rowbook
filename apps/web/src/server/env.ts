import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("proof-images"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(16),
  CRON_SECRET: z.string().min(1),
  EMAIL_FROM: z.string().email().optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_SECURE: z.coerce.boolean().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  POSTMARK_API_KEY: z.string().min(1).optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => issue.message).join(", ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsed.data;
