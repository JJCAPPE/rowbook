import "server-only";

import { parse, serialize } from "cookie";
import type { CookieMethodsServer } from "@supabase/ssr";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appendHeader, type ResponseHeaders } from "@/server/auth/headers";

const buildCookieStore = (
  req: Request,
  responseHeaders: ResponseHeaders,
): CookieMethodsServer => ({
  getAll: () => {
    const header = req.headers.get("cookie");
    if (!header) {
      return [];
    }

    const parsed = parse(header);
    return Object.entries(parsed).map(([name, value]) => ({ name, value }));
  },
  setAll: (cookiesToSet) => {
    cookiesToSet.forEach(({ name, value, options }) => {
      appendHeader(
        responseHeaders,
        "Set-Cookie",
        serialize(name, value, options),
      );
    });
  },
});

export const createSupabaseServerClientFromRequest = (
  req: Request,
  responseHeaders: ResponseHeaders,
) => createSupabaseServerClient(buildCookieStore(req, responseHeaders));
