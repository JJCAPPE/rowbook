import { createClient } from "@supabase/supabase-js";
import { env } from "@/server/env";

export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);

export const storageBucket = env.SUPABASE_STORAGE_BUCKET;
