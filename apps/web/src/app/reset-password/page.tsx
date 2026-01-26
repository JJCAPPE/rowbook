import Link from "next/link";
import { Chip } from "@heroui/react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-8 px-4 py-16">
        <div className="max-w-md space-y-3 text-center animate-fade-up">
          <Chip size="sm" variant="flat" color="primary" className="uppercase tracking-[0.24em]">
            Password reset
          </Chip>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Request a reset link
          </h1>
          <p className="text-sm text-default-500">
            We will email a reset link to approved team accounts.
          </p>
        </div>
        <Card className="space-y-5" containerClassName="w-full max-w-md animate-fade-in">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="athlete@team.com" />
          </div>
          <Button type="button" className="w-full">
            Send reset link
          </Button>
          <Link className="text-center text-xs font-semibold text-primary" href="/login">
            Back to login
          </Link>
        </Card>
      </div>
    </main>
  );
}
