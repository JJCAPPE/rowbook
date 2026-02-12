export const setDefaultTestEnv = () => {
  process.env.NODE_ENV ??= "test";
  process.env.TEST_AUTH_BYPASS ??= "1";
  process.env.DATABASE_URL
    ??= "postgresql://postgres:postgres@127.0.0.1:5432/rowbook_test?schema=public";
  process.env.DIRECT_URL ??= process.env.DATABASE_URL;
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  process.env.SUPABASE_STORAGE_BUCKET ??= "proof-images";
  process.env.AUTH_SECRET ??= "test-auth-secret-with-minimum-length";
  process.env.CRON_SECRET ??= "test-cron-secret";
};
