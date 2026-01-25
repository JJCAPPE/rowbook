import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Rowbook
          </p>
          <h1 className="text-2xl font-semibold text-ink">Log in to continue</h1>
          <p className="text-sm text-slate-600">
            Access is limited to pre-approved team emails.
          </p>
        </div>
        <Card className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="athlete@team.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="••••••••" />
          </div>
          <Button type="button" className="w-full">
            Log in
          </Button>
          <div className="flex items-center justify-between text-xs text-slate-500">
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
