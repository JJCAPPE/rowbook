import type { ReactNode } from "react";

export const metadata = {
  title: "Rowbook",
  description: "Rowing Team OYO minutes app",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
