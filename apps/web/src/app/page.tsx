import Link from "next/link";

import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 md:px-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Rowbook OYO Minutes
          </p>
          <h1 className="text-3xl font-semibold text-ink md:text-4xl">
            Track weekly training minutes with proof, clarity, and motivation.
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Rowbook helps athletes log their on-your-own workouts and gives coaches
            instant visibility into compliance, proof status, and weekly trends.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Log in
            </Link>
            <Link
              href="/athlete"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              View athlete demo
            </Link>
            <Link
              href="/coach"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
            >
              View coach demo
            </Link>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h2 className="text-lg font-semibold text-ink">Athletes</h2>
            <p className="mt-2 text-sm text-slate-600">
              Log workouts in under a minute, upload proof images, and see how close
              you are to your weekly requirement.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>• Weekly progress ring and quick log flow</li>
              <li>• Proof upload preview with validation status</li>
              <li>• Weekly history and leaderboard motivation</li>
            </ul>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold text-ink">Coaches</h2>
            <p className="mt-2 text-sm text-slate-600">
              Monitor team compliance, drill into athlete details, and manage weekly
              requirements in one place.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>• Team overview with missing minutes flags</li>
              <li>• Athlete trends and activity breakdowns</li>
              <li>• Weekly requirement and exemption management</li>
            </ul>
          </Card>
        </div>
      </section>
    </main>
  );
}
