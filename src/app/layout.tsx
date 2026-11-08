import type { Metadata, Viewport } from "next";
import { Martian_Mono, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { SessionProvider, ViewAsBanner } from "@/features/auth";
import { getSession } from "@/features/auth/server";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { PicklistProvider } from "@/features/picklist/PicklistProvider";
import { serverServices } from "@/features/voice/ready";
import { AppNav, cx } from "@/ui";
import { APP_NAME, DESCRIPTION, TAGLINE } from "@/ui/brand";
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

/**
 * The name, the one line and what it is, the same words as the login page (src/ui/brand.ts). A shared link
 * (the /lever message in Slack, a mail) previews with them and `opengraph-image.png` / `twitter-image.png`
 * beside this file; the icons are `favicon.ico`, `icon.svg` and `apple-icon.png` (the F on night steel), and
 * `manifest.ts` names the installed app. Next resolves the image URLs to the deployment's own address.
 */
export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: `${TAGLINE} ${DESCRIPTION}`,
  applicationName: APP_NAME,
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    locale: "nb_NO",
    title: `${APP_NAME} · ${TAGLINE}`,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} · ${TAGLINE}`,
    description: DESCRIPTION,
  },
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
        {session && (
          // First Tab stop: past the navigation to the screen (WCAG 2.4.1, and quicker at 06:00).
          <a
            href="#innhold"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-text"
          >
            Hopp til innhold
          </a>
        )}
        <SessionProvider session={session}>
          <PicklistProvider>
            <div className="min-h-dvh lg:flex">
              {/* Not secret: the local viewer server's URL; the bell reads the same night as the pages. */}
              {/* `services`: names only (is the voice agent set up?), so the menu has no dead ends. */}
              {session && <AppNav bell={<NotificationBell viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />} services={serverServices()} />}
              {/* Room under the phone's bottom bar only when there is one (not on login or no-access). */}
              <div
                id="innhold"
                className={cx("flex min-h-dvh min-w-0 flex-1 flex-col", session && "pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0")}
              >
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
