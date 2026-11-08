import type { MetadataRoute } from "next";
import { APP_NAME, DESCRIPTION, TAGLINE } from "@/ui/brand";

/**
 * The installed app (add to home screen): the name, the one line and the L on night steel, the same mark
 * as the favicon (`src/app/icon.svg`). The icons sit in `public/`; the proxy lets them and this file through
 * without a session (`src/features/auth/access.ts`), so a phone can fetch them before anyone logs in.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} · ${TAGLINE}`,
    short_name: APP_NAME,
    description: DESCRIPTION,
    lang: "nb",
    start_url: "/",
    display: "standalone",
    background_color: "#121c24",
    theme_color: "#121c24",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
