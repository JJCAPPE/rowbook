import "./globals.css";
import { Inter } from "next/font/google";

export const metadata = {
  title: "Rowbook",
  description: "Rowing team OYO minutes app",
};

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
