import Link from "next/link";
import { Chip } from "@heroui/react";

import { Card } from "@/components/ui/card";

export default function ResetPasswordPage() {
  return (
    <main className="min-h-dvh bg-gradient-to-br from-background via-content1 to-content2">
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-6 px-4 py-10 sm:gap-8 sm:py-16">
        <div className="max-w-md space-y-3 text-center animate-fade-up">
          <Chip size="sm" variant="flat" color="primary" className="uppercase tracking-[0.24em]">
            Sign-in help
          </Chip>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Trouble signing in?
          </h1>
          <p className="text-sm leading-relaxed text-default-500">
            Rowbook uses Google sign-in and does not store a separate password.
          </p>
        </div>
        <Card
          className="space-y-6 p-5 sm:p-6"
          containerClassName="w-full max-w-md animate-fade-in"
        >
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">
              Use your approved Google account
            </h2>
            <p className="text-sm leading-relaxed text-default-500">
              Return to sign-in and choose the team Google account your coach approved.
            </p>
          </div>
          <ol className="space-y-4 text-sm text-default-600">
            <li className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700"
              >
                1
              </span>
              <span className="leading-relaxed">
                If you forgot your Google password, use Google&apos;s{" "}
                <a
                  className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  href="https://accounts.google.com/signin/recovery"
                  target="_blank"
                  rel="noreferrer"
                >
                  account recovery page
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                .
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700"
              >
                2
              </span>
              <span className="leading-relaxed">
                If Rowbook says the account is not approved or inactive, contact your
                coach or administrator. Only they can change team access.
              </span>
            </li>
          </ol>
          <Link
            href="/login"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Back to sign in
          </Link>
        </Card>
      </div>
    </main>
  );
}
