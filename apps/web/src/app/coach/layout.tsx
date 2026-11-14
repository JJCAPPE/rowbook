import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import CoachLayoutClient from "./layout-client";

export default function CoachLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <CoachLayoutClient>{children}</CoachLayoutClient>
    </Suspense>
  );
}
