"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { Chip } from "@heroui/react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const callbackMessages: Record<string, string> = {
  oauth_failed: "Google sign-in was cancelled or could not be completed. Please try again.",
  missing_code: "The sign-in callback was incomplete. Please start again with Google.",
  expired_code: "That sign-in attempt expired or was already used. Please start again.",
  not_approved:
    "This Google account is not approved for Rowbook. Ask your coach or administrator for access.",
  inactive:
    "This Rowbook account is inactive. Ask your coach or administrator to restore access.",
  account_error:
    "We could not verify your Rowbook access. Please try again or contact your coach.",
};

const signInStartError =
  "Google sign-in could not start. Check your connection and try again.";

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const signInPendingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (!reason) {
      return;
    }

    setErrorMessage(callbackMessages[reason] ?? callbackMessages.account_error);
  }, []);

  const handleGoogleSignIn = async () => {
    if (signInPendingRef.current) {
      return;
    }

    signInPendingRef.current = true;
    setErrorMessage(null);
    setIsLoading(true);

    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data.url) {
        throw new Error("OAuth redirect unavailable");
      }

      window.location.assign(data.url);
    } catch {
      signInPendingRef.current = false;
      setErrorMessage(signInStartError);
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-gradient-to-br from-background via-content1 to-content2">
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-6 px-4 py-10 sm:gap-8 sm:py-16">
        <div className="max-w-md space-y-3 text-center animate-fade-up">
          <Chip size="sm" variant="flat" color="primary" className="uppercase tracking-[0.24em]">
            Rowbook
          </Chip>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Log in to continue
          </h1>
          <p className="text-sm text-default-500">
            Access is limited to pre-approved team emails.
          </p>
        </div>
        <Card
          className="space-y-5 p-5 sm:p-6"
          containerClassName="w-full max-w-md animate-fade-in"
        >
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-default-500">
              Use your team Google account to sign in.
            </p>
            {errorMessage ? (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-700"
              >
                {errorMessage}
              </p>
            ) : null}
            <Button
              type="button"
              className="min-h-11 w-full"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              aria-describedby={isLoading ? "google-sign-in-status" : undefined}
            >
              {isLoading ? "Opening Google sign-in…" : "Sign in with Google"}
            </Button>
            {isLoading ? (
              <p
                id="google-sign-in-status"
                role="status"
                aria-live="polite"
                className="text-center text-xs text-default-500"
              >
                Continue in the secure Google page that opens next.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 border-t border-divider/40 pt-5 text-xs text-default-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Need access? Contact a coach.</span>
            <Link
              className="w-fit rounded-md font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              href="/reset-password"
            >
              Trouble signing in?
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
