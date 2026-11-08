import type { Metadata } from "next";
import { safeNext } from "@/features/auth/access";
import { authConfig } from "@/features/auth/config";
import { LoginForm } from "@/features/auth/LoginForm";
import { Card, VantaBackdrop } from "@/ui";
import { APP_NAME, DESCRIPTION, TAGLINE } from "@/ui/brand";

export const metadata: Metadata = { title: "Logg inn", robots: { index: false, follow: false } };

// A logged-in visitor never gets here: the proxy sends them on to `next` or home.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  return (
    <main data-surface="dark" className="relative isolate flex flex-1 items-center justify-center overflow-hidden bg-bg px-4 py-12 text-text md:px-8">
      <VantaBackdrop />
      <div className="relative z-10 w-full max-w-sm">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-[-0.03em]">{APP_NAME}</h1>
          {/* The one line (src/ui/brand.ts), then what it is: the same words as the metadata and the README. */}
          <p className="mt-2 text-lg font-semibold">{TAGLINE}</p>
          <p className="mt-1 text-base text-muted">{DESCRIPTION}</p>
        </header>
        <Card className="p-6">
          <LoginForm next={safeNext(typeof next === "string" ? next : undefined)} unavailable={!authConfig().ok} />
        </Card>
        <p className="mt-6 text-sm text-muted">Mangler du tilgang? Spør den som drifter {APP_NAME} på hotellet.</p>
      </div>
    </main>
  );
}
