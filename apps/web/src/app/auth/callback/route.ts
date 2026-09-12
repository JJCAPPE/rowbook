import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/db/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginReason =
  | "oauth_failed"
  | "missing_code"
  | "expired_code"
  | "not_approved"
  | "inactive"
  | "account_error";

const redirectToLogin = (
  response: NextResponse,
  origin: string,
  reason: LoginReason,
) => {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("reason", reason);
  response.headers.set("Location", loginUrl.toString());
  return response;
};

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const response = NextResponse.redirect(new URL("/login", origin));

  if (searchParams.has("error")) {
    return redirectToLogin(response, origin, "oauth_failed");
  }

  if (!code) {
    return redirectToLogin(response, origin, "missing_code");
  }

  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
    },
  });

  const redirectAfterSignOut = async (reason: LoginReason) => {
    await supabase.auth.signOut().catch(() => undefined);
    return redirectToLogin(response, origin, reason);
  };

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirectAfterSignOut("expired_code");
    }
  } catch {
    return redirectAfterSignOut("expired_code");
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.email) {
      return redirectAfterSignOut("account_error");
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: userData.user.email },
      select: { role: true, status: true },
    });

    if (!dbUser) {
      return redirectAfterSignOut("not_approved");
    }

    if (dbUser.status !== "ACTIVE") {
      return redirectAfterSignOut("inactive");
    }

    const redirectPath =
      dbUser.role === "COACH" || dbUser.role === "ADMIN" ? "/coach" : "/athlete";

    response.headers.set("Location", new URL(redirectPath, origin).toString());
    return response;
  } catch {
    return redirectAfterSignOut("account_error");
  }
}
