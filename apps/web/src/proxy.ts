import type { NextRequest } from "next/server";

import { updateSupabaseSession } from "@/lib/supabase/proxy";

export const proxy = (request: NextRequest) => updateSupabaseSession(request);

export const config = {
  matcher: [
    "/",
    "/login",
    "/athlete/:path*",
    "/coach/:path*",
    "/api/trpc/:path*",
  ],
};
