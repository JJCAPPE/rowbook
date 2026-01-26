import "./globals.css";
import { Manrope, Sora } from "next/font/google";
import { Providers } from "./providers";

export const metadata = {
  title: "Rowbook",
  description: "Rowing team OYO minutes app",
};

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
      </body>
    </html>
  );
}
