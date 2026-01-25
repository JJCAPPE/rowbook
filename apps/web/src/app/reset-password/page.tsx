import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Password reset
          </p>
          <h1 className="text-2xl font-semibold text-ink">Request a reset link</h1>
          <p className="text-sm text-slate-600">
            We’ll email a reset link to approved team accounts.
          </p>
        </div>
        <Card className="space-y-5">
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
