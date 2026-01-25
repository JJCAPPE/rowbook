import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/db/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const response = NextResponse.redirect(new URL("/login", origin));

  if (!code) {
    return response;
  }

  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return response;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    return response;
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: userData.user.email },
  });

  if (!dbUser || dbUser.status !== "ACTIVE") {
    return response;
  }

  const redirectPath =
    dbUser.role === "COACH" || dbUser.role === "ADMIN" ? "/coach" : "/athlete";

  response.headers.set("Location", new URL(redirectPath, origin).toString());
  return response;
}
