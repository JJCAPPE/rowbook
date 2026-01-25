import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { CookieMethodsServer } from "@supabase/ssr";

import { env } from "@/server/env";

export const createSupabaseServerClient = (cookies: CookieMethodsServer) =>
  createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { cookies });
