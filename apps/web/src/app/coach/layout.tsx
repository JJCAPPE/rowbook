import type { ReactNode } from "react";
import { Suspense } from "react";
import CoachLayoutClient from "./layout-client";

export default function CoachLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <CoachLayoutClient>{children}</CoachLayoutClient>
    </Suspense>
  );
}
