"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Chip } from "@heroui/react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-8 px-4 py-16">
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
        <Card className="space-y-5" containerClassName="w-full max-w-md animate-fade-in">
          <div className="space-y-4">
            <p className="text-sm text-default-500">
              Use your team Google account to sign in.
            </p>
            {errorMessage ? (
              <p className="text-xs text-rose-500">{errorMessage}</p>
            ) : null}
            <Button
              type="button"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
            >
              {isLoading ? "Connecting to Google..." : "Sign in with Google"}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-default-500">
            <span>Need access? Contact a coach.</span>
            <Link className="font-semibold text-primary" href="/reset-password">
              Reset password
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
