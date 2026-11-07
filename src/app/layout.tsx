import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Martian_Mono, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { SessionProvider } from "@/features/auth/session";
import { PicklistProvider } from "@/features/picklist/PicklistProvider";
import { AppNav, ViewingAs } from "@/ui";
import "./globals.css";

// The display face: titles, the clock, room numbers, big figures (DESIGN.md "Typography").
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["500", "600"],
  axes: ["opsz"],
  variable: "--font-bodoni",
  display: "swap",
});

const grotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

const martian = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-martian",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Lobby", template: "%s | Lobby" },
  description: "Oversikt over hele hotellet, med AI.",
};

export const viewport: Viewport = {
  themeColor: "#16120f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nb" className={`${bodoni.variable} ${grotesk.variable} ${martian.variable}`}>
      <body>
        <SessionProvider>
          <PicklistProvider>
            <div className="min-h-dvh lg:flex">
              <AppNav />
              <div className="flex min-h-dvh min-w-0 flex-1 flex-col pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
                <ViewingAs />
                {children}
              </div>
            </div>
          </PicklistProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
