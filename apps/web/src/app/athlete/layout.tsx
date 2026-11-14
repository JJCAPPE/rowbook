import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import AthleteLayoutClient from "./layout-client";

export default function AthleteLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <AthleteLayoutClient>{children}</AthleteLayoutClient>
    </Suspense>
  );
}
