import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers";
import { Footer } from "@/components/footer";
import { WatchAddressLink } from "@/components/watch-address";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://routedust.xyz"),
  title: { default: "RouteDust — testnet router", template: "%s · RouteDust" },
  description: "Route fragmented testnet balances into the exact chain and asset you want. Live quotes, gas reserves, canonical bridges, no manufactured routes.",
  applicationName: "RouteDust",
  openGraph: {
    title: "RouteDust — testnet router",
    description: "Scan a wallet across 20 testnets, quote only live capabilities, reserve gas, simulate before every signature, never burn twice.",
    url: "https://routedust.xyz",
    siteName: "RouteDust",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the persisted theme before the first paint so a light-theme user
 * never sees a dark flash. Reads the Zustand persist entry (`testnet-router:v1`)
 * and falls back to dark, the store default.
 */
const THEME_BOOT = `(function(){try{var s=JSON.parse(localStorage.getItem("testnet-router:v1"));var t=s&&s.state&&s.state.settings&&s.state.settings.theme;document.documentElement.dataset.theme=t==="light"?"light":"dark";}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${plexMono.variable}`} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <AppProviders>
          <Suspense fallback={null}>
            <WatchAddressLink />
          </Suspense>
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
