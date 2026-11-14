import "./globals.css";
import type { Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "./providers";

export const metadata = {
  title: { default: "Rowbook", template: "%s | Rowbook" },
  description: "Rowing team OYO minutes app",
  other: { "text-scale": "scale" },
};

export const viewport: Viewport = { viewportFit: "cover" };

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light" data-theme="light">
      <body className={`${manrope.variable} ${sora.variable} bg-background text-foreground`}>
        <Providers>{children}</Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
