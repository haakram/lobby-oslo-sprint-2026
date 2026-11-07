import type { Metadata, Viewport } from "next";
import { Martian_Mono, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { SessionProvider, ViewAsBanner } from "@/features/auth";
import { getSession } from "@/features/auth/server";
import { PicklistProvider } from "@/features/picklist/PicklistProvider";
import { AppNav } from "@/ui";
import "./globals.css";

const grotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

const martian = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-martian",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Lobby", template: "%s | Lobby" },
  description: "Oversikt over hele hotellet, med AI.",
};

export const viewport: Viewport = {
  themeColor: "#121c24",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The proxy has already turned away anyone without access; this only tells the UI who is here.
  const session = await getSession();
  return (
    <html lang="nb" className={`${grotesk.variable} ${martian.variable}`}>
      <body>
        <SessionProvider session={session}>
          <PicklistProvider>
            <div className="min-h-dvh lg:flex">
              {session && <AppNav />}
              <div className="flex min-h-dvh min-w-0 flex-1 flex-col pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
                <ViewAsBanner />
                {children}
              </div>
            </div>
          </PicklistProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
