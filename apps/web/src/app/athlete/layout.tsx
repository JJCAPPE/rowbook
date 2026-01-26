import type { ReactNode } from "react";
import { Suspense } from "react";
import AthleteLayoutClient from "./layout-client";

export default function AthleteLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AthleteLayoutClient>{children}</AthleteLayoutClient>
    </Suspense>
  );
}
