import type { Metadata, Viewport } from "next";
import { DM_Sans, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", weight: ["400", "500", "600"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Dustline — testnet router", template: "%s · Dustline" },
  description: "Route fragmented testnet balances into the exact chain and asset you want. Live quotes, gas reserves, canonical bridges, no manufactured routes.",
  applicationName: "Dustline",
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
          <main className="mx-auto w-full max-w-[1440px] px-4 md:px-6">{children}</main>
          <Footer />
          {/* Room for the phone bottom bar. */}
          <div className="h-16 md:hidden" aria-hidden />
          <MobileNav />
        </AppProviders>
      </body>
    </html>
  );
}
