import type { Metadata, Viewport } from "next";
import { DM_Sans, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers";
import { Header } from "@/components/header";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", weight: ["400", "500", "600"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Testnet Router",
  description: "Multi-chain testnet asset router and dust consolidator",
};

export const viewport: Viewport = {
  themeColor: "#0B0C0E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${inter.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>
        <AppProviders>
          <Header />
          <main className="mx-auto w-full max-w-[1440px] px-4 pb-24 md:px-6">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
